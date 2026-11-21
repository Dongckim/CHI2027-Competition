#!/usr/bin/env python3
"""Document expansion (doc2query): new search phrases for every paper (GPU node).

The on-device ranking matches words (BM25) and meaning (student encoder). Words
fail when a user says it differently from the abstract ("self-driving" vs
"autonomous vehicles"). Here a local LLM writes, for each paper, short phrases
people might type to find it, on purpose in other words than the abstract; the
phrases are added to that paper's keyword index. Nothing extra runs on the phone.

These are a NEW sample, separate from data/processed/synth_queries.json (the
training/evaluation queries): different prompt, different seed, so held-out
evaluation queries never leak into the index.

Output: data/processed/doc_expansions.json   {"<paper id>": ["phrase", ...], ...}
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
SEED = 7

SYSTEM = ("You help a conference search engine find papers. You write the short "
          "phrases people type into a search box.")

PROMPT = """Paper title: {title}

Abstract: {abstract}

Write 8 different short English search phrases (2-6 words each) that someone looking for this paper might type.
- Use words a researcher from a neighbouring field or a newcomer would use; prefer synonyms, everyday words and common abbreviations over the exact wording of the title and abstract.
- Cover different angles: the topic, the people/users involved, the method or technology, the application domain.
- No full sentences, no questions, no quotation of the title.

Return only JSON: {{"phrases": ["...", "..."]}}"""


def parse(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    ph = obj.get("phrases")
    if not isinstance(ph, list):
        return None
    out = [p.strip() for p in ph if isinstance(p, str) and 1 <= len(p.split()) <= 8]
    return out[:8] or None


def main():
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    os.environ.setdefault("HF_HOME", config.HF_CACHE)
    torch.manual_seed(SEED)
    with open(config.CORPUS, encoding="utf-8") as f:
        corpus = json.load(f)
    tok = AutoTokenizer.from_pretrained(GEN_MODEL, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(
        GEN_MODEL, torch_dtype=torch.bfloat16, device_map="cuda")
    model.eval()
    print(f"Loaded {GEN_MODEL} on {torch.cuda.get_device_name(0)} | N={len(corpus)}", flush=True)

    def prompts(recs):
        return [tok.apply_chat_template(
            [{"role": "system", "content": SYSTEM},
             {"role": "user", "content": PROMPT.format(
                 title=r["title"], abstract=r["abstract"][:2500])}],
            tokenize=False, add_generation_prompt=True) for r in recs]

    @torch.no_grad()
    def generate(recs):
        enc = tok(prompts(recs), return_tensors="pt", padding=True).to("cuda")
        out = model.generate(**enc, max_new_tokens=200, do_sample=True,
                             temperature=0.8, top_p=0.95, pad_token_id=tok.eos_token_id)
        return tok.batch_decode(out[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)

    res, failed, t0 = {}, [], time.time()
    for b in range(0, len(corpus), BATCH):
        recs = corpus[b:b + BATCH]
        for r, text in zip(recs, generate(recs)):
            ph = parse(text)
            if ph is None:
                failed.append(r)
            else:
                res[str(r["id"])] = ph
        print(f"{min(b + BATCH, len(corpus))}/{len(corpus)} | failed {len(failed)} | "
              f"{time.time() - t0:.0f}s", flush=True)
    for attempt in range(2):
        if not failed:
            break
        retry, failed = failed, []
        for b in range(0, len(retry), BATCH):
            recs = retry[b:b + BATCH]
            for r, text in zip(recs, generate(recs)):
                ph = parse(text)
                if ph is None:
                    failed.append(r)
                else:
                    res[str(r["id"])] = ph
        print(f"retry {attempt + 1}: still failed {len(failed)}", flush=True)

    path = os.path.join(config.ROOT, "data", "processed", "doc_expansions.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=0)
    print(f"Saved {sum(map(len, res.values()))} phrases for {len(res)} papers to {path} "
          f"in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
