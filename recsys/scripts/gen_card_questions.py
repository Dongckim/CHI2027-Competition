#!/usr/bin/env python3
"""Fifth LLM pass: the questions each result answers, asked the way an attendee would.

Support was found for 1 in 5 of the labelled Supports. Most misses are a question asked
about a kind of thing ("Does generative AI support designers' creativity?") and a result
about one instance of it ("EarlyArchi … enhanced perceived creativity"), or about
"external displays" and an "eHMI". The words never meet; the knowledge that they are the
same thing is in the LLM, which never sees the attendee's question. So it writes the
questions instead, once per result: up to three, narrow to broad, each one that this
result answers. On the phone the asked question is matched to these (angles.py).

  answer   yes: the result says X raises (or lowers) Y, as the question asks
           no:  the result found no effect, or the opposite
Only result cards with a direction (increase, decrease, no_effect) whose factor is what
the work tested (gen_valence.py) are asked about.

Input:  data/processed/angles.json, program.json, valence_raw/
Output: data/processed/cardq_raw/shard_<k>.json  {"<id>": {"<card index>": [[question, answer], ...]}}

  sbatch scripts/gen_card_questions.slurm
"""
import argparse
import glob
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402
from gen_findings import EFFECTS, STATUS  # noqa: E402

GEN_MODEL = os.environ.get("CHI_GEN_MODEL", "Qwen/Qwen3-14B")
BATCH = int(os.environ.get("CHI_GEN_BATCH", "24"))
PROC = os.path.join(config.ROOT, "data", "processed")
OUT_DIR = os.path.join(PROC, os.environ.get("CHI_CARDQ_DIR", "cardq_raw"))

SYSTEM = ("You help match CHI conference results to the research questions attendees bring. "
          "You judge only from the sentence given.")

PROMPT = """{kind} at CHI 2026: "{title}"

Results from its abstract, each with its sentence:
{cards}

Attendees, many of them new to the field, bring short research questions such as "Do external displays on self-driving cars improve pedestrian safety?", "Does generative AI support designers' creativity?" or "How do video games affect teenagers' wellbeing?". For each result, write exactly 3 questions that this result answers, one per level:
  1. narrow: the factor and the outcome as this work studied them, but never by the paper's own system name ("an attention-guiding external display", "perceived safety").
  2. kind: the kind of thing the factor is and the quality the outcome measures ("external displays on automated vehicles", "pedestrians' sense of safety").
  3. broad: what someone outside this subfield would ask, the factor in everyday words and the outcome as a broad family such as safety, wellbeing, user experience, performance, learning, creativity, trust, engagement, accessibility, privacy ("external displays on self-driving cars", "pedestrian safety").
  - Each question is one factor and one outcome, 6-14 words.
  - If the result has a direction (increase, decrease, no_effect), start with Does or Do and use a verb such as improve, increase, support, help, reduce, lower; answer "yes" if the result shows the factor changing the outcome the way the question asks, "no" if it found no effect or the opposite.
  - If the result has no direction (associated: the work describes how the factor shapes the outcome, often from interviews or observation), write "How does/do <factor> affect <outcome>?" and answer "affects".
  - Ask only what the sentence itself supports; at the broad level, keep the claim no stronger than the sentence.

Return one JSON object: {{"results": [{{"n": number, "questions": [{{"q": "...", "answer": "yes" | "no" | "affects"}}, ...]}}, ...]}}. Return only the JSON object."""


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
        qs = []
        for x in r.get("questions") or []:
            if isinstance(x, dict) and isinstance(x.get("q"), str) and x.get("answer") in ("yes", "no", "affects"):
                q = " ".join(x["q"].split())
                if 4 <= len(q.split()) <= 20 and q.endswith("?"):
                    qs.append([q, x["answer"]])
        if 1 <= k <= n and qs:
            out[k] = qs[:3]
    return out


def todo_items():
    with open(os.path.join(PROC, "program.json"), encoding="utf-8") as f:
        prog = {str(it["id"]): it for it in json.load(f)}
    with open(os.path.join(PROC, "angles.json"), encoding="utf-8") as f:
        ang = json.load(f)
    val = {}
    for f in glob.glob(os.path.join(PROC, "valence_raw", "shard_*.json")):
        with open(f, encoding="utf-8") as fh:
            val.update(json.load(fh))
    ph = ang["phrases"]
    out = []
    for xid, rec in ang["items"].items():
        ab = prog[xid]["abstract"]
        idx, lines = [], []
        for k, c in enumerate(rec["cards"]):
            if STATUS[c[4]] != "result" or EFFECTS[c[3]] not in ("increase", "decrease", "no_effect", "associated"):
                continue
            v = (val.get(xid) or {}).get(str(k))
            if v is not None and v[1] != "yes":
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
    def generate(texts, max_new=1500):
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
                print(r["cards"], "\n->", json.dumps(done[r["id"]], ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
