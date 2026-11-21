#!/usr/bin/env python3
"""Third LLM pass over the finding cards: broader names, directions, missed results.

A question is usually broader than a card. The card says "MindfulAgents" and "momentary
stress"; the attendee asks "Do mental health apps reduce stress?". The card says
"throughput"; the attendee asks whether gaze makes "target selection faster". The general
names of gen_concepts.py are mostly synonyms at the card's own level, so these Supports
were missed (docs/angle_model.md, 11/20). This pass asks, once per talk:

  - for every card: its direction checked again against its sentence (cards stored as
    "associated" although the sentence says "enhanced"), and two broader names for each
    side, one step and two steps up ("mindfulness app", "mental health app");
  - up to 4 further results of the work's own that the cards miss (the first pass kept
    at most 4 and often spent them on background), copied word for word, with the same
    broader names.

Used only for matching on the phone, never quoted. build_angles.py checks the new
results against the abstract like every other card.

Input:  data/processed/angles.json, program.json
Output: data/processed/results_raw/shard_<k>.json
  {"<id>": {"cards": [{"card": 1, "effect": "decrease", "factor_up": [..], "outcome_up": [..]}],
            "more": [{"s": 5, "factor": "...", "outcome": "...", "effect": "...",
                      "factor_up": [..], "outcome_up": [..]}]}}

  sbatch scripts/gen_results.slurm                        # all talks, 4 shards
  CHI_IDS_FILE=data/eval/pilot_ids.txt sbatch --array=0-1 --export=ALL,CHI_SHARDS=2 scripts/gen_results.slurm
"""
import argparse
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402
from gen_findings import EFFECTS, split_sentences  # noqa: E402

GEN_MODEL = os.environ.get("CHI_GEN_MODEL", "Qwen/Qwen3-14B")
BATCH = int(os.environ.get("CHI_GEN_BATCH", "24"))
PROC = os.path.join(config.ROOT, "data", "processed")
OUT_DIR = os.path.join(PROC, "results_raw")

SYSTEM = ("You annotate CHI conference abstracts so that broad research questions find the "
          "work. You copy phrases from the abstract exactly when asked to.")

PROMPT = """{kind} at CHI 2026: "{title}"

Abstract, one numbered sentence per line:
{sentences}

Findings already taken from this abstract:
{cards}

Attendees ask broad questions, such as "Does <kind of technology or design> improve <broad outcome>?". Help match this work to such questions.

Return one JSON object with these keys.

"cards": one entry per finding above, in the same order: {{"card": number, "effect": "...", "factor_up": ["...", "..."], "outcome_up": ["...", "..."]}}
  - effect: read the finding's sentence again. What happened to the outcome when the factor is present, higher or used: one of {effects}. Use increase or decrease whenever the sentence says the outcome went up or down (improved, enhanced, reduced, higher, lower, more, fewer, buffered a loss). no_effect = no (significant) effect or difference. mixed = it depends or differs between conditions. associated = only when the sentence gives no direction.
  - factor_up: two broader names for the factor, 1-4 words each, lower case: first the kind of thing it is, then the broader family a researcher would name in a question. A named system or condition becomes the kind of system it is, by its application, not its technique. E.g. "StepQuest" (a named step-counting game) -> ["fitness game", "health technology"]; "the Glow condition" (an ambient light that reminds people to drink water) -> ["ambient reminder", "notification design"].
  - outcome_up: two broader names for the outcome, 1-4 words each, lower case: first the quality it is a measure of, then the broad outcome. E.g. "words per minute" -> ["typing speed", "text entry performance"]; "pointing error in millimetres" -> ["pointing accuracy", "input performance"].

"more": up to 4 further results of this work's own study that the findings above miss, most important first. Only results this work reports (not background, aims or what a system is meant to do). Each is {{"s": sentence number, "factor": "...", "outcome": "...", "effect": "...", "factor_up": [...], "outcome_up": [...]}}
  - factor and outcome: copied exactly from sentence s, short noun phrases (factor 1-5 words, outcome 1-4 words), one concept each, never a list.
  - When the sentence names this work's system only as "it" or "participants", use the system's name or condition as written elsewhere in sentence s; if it is not in sentence s, skip that result.
  Leave "more" empty when the findings above already cover the results.

Return only the JSON object."""


def clean_up(v):
    out = []
    for x in v if isinstance(v, list) else []:
        if isinstance(x, str):
            x = " ".join(x.lower().split()).strip(" .,;\"'")
            if x and len(x.split()) <= 5 and x not in out:
                out.append(x)
    return out[:2]


