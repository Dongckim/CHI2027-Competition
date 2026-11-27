#!/usr/bin/env python3
"""Sixth LLM pass: each card's finding in one plain sentence, for the "why" line on screen.

The why line was built from the card's phrases ("Looks at another factor behind games are
experienced: shared practices."), which read badly when a phrase is a fragment. The LLM
writes the finding once per card, faithful to its sentence and short; the screens put it
after a lead in the asker's own words ("Another factor behind presence: …").

Input:  data/processed/angles.json (result and claim cards), program.json
Output: data/processed/cardsum_raw/shard_<k>.json  {"<id>": {"<card index>": "sentence"}}

  sbatch scripts/gen_card_summary.slurm
"""

import argparse
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402
from gen_findings import EFFECTS, STATUS, split_sentences  # noqa: E402

GEN_MODEL = os.environ.get("CHI_GEN_MODEL", "Qwen/Qwen3-14B")
BATCH = int(os.environ.get("CHI_GEN_BATCH", "32"))
PROC = os.path.join(config.ROOT, "data", "processed")
OUT_DIR = os.path.join(PROC, "cardsum_raw")

SYSTEM = "You restate results from CHI conference abstracts in plain words, adding nothing the sentence does not say."

PROMPT = """{kind} at CHI 2026: "{title}"

Findings taken from its abstract, each with its sentence:
{cards}

For each finding, write one plain sentence of at most 18 words saying what this work found or offers about the factor and the outcome, as a researcher would tell a colleague. Past tense for results ("Face-swapped GIFs made close friends feel more present and intimate."); present tense for what a system offers. Keep the work's own names but say what they are when it helps. Add nothing the sentence does not support, no numbers unless they matter, no "the paper" or "this study".

Return one JSON object: {{"results": [{{"n": number, "text": "..."}}, ...]}}, one entry per finding, in order. Return only the JSON object."""



def parse(text, n):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    out = {}
    for r in (obj.get("results") or []) if isinstance(obj, dict) else []:
        if not isinstance(r, dict):
            continue
        try:
            k = int(r.get("n"))
        except (TypeError, ValueError):
            continue
        t = " ".join(str(r.get("text") or "").split())
        if 1 <= k <= n and 3 <= len(t.split()) <= 30:
            out[k] = t
    return out if out else None


def todo_items():
    with open(os.path.join(PROC, "program.json"), encoding="utf-8") as f:
        prog = {str(it["id"]): it for it in json.load(f)}
    with open(os.path.join(PROC, "angles.json"), encoding="utf-8") as f:
        ang = json.load(f)
    ph = ang["phrases"]
    out = []
    for xid, rec in ang["items"].items():
        ab = prog[xid]["abstract"]
        idx, lines = [], []
        for k, c in enumerate(rec["cards"]):
            if STATUS[c[4]] not in ("result", "claim"):
                continue
            idx.append(k)
            lines.append(f'{len(idx)}. factor "{ph[c[0]]}" -> outcome "{ph[c[1]]}" ({EFFECTS[c[3]]})\n'
                         f'   sentence: {" ".join(ab[c[5]:c[6]].split())}')
        if idx:
            out.append({"id": xid, "type": prog[xid]["type"], "title": prog[xid]["title"],
                        "idx": idx, "cards": "\n".join(lines)})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--of", type=int, default=1)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    os.environ.setdefault("HF_HOME", config.HF_CACHE)
    todo = todo_items()[args.shard::args.of]
    if args.limit:
        todo = todo[:args.limit]
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, "sample.json" if args.limit else f"shard_{args.shard}.json")
    done = {}
    if os.path.exists(out_path) and not args.limit:
        with open(out_path, encoding="utf-8") as f:
            done = json.load(f)
    todo = [it for it in todo if it["id"] not in done]
    todo.sort(key=lambda it: -len(it["cards"]))
    tok = AutoTokenizer.from_pretrained(GEN_MODEL, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(GEN_MODEL, dtype=torch.bfloat16, device_map="cuda")
    model.eval()
    print(f"Loaded {GEN_MODEL} on {torch.cuda.get_device_name(0)} | shard {args.shard}/{args.of} "
          f"N={len(todo)}", flush=True)

    def chat(r, extra=""):
        p = PROMPT.format(kind=r["type"], title=r["title"], cards=r["cards"]) + extra
        return tok.apply_chat_template([{"role": "system", "content": SYSTEM}, {"role": "user", "content": p}],
                                       tokenize=False, add_generation_prompt=True, enable_thinking=False)

    @torch.no_grad()
    def generate(texts, max_new=600):
        enc = tok(texts, return_tensors="pt", padding=True).to("cuda")
        gen = model.generate(**enc, max_new_tokens=max_new, do_sample=False, temperature=None, top_p=None,
                             top_k=None, pad_token_id=tok.pad_token_id)
        return tok.batch_decode(gen[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)

    t0, bad = time.time(), 0
    for b in range(0, len(todo), BATCH):
        recs = todo[b:b + BATCH]
        outs = generate([chat(r) for r in recs])
        for r, o in zip(recs, outs):
            got = parse(o, len(r["idx"]))
            if got is None:
                got = parse(generate([chat(r, "\nReturn valid JSON only.")])[0], len(r["idx"]))
            if got is None:
                bad += 1
                got = {}
            done[r["id"]] = {str(r["idx"][n - 1]): v for n, v in got.items()}
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(done, f, ensure_ascii=False)
        print(f"{min(b + BATCH, len(todo))}/{len(todo)}  {(time.time() - t0) / 60:.1f} min  failed {bad}", flush=True)
        if args.limit:
            for r in recs:
                print(r["cards"], "\n->", done[r["id"]], flush=True)


if __name__ == "__main__":
    main()
