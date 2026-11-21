#!/usr/bin/env python3
"""One-line summaries and questions for every program item, written offline (GPU node).

Two things in the wireframes needed an LLM on a server: the one-line summary of a talk
(06 paper, 10 session live) and "Prepare a question". The program is fixed before the
conference, so a local LLM writes both once for every item here, and the phone only
looks them up. Greedy decoding, so a rerun gives the same text.

Output: data/processed/summaries.json
  {"<item id>": {"summary": "...", "questions": ["...", "..."]}, ...}
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402

GEN_MODEL = os.environ.get("CHI_GEN_MODEL", "Qwen/Qwen2.5-7B-Instruct")
BATCH = int(os.environ.get("CHI_GEN_BATCH", "48"))

SYSTEM = ("You write for a conference app. Attendees read your text on a phone while "
          "deciding which talk to go to.")

PROMPT = """{kind} at CHI 2026: {title}

Abstract: {abstract}

1. Summarize it in ONE plain English sentence of at most 25 words: what was done and what was found or offered. Do not start with "This paper", "This study" or the title.
2. Write 2 short questions (at most 20 words each) an attendee could ask the presenters afterwards. Make them specific to this work.

Return only JSON: {{"summary": "...", "questions": ["...", "..."]}}"""


def parse(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    s, q = obj.get("summary"), obj.get("questions")
    if not isinstance(s, str) or not s.strip() or not isinstance(q, list):
        return None
    q = [x.strip() for x in q if isinstance(x, str) and x.strip()][:2]
    if len(s.split()) > 40 or len(q) < 2:
        return None
    return {"summary": s.strip(), "questions": q}


def main():
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    os.environ.setdefault("HF_HOME", config.HF_CACHE)
    with open(os.path.join(config.ROOT, "data", "processed", "program.json"), encoding="utf-8") as f:
        items = [it for it in json.load(f) if it["abstract"].strip()]
    # a talk listed twice gets one summary
    seen, todo = set(), []
    for it in items:
        key = (it["type"], it["title"].strip().lower())
        if key not in seen:
            seen.add(key)
            todo.append(it)
    tok = AutoTokenizer.from_pretrained(GEN_MODEL, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(GEN_MODEL, torch_dtype=torch.bfloat16, device_map="cuda")
    model.eval()
    print(f"Loaded {GEN_MODEL} on {torch.cuda.get_device_name(0)} | N={len(todo)}", flush=True)

    def prompts(recs):
        return [tok.apply_chat_template(
            [{"role": "system", "content": SYSTEM},
             {"role": "user", "content": PROMPT.format(kind=r["type"], title=r["title"],
                                                       abstract=r["abstract"][:2500])}],
            tokenize=False, add_generation_prompt=True) for r in recs]

    @torch.no_grad()
    def generate(recs, sample=False):
        enc = tok(prompts(recs), return_tensors="pt", padding=True).to("cuda")
        kw = dict(do_sample=True, temperature=0.7, top_p=0.95) if sample else dict(do_sample=False)
        out = model.generate(**enc, max_new_tokens=160, pad_token_id=tok.eos_token_id, **kw)
        return tok.batch_decode(out[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)

    res, failed, t0 = {}, [], time.time()
    todo.sort(key=lambda r: len(r["abstract"]))      # similar lengths per batch: less padding
    for b in range(0, len(todo), BATCH):
        recs = todo[b:b + BATCH]
        for r, text in zip(recs, generate(recs)):
            x = parse(text)
            if x is None:
                failed.append(r)
            else:
                res[str(r["id"])] = x
        print(f"{min(b + BATCH, len(todo))}/{len(todo)} | failed {len(failed)} | {time.time() - t0:.0f}s", flush=True)
    torch.manual_seed(7)
    for attempt in range(2):
        if not failed:
            break
        retry, failed = failed, []
        for b in range(0, len(retry), BATCH):
            recs = retry[b:b + BATCH]
            for r, text in zip(recs, generate(recs, sample=True)):
                x = parse(text)
                if x is None:
                    failed.append(r)
                else:
                    res[str(r["id"])] = x
        print(f"retry {attempt + 1}: still failed {len(failed)}", flush=True)
    # the second listing of a talk shares the first one's text
    by_key = {(it["type"], it["title"].strip().lower()): str(it["id"]) for it in todo}
    for it in items:
        k = by_key[(it["type"], it["title"].strip().lower())]
        if str(it["id"]) not in res and k in res:
            res[str(it["id"])] = res[k]
    path = os.path.join(config.ROOT, "data", "processed", "summaries.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=0)
    print(f"Saved {len(res)} summaries to {path} in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
