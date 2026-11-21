#!/usr/bin/env python3
"""General names for the factors and outcomes on every finding card (second LLM pass).

The cards keep the abstract's own words ("MindfulAgents", "momentary stress"), which is
what the screens quote. A question uses general words ("mental health apps", "stress").
This pass asks the LLM, once per talk, for 1-3 general names of each card phrase and for
what the talk is about overall. They are used only for matching on the phone, never
shown as a quote.

Input:  data/processed/angles.json (scripts/build_angles.py, first run)
Output: data/processed/concepts_raw/shard_<k>.json
  {"<item id>": {"terms": {"mindfulagents": ["mindfulness app", "mental health app"]},
                 "about": {"factors": ["..."], "outcomes": ["..."], "people": ["..."]}}}

A second task (--task claims) rewrites every card as a claim in question words
("mental health app" -> "stress", with the card's own direction), so a question in
general words meets the talk even when the abstract names only its system.
Output: data/processed/concepts_raw/claims_shard_<k>.json  {"<id>": {"claims": [[card, factor, outcome]]}}

  sbatch scripts/gen_concepts.slurm
  CHI_TASK=claims sbatch scripts/gen_concepts.slurm
"""
import argparse
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402
from gen_findings import EFFECTS  # noqa: E402

GEN_MODEL = os.environ.get("CHI_GEN_MODEL", "Qwen/Qwen3-14B")
BATCH = int(os.environ.get("CHI_GEN_BATCH", "32"))
PROC = os.path.join(config.ROOT, "data", "processed")
OUT_DIR = os.path.join(PROC, "concepts_raw")

SYSTEM = "You map research phrases to the general words researchers use when they ask questions."

PROMPT = """{kind} at CHI 2026: "{title}"
Abstract: {abstract}

Phrases from this abstract:
{phrases}

1. For every phrase, give 1 to 3 general names a researcher could use for it in a research question, from specific to broad (2-4 words each, lower case). Name the kind of thing, not the system: e.g. "SketchPal" (a named drawing tool) -> "drawing tool", "creativity support tool"; "error rate on typed passwords" -> "typing errors", "accuracy"; "dwell time on the map" -> "attention", "engagement".
2. Say what the work is about overall, in the same general words: up to 3 factors (what is varied, built or studied), up to 3 outcomes (what it affects or is measured on), and up to 2 groups of people or settings.

Return only JSON: {{"terms": {{"<phrase>": ["...", "..."], ...}}, "about": {{"factors": [...], "outcomes": [...], "people": [...]}}}}"""

CLAIM_PROMPT = """{kind} at CHI 2026: "{title}"
Abstract: {abstract}

Findings extracted from this abstract (factor -> outcome, effect):
{cards}

Rewrite each finding as a general research claim in the words a researcher would type as a question, so that people who ask about the topic in general find it. Name the field or application, not the system's name: e.g. a named sign-language tutor -> "sign language learning app"; a named drone controller -> "drone control interface". Keep the same direction.

Return only JSON: {{"claims": [{{"card": <number>, "factor": "2-4 general words", "outcome": "1-3 general words"}}, ...]}} with one entry per finding, in the same order."""


def clean_list(v, k=3):
    out = []
    for x in v if isinstance(v, list) else []:
        if isinstance(x, str):
            x = " ".join(x.lower().split()).strip(" .,;")
            if x and len(x.split()) <= 5 and x not in out:
                out.append(x)
    return out[:k]


def parse(text, phrases):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    terms = {}
    raw = obj.get("terms") if isinstance(obj.get("terms"), dict) else {}
    low = {k.lower().strip(): v for k, v in raw.items() if isinstance(k, str)}
    for p in phrases:
        t = clean_list(low.get(p))
        if t:
            terms[p] = t
    ab = obj.get("about") if isinstance(obj.get("about"), dict) else {}
    return {"terms": terms, "about": {"factors": clean_list(ab.get("factors")),
                                      "outcomes": clean_list(ab.get("outcomes")),
                                      "people": clean_list(ab.get("people"), 2)}}


def parse_claims(text, n):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    out = []
    for c in obj.get("claims") or []:
        if not isinstance(c, dict):
            continue
        try:
            k = int(c.get("card"))
        except (TypeError, ValueError):
            continue
        f, o = clean_list([c.get("factor")], 1), clean_list([c.get("outcome")], 1)
        if 1 <= k <= n and f and o:
            out.append([k - 1, f[0], o[0]])
    return {"claims": out}