def parse(text, n_cards, n_sent):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None
    cards = []
    for c in obj.get("cards") or []:
        if not isinstance(c, dict):
            continue
        try:
            k = int(c.get("card"))
        except (TypeError, ValueError):
            continue
        if 1 <= k <= n_cards:
            cards.append({"card": k, "effect": c.get("effect") if c.get("effect") in EFFECTS else "",
                          "factor_up": clean_up(c.get("factor_up")), "outcome_up": clean_up(c.get("outcome_up"))})
    more = []
    for f in obj.get("more") or []:
        if not isinstance(f, dict):
            continue
        try:
            s = int(f.get("s"))
        except (TypeError, ValueError):
            continue
        fa, ou = str(f.get("factor") or "").strip(), str(f.get("outcome") or "").strip()
        if 1 <= s <= n_sent and fa and ou and f.get("effect") in EFFECTS:
            more.append({"s": s, "factor": fa, "outcome": ou, "effect": f["effect"],
                         "factor_up": clean_up(f.get("factor_up")), "outcome_up": clean_up(f.get("outcome_up"))})
    return {"cards": cards, "more": more[:4]}


def todo_items():
    with open(os.path.join(PROC, "program.json"), encoding="utf-8") as f:
        prog = {str(it["id"]): it for it in json.load(f)}
    with open(os.path.join(PROC, "angles.json"), encoding="utf-8") as f:
        ang = json.load(f)
    ph = ang["phrases"]
    out = []
    for xid, rec in ang["items"].items():
        it = prog[xid]
        ab = it["abstract"][:3000]
        sents = split_sentences(ab)
        cards = []
        for k, c in enumerate(rec["cards"]):
            s = next((n + 1 for n, (a, b) in enumerate(sents) if a <= c[9] < b), 0)
            cards.append(f'{k + 1}. [sentence {s}] factor "{ph[c[0]]}" -> outcome "{ph[c[1]]}": {EFFECTS[c[3]]}')
        out.append({"id": xid, "type": it["type"], "title": it["title"],
                    "sentences": "\n".join(f"[{n + 1}] {ab[a:b]}" for n, (a, b) in enumerate(sents)),
                    "n_sent": len(sents), "cards": cards})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--of", type=int, default=1)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--ids-file", default="", help="only these item ids, one per line (a pilot)")
    ap.add_argument("--tag", default="", help="names the output files (shard_<tag>_<k>.json) of an extra run")
    args = ap.parse_args()

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    os.environ.setdefault("HF_HOME", config.HF_CACHE)
    todo = todo_items()
    if args.ids_file:
        with open(args.ids_file, encoding="utf-8") as f:
            want = {x.strip() for x in f if x.strip()}
        todo = [it for it in todo if it["id"] in want]
    todo = todo[args.shard::args.of]
    if args.limit:
        todo = todo[:args.limit]
    os.makedirs(OUT_DIR, exist_ok=True)
    tag = f"{args.tag}_" if args.tag else ""
    out_path = os.path.join(OUT_DIR, "sample.json" if args.limit else f"shard_{tag}{args.shard}.json")
    done = {}
    if os.path.exists(out_path) and not args.limit:
        with open(out_path, encoding="utf-8") as f:
            done = json.load(f)
    todo = [it for it in todo if it["id"] not in done]
    todo.sort(key=lambda it: -len(it["sentences"]))
    tok = AutoTokenizer.from_pretrained(GEN_MODEL, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(GEN_MODEL, dtype=torch.bfloat16, device_map="cuda")
    model.eval()
    print(f"Loaded {GEN_MODEL} on {torch.cuda.get_device_name(0)} | shard {args.shard}/{args.of} "
          f"N={len(todo)}", flush=True)

    def chat(r, extra=""):
        p = PROMPT.format(kind=r["type"], title=r["title"], sentences=r["sentences"],
                          cards="\n".join(r["cards"]) or "(none)", effects=", ".join(EFFECTS)) + extra
        return tok.apply_chat_template([{"role": "system", "content": SYSTEM}, {"role": "user", "content": p}],
                                       tokenize=False, add_generation_prompt=True, enable_thinking=False)

    @torch.no_grad()
    def generate(texts, max_new=1200):
        enc = tok(texts, return_tensors="pt", padding=True).to("cuda")
        gen = model.generate(**enc, max_new_tokens=max_new, do_sample=False, temperature=None, top_p=None,
                             top_k=None, pad_token_id=tok.pad_token_id)
        return tok.batch_decode(gen[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)

    t0, bad = time.time(), 0
    for b in range(0, len(todo), BATCH):
        recs = todo[b:b + BATCH]
        outs = generate([chat(r) for r in recs])
        for r, o in zip(recs, outs):
            got = parse(o, len(r["cards"]), r["n_sent"])
            if got is None:
                got = parse(generate([chat(r, "\nReturn valid JSON only.")], max_new=1600)[0],
                            len(r["cards"]), r["n_sent"])
            if got is None:
                bad += 1
                got = {"cards": [], "more": [], "failed": True}
            done[r["id"]] = got
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(done, f, ensure_ascii=False)
        print(f"{min(b + BATCH, len(todo))}/{len(todo)}  {(time.time() - t0) / 60:.1f} min  failed {bad}", flush=True)
        if args.limit:
            for r in recs:
                print(json.dumps({"title": r["title"], **done[r["id"]]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
