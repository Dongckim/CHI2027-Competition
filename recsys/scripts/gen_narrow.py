#!/usr/bin/env python3
"""Sixth LLM pass: sharper questions for what attendees type, written once from the talks.

A word or a session name on the ask screen is turned into three sharper questions. On the
phone those are put together from card phrases, and for one word they often read oddly
("Does laboratory-comparable sleep staging improve dream engineering system?", "How do older
adults affect portal use?"). The inputs are mostly predictable (scripts/build_narrow_todo.py:
3,099 words, phrases, session and topic names), so Qwen3-14B reads each one's closest talks
and writes 5 questions an attendee would ask that those talks answer. build_narrow.py then
keeps the ones the engine itself finds Supports for (11/27).

Input:  data/processed/narrow_todo.json
Output: data/processed/narrow_raw/shard_<k>.json  {"<key>": [{"q": ..., "talks": [ids]}, ...]}

  sbatch scripts/gen_narrow.slurm
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
BATCH = int(os.environ.get("CHI_GEN_BATCH", "16"))
PROC = os.path.join(config.ROOT, "data", "processed")
OUT_DIR = os.path.join(PROC, "narrow_raw")

SYSTEM = ("You help attendees of the CHI 2026 conference turn a topic they typed into research "
          "questions that talks at the conference answer. You use only the talks given.")

PROMPT = """An attendee typed "{term}". These are the CHI 2026 talks closest to it, each with the questions its results answer (or its results):
{talks}

Write 5 research questions about "{term}" that an attendee new to the field would ask and that these talks answer.
  - Each question names "{term}" (or its plain everyday form) as the factor or as the outcome, and one other thing.
  - Each one is answered by at least two of the talks above; list their numbers.
  - 6-14 words. Start with Does or Do and a verb such as improve, increase, reduce, support, help, or write "How does/do <factor> affect <outcome>?" when the talks describe without a direction.
  - Plain words; never a paper's own system name; the other thing as a broad family where the talks allow (trust, wellbeing, learning, accessibility, privacy, user experience, performance, engagement, safety, creativity).
  - The 5 questions ask about 5 different things.
  - If "{term}" is a session or topic title of several words, ask about its subject in a few plain words; never copy the title.
  - If "{term}" is not a research subject (a method word, an adjective), return an empty list.

Return one JSON object: {{"questions": [{{"q": "...", "talks": [numbers]}}, ...]}}. Return only the JSON object."""


def talk_lines(talks):
    lines = []
    for n, t in enumerate(talks, 1):
        lines.append(f'{n}. "{t["title"]}"')
        for q in t["qs"]:
            lines.append(f"   - {q}")
        for f in t.get("finds", []):
            lines.append(f"   - finding: {f}")
    return "\n".join(lines)


def parse(text, talks):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    out = []
    for x in (obj.get("questions") or []) if isinstance(obj, dict) else []:
        if not isinstance(x, dict) or not isinstance(x.get("q"), str):
            continue
        q = " ".join(x["q"].split())
        nums = [n for n in (x.get("talks") or []) if isinstance(n, int) and 1 <= n <= len(talks)]
        if 4 <= len(q.split()) <= 20 and q.endswith("?"):
            out.append({"q": q, "talks": [talks[n - 1]["id"] for n in dict.fromkeys(nums)]})
    return out[:5]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--of", type=int, default=1)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    os.environ.setdefault("HF_HOME", config.HF_CACHE)
    with open(os.path.join(PROC, "narrow_todo.json"), encoding="utf-8") as f:
        todo = json.load(f)[args.shard::args.of]
    if args.limit:
        todo = todo[:args.limit]
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, "sample.json" if args.limit else f"shard_{args.shard}.json")
    done = {}
    if os.path.exists(out_path) and not args.limit:
        with open(out_path, encoding="utf-8") as f:
            done = json.load(f)
    todo = [it for it in todo if it["key"] not in done]
    tok = AutoTokenizer.from_pretrained(GEN_MODEL, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(GEN_MODEL, dtype=torch.bfloat16, device_map="cuda")
    model.eval()
    print(f"Loaded {GEN_MODEL} on {torch.cuda.get_device_name(0)} | shard {args.shard}/{args.of} "
          f"N={len(todo)}", flush=True)

    def chat(r, extra=""):
        p = PROMPT.format(term=r["term"], talks=talk_lines(r["talks"])) + extra
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
            got = parse(o, r["talks"])
            if got is None:
                got = parse(generate([chat(r, "\nReturn valid JSON only.")])[0], r["talks"])
            if got is None:
                bad += 1
                got = []
            done[r["key"]] = got
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(done, f, ensure_ascii=False)
        print(f"{min(b + BATCH, len(todo))}/{len(todo)}  {(time.time() - t0) / 60:.1f} min  failed {bad}", flush=True)
        if args.limit:
            for r in recs:
                print(r["term"], "->", json.dumps(done[r["key"]], ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
