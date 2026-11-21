#!/usr/bin/env python3
"""Generate synthetic research-topic queries for every paper (run on a GPU node).

There are no real "topic -> relevant paper" labels, so we synthesize them
(GPL / doc2query style): a local instruction LLM reads each paper's title +
abstract and writes the short research-topic queries a researcher might type
into the chatbot when this paper would be a great match. Each (query, paper)
pair becomes a positive training example for contrastive fine-tuning.

Per paper: 3 English + 2 Korean queries (users may type either language).

Output: data/processed/synth_queries.json
  [{"id": <paper id>, "lang": "en"|"ko", "query": "..."}, ...]
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

SYSTEM = ("You help build a conference paper recommender. You write short search "
          "queries that researchers type to describe their own research topic.")

PROMPT = """Paper title: {title}

Abstract: {abstract}

Write queries a researcher might type into a conference recommender to describe THEIR OWN research topic, such that this paper would be one of the most relevant papers for them.
- 3 English queries and 2 Korean queries.
- Each 3-12 words, phrased like a research topic (not a question, not the paper title).
- Vary them: one broad area, one specific method/problem, one application/user-group angle.
- Korean queries should be natural Korean a Korean HCI researcher would write (English technical terms allowed).

Return only JSON: {{"en": ["...", "...", "..."], "ko": ["...", "..."]}}"""


def parse(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    out = []
    for lang, n in (("en", 3), ("ko", 2)):
        qs = obj.get(lang) or []
        if not isinstance(qs, list):
            return None
        for q in qs[:n]:
            if isinstance(q, str) and 2 <= len(q.split()) <= 20:
                out.append((lang, q.strip()))
    return out or None


def main():
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    os.environ.setdefault("HF_HOME", config.HF_CACHE)
    with open(config.CORPUS, encoding="utf-8") as f:
        corpus = json.load(f)

    tok = AutoTokenizer.from_pretrained(GEN_MODEL, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(
        GEN_MODEL, torch_dtype=torch.bfloat16, device_map="cuda")
    model.eval()
    print(f"Loaded {GEN_MODEL} on {torch.cuda.get_device_name(0)} | N={len(corpus)}",
          flush=True)

    def prompts(recs):
        return [tok.apply_chat_template(
            [{"role": "system", "content": SYSTEM},
             {"role": "user", "content": PROMPT.format(
                 title=r["title"], abstract=r["abstract"][:2500])}],
            tokenize=False, add_generation_prompt=True) for r in recs]

    @torch.no_grad()
    def generate(recs):
        enc = tok(prompts(recs), return_tensors="pt", padding=True).to("cuda")
        out = model.generate(**enc, max_new_tokens=220, do_sample=True,
                             temperature=0.7, top_p=0.9,
                             pad_token_id=tok.eos_token_id)
        return tok.batch_decode(out[:, enc["input_ids"].shape[1]:],
                                skip_special_tokens=True)

    rows, failed = [], []
    t0 = time.time()
    for b in range(0, len(corpus), BATCH):
        recs = corpus[b:b + BATCH]
        for r, text in zip(recs, generate(recs)):
            qs = parse(text)
            if qs is None:
                failed.append(r)
            else:
                rows += [{"id": r["id"], "lang": l, "query": q} for l, q in qs]
        done = min(b + BATCH, len(corpus))
        print(f"{done}/{len(corpus)} papers | {len(rows)} queries | "
              f"{len(failed)} failed | {time.time()-t0:.0f}s", flush=True)

    # one retry pass for unparseable outputs
    if failed:
        retry, failed = failed, []
        for b in range(0, len(retry), BATCH):
            recs = retry[b:b + BATCH]
            for r, text in zip(recs, generate(recs)):
                qs = parse(text)
                if qs is None:
                    failed.append(r["id"])
                else:
                    rows += [{"id": r["id"], "lang": l, "query": q} for l, q in qs]
        print(f"retry done | still failed: {len(failed)}", flush=True)

    out_path = os.path.join(config.ROOT, "data", "processed", "synth_queries.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=0)
    print(f"Saved {len(rows)} queries for {len({r['id'] for r in rows})} papers "
          f"to {out_path} in {time.time()-t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