def todo_items():
    with open(os.path.join(PROC, "program.json"), encoding="utf-8") as f:
        prog = {str(it["id"]): it for it in json.load(f)}
    with open(os.path.join(PROC, "angles.json"), encoding="utf-8") as f:
        ang = json.load(f)
    ph = ang["phrases"]
    out = []
    for xid, rec in ang["items"].items():
        it = prog[xid]
        seen = []
        for c in rec["cards"]:
            for k in (c[0], c[1]):
                if ph[k] not in seen:
                    seen.append(ph[k])
        for m in rec.get("measures", []):
            if ph[m[0]] not in seen:
                seen.append(ph[m[0]])
        cards = [f"{k + 1}. {ph[c[0]]} -> {ph[c[1]]}, {EFFECTS[c[3]]}" for k, c in enumerate(rec["cards"])]
        out.append({"id": xid, "type": it["type"], "title": it["title"], "abstract": it["abstract"],
                    "phrases": seen[:16], "cards": cards})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--of", type=int, default=1)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--task", default="terms", choices=["terms", "claims"])
    args = ap.parse_args()
    claims = args.task == "claims"

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    os.environ.setdefault("HF_HOME", config.HF_CACHE)
    todo = todo_items()[args.shard::args.of]
    if claims:
        todo = [it for it in todo if it["cards"]]
    if args.limit:
        todo = todo[:args.limit]
    os.makedirs(OUT_DIR, exist_ok=True)
    pre = "claims_" if claims else ""
    out_path = os.path.join(OUT_DIR, f"{pre}sample.json" if args.limit else f"{pre}shard_{args.shard}.json")
    done = {}
    if os.path.exists(out_path) and not args.limit:
        with open(out_path, encoding="utf-8") as f:
            done = json.load(f)
    todo = [it for it in todo if it["id"] not in done]
    todo.sort(key=lambda it: -len(it["abstract"]))
    tok = AutoTokenizer.from_pretrained(GEN_MODEL, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(GEN_MODEL, dtype=torch.bfloat16, device_map="cuda")
    model.eval()
    print(f"Loaded {GEN_MODEL} | shard {args.shard}/{args.of} N={len(todo)}", flush=True)

    def chat(r):
        if claims:
            p = CLAIM_PROMPT.format(kind=r["type"], title=r["title"], abstract=r["abstract"][:2500],
                                    cards="\n".join(r["cards"]))
            return tok.apply_chat_template([{"role": "system", "content": SYSTEM},
                                            {"role": "user", "content": p}],
                                           tokenize=False, add_generation_prompt=True, enable_thinking=False)
        p = PROMPT.format(kind=r["type"], title=r["title"], abstract=r["abstract"][:2500],
                          phrases="\n".join(f"- {x}" for x in r["phrases"]) or "- (none)")
        return tok.apply_chat_template([{"role": "system", "content": SYSTEM}, {"role": "user", "content": p}],
                                       tokenize=False, add_generation_prompt=True, enable_thinking=False)

    @torch.no_grad()
    def generate(texts, max_new=700):
        enc = tok(texts, return_tensors="pt", padding=True).to("cuda")
        gen = model.generate(**enc, max_new_tokens=max_new, do_sample=False, temperature=None, top_p=None,
                             top_k=None, pad_token_id=tok.pad_token_id)
        return tok.batch_decode(gen[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)

    t0, bad = time.time(), 0
    for b in range(0, len(todo), BATCH):
        recs = todo[b:b + BATCH]
        outs = generate([chat(r) for r in recs])
        for r, o in zip(recs, outs):
            pf = (lambda t: parse_claims(t, len(r["cards"]))) if claims else (lambda t: parse(t, r["phrases"]))
            got = pf(o)
            if got is None:
                got = pf(generate([chat(r)], max_new=1000)[0])
            if got is None:
                bad += 1
                got = {"claims": [], "failed": True} if claims else \
                    {"terms": {}, "about": {"factors": [], "outcomes": [], "people": []}, "failed": True}
            done[r["id"]] = got
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(done, f, ensure_ascii=False)
        print(f"{min(b + BATCH, len(todo))}/{len(todo)}  {(time.time() - t0) / 60:.1f} min  failed {bad}", flush=True)
        if args.limit:
            for r in recs:
                print(json.dumps({"title": r["title"], **done[r["id"]]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
