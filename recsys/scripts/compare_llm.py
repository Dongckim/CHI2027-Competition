#!/usr/bin/env python3
"""A general LLM sorts the same candidates the Arc engine sorts (GPU node).

Figma 07 to 12: a research question goes in, and the talks come back as Supports,
Reframes and Challenges. Here a general instruction model (Qwen3-14B, thinking off) gets
each evaluation question with its top-15 retrieved items (title + abstract, the same
720 pairs as scripts/eval_angles.py) and the angle definitions from
data/eval/LABELING.md, with no examples from the evaluation set.

Each array task is one run over all 48 questions:
  task 0, 1   greedy decoding (the LLM's best case, run twice)
  task 2..6   sampled as a chat app would (temperature 0.7, top_p 0.8, top_k 20)
so the runs show whether the same person asking again gets the same Arc.

Output: data/eval/llm_runs/run_<k>.json  {"<qid>": {"<item id>": angle}, "_meta": {...}}

  sbatch scripts/compare_llm.slurm
  python scripts/compare_llm_report.py     # scores and consistency -> docs/llm_compare.json
"""
import argparse
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402

GEN_MODEL = os.environ.get("CHI_GEN_MODEL", "Qwen/Qwen3-14B")
BATCH = int(os.environ.get("CHI_GEN_BATCH", "6"))
OUT_DIR = os.path.join(config.ROOT, "data", "eval", "llm_runs")
ANGLES = ("support", "reframe", "challenge", "off")

SYSTEM = "You are a research assistant who helps CHI 2026 attendees plan what to see."

PROMPT = """Research question: "{q}"

Below are {n} CHI 2026 programme items. Give each one the angle it has on this question.

- support: the item is about the question's factor and outcome, and its own result (or, for a system or demo, what it is shown to offer) goes the question's way.
- challenge: the item is about the same factor and outcome, and its own result goes the other way, finds no effect, or finds the effect fails where the question assumes it holds. Only when the abstract says so explicitly.
- reframe: related, but through another factor that drives the outcome, another outcome or measure of the factor, or the same question in a clearly different group or setting; also items on the question's subject with no directional result.
- off: not meaningfully about the question's factor or outcome.

Decide from the abstract only. A sentence that only reports earlier work is not the item's result.

{items}

Answer with JSON only: a list of {{"id": <item id>, "angle": "support" | "reframe" | "challenge" | "off"}}, one entry per item, in the order given."""


def load():
    with open(os.path.join(config.ROOT, "data", "eval", "angle_pairs.json"), encoding="utf-8") as f:
        pairs = json.load(f)
    with open(os.path.join(config.ROOT, "data", "processed", "program.json"), encoding="utf-8") as f:
        prog = {it["id"]: it for it in json.load(f)}
    qs = {}
    for p in sorted(pairs, key=lambda p: (p["qid"], p["rank"])):
        qs.setdefault(p["qid"], {"q": p["q"], "ids": []})["ids"].append(p["id"])
    return qs, prog


def prompt_for(q, ids, prog):
    items = []
    for i in ids:
        it = prog[i]
        items.append(f"[id {i}] {it['type']}: {it['title']}\nAbstract: {it['abstract'].strip()[:1600]}")
    return PROMPT.format(q=q, n=len(ids), items="\n\n".join(items))


def parse(text, ids):
    m = re.search(r"\[.*\]", text, re.S)
    out = {}
    if m:
        try:
            for r in json.loads(m.group(0)):
                if isinstance(r, dict) and str(r.get("angle", "")).lower() in ANGLES:
                    out[int(r["id"])] = str(r["angle"]).lower()
        except (json.JSONDecodeError, TypeError, ValueError, KeyError):
            pass
    if len(out) < len(ids):
        # lenient: "id 222304 ... support" pairs anywhere in the text
        for i, a in re.findall(r"(\d{6})\D{1,40}?\b(support|reframe|challenge|off)\b", text):
            out.setdefault(int(i), a)
    return {i: out[i] for i in ids if i in out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", type=int, default=0)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    sample = args.run >= 2

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    os.environ.setdefault("HF_HOME", config.HF_CACHE)
    qs, prog = load()
    qids = sorted(qs)[:args.limit] if args.limit else sorted(qs)
    tok = AutoTokenizer.from_pretrained(GEN_MODEL, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(GEN_MODEL, dtype=torch.bfloat16, device_map="cuda")
    model.eval()
    torch.manual_seed(1000 + args.run)
    print(f"Loaded {GEN_MODEL} on {torch.cuda.get_device_name(0)} | run {args.run} "
          f"({'sampled' if sample else 'greedy'}) | {len(qids)} questions", flush=True)

    def chat(p):
        return tok.apply_chat_template([{"role": "system", "content": SYSTEM},
                                        {"role": "user", "content": p}],
                                       tokenize=False, add_generation_prompt=True,
                                       enable_thinking=False)

    def generate(texts):
        enc = tok(texts, return_tensors="pt", padding=True).to("cuda")
        kw = dict(do_sample=True, temperature=0.7, top_p=0.8, top_k=20) if sample else \
            dict(do_sample=False, temperature=None, top_p=None, top_k=None)
        with torch.no_grad():
            gen = model.generate(**enc, max_new_tokens=700, pad_token_id=tok.eos_token_id, **kw)
        return tok.batch_decode(gen[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)

    out, missing, secs = {}, 0, []
    for b in range(0, len(qids), BATCH):
        chunk = qids[b:b + BATCH]
        t0 = time.time()
        texts = generate([chat(prompt_for(qs[k]["q"], qs[k]["ids"], prog)) for k in chunk])
        secs.append((time.time() - t0) / len(chunk))
        for k, t in zip(chunk, texts):
            got = parse(t, qs[k]["ids"])
            if len(got) < len(qs[k]["ids"]):
                t = generate([chat(prompt_for(qs[k]["q"], qs[k]["ids"], prog))])[0]
                got = {**parse(t, qs[k]["ids"]), **got}
            missing += len(qs[k]["ids"]) - len(got)
            out[str(k)] = {str(i): got.get(i, "off") for i in qs[k]["ids"]}
        print(f"  {b + len(chunk)}/{len(qids)}  {secs[-1]:.1f} s per question", flush=True)
    out["_meta"] = {"model": GEN_MODEL, "run": args.run, "sampled": sample,
                    "gpu": torch.cuda.get_device_name(0), "missing_labels": missing,
                    "sec_per_question_batched": round(sum(secs) / len(secs), 2)}
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"run_{args.run}{'_sample' if args.limit else ''}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print("wrote", path, out["_meta"])


if __name__ == "__main__":
    main()
