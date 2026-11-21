#!/usr/bin/env python3
"""Finding cards for every program item, extracted offline by an LLM (GPU node).

The Arc screens place each talk around the user's question as Support, Reframe or
Challenge. That needs to know, for every abstract, which factor was studied, which
outcome it was measured on, which way the result went, and whether the sentence is
this work's own result or background. The program is fixed before the conference, so
an LLM reads every abstract once here and the phone only matches the cards.

Every phrase must be copied from the abstract: a phrase that is not found there
verbatim is dropped (scripts/build_angles.py checks again and stores offsets).

Output: data/processed/findings_raw/shard_<k>.json
  {"<item id>": {"label": "Interaction fidelity", "contribution": "empirical",
                 "tribe": "XR & immersive",
                 "findings": [{"s": 4, "factor": "...", "outcome": "...",
                               "effect": "increase", "population": "...",
                               "status": "result"}],
                 "measures": [{"s": 2, "construct": "presence"}]}}

  sbatch scripts/gen_findings.slurm          # 4 shards, one GPU each
  python scripts/gen_findings.py --shard 0 --of 4 --limit 20   # quick look
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
BATCH = int(os.environ.get("CHI_GEN_BATCH", "24"))
OUT_DIR = os.path.join(config.ROOT, "data", "processed", "findings_raw")

TRIBES = {
    "AI & agents": "AI models, LLMs, agents, chatbots, human-AI collaboration, when AI itself is the subject",
    "XR & immersive": "virtual, augmented and mixed reality, presence, embodiment, avatars, immersive media",
    "Accessibility & aging": "disability, blind and low-vision, deaf, neurodivergent people, older adults, assistive tech",
    "Health & wellbeing": "physical and mental health, clinicians, patients, wellbeing, care, sleep, fitness",
    "Learning & families": "education, students, teachers, children, parents, families, learning tools",
    "Society & communities": "social media, online communities, privacy, security, ethics, politics, labour, sustainability, culture",
    "Devices & interaction": "input techniques, sensors, wearables, haptics, fabrication, mobile and novel devices, interaction techniques",
    "Design & creativity": "design practice and methods, creativity support, art, music, games and play, visualization authoring",
}
EFFECTS = ("increase", "decrease", "no_effect", "mixed", "associated")
STATUS = ("result", "claim", "prior", "aim")
CONTRIB = ("empirical", "system", "method", "review", "design", "position", "event")

SYSTEM = ("You annotate CHI conference abstracts for a research map. You copy phrases "
          "exactly as written in the abstract and never paraphrase them.")

PROMPT = """{kind} at CHI 2026: "{title}"
Session: {session}

Abstract, one numbered sentence per line:
{sentences}

Return one JSON object with these keys.

"label": 2 or 3 words naming the main variable or focus of this work, as a short label on a map of talks. Use this abstract's own words. Capitalize only the first word.

"contribution": one of {contrib}. empirical = reports a study with results; system = builds a tool or prototype; method = a new measure, scale, model or dataset; review = literature review; design = design study, guidelines or framework; position = argument or essay; event = workshop, panel, meetup, course.

"tribe": the one topic group from this list that fits best. Choose the application area first; choose "AI & agents" only when AI itself is the main subject and no other group fits.
{tribes}

"findings": up to 4 relations between a factor and an outcome stated in the abstract, most important first. Each is
  {{"s": sentence number, "factor": "...", "outcome": "...", "effect": "...", "population": "...", "status": "..."}}
  - factor: the variable, condition, design or system that was varied, introduced or compared, copied exactly from sentence s. A short noun phrase of 1-5 words naming one concept (e.g. "interaction fidelity", "haptic feedback"), never a list or a clause.
  - outcome: what it was measured on or what it affected, copied exactly from sentence s. A short noun phrase of 1-4 words naming one concept (e.g. "presence", "sense of agency", "typing speed"), never a list or a clause.
  - When a sentence names several factors or outcomes, write one finding per pair that matters, at most 4 in total.
  - effect: what happened to the outcome when the factor is higher, present or used: one of {effects}. no_effect = the sentence says no (significant) effect or difference. mixed = it depends or differs between conditions. associated = related, no direction.
  - population: who or what context, copied exactly from the abstract, or "" if not stated.
  - status: result = this work's own finding; claim = what this work's system or design is said to offer without a reported study; prior = background, earlier work or common belief; aim = a goal, question or hypothesis.
  Leave findings empty if the abstract states no such relation.

"measures": constructs this work defines, measures in a new way, or proposes a scale or model for, as [{{"s": sentence number, "construct": "copied exactly"}}]. Usually empty.

Return only the JSON object."""


def split_sentences(text):
    """Sentences with character offsets; splits after . ! ? followed by a capital,
    a digit or a quote, keeping e.g. "et al." and "vs." together."""
    text = text.strip()
    out, start = [], 0
    for m in re.finditer(r"(?<=[.!?])\s+(?=[A-Z0-9\"“(])", text):
        prev = text[max(start, m.start() - 6):m.start()].lower()
        if re.search(r"(\bet al\.|\be\.g\.|\bi\.e\.|\bvs\.|\bfig\.|\bcf\.)$", prev):
            continue
        out.append((start, m.start()))
        start = m.end()
    if start < len(text):
        out.append((start, len(text)))
    return [(a, b) for a, b in out if text[a:b].strip()]


def parse(text, n_sent):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None
    out = {"label": str(obj.get("label") or "").strip()[:40],
           "contribution": obj.get("contribution") if obj.get("contribution") in CONTRIB else "",
           "tribe": obj.get("tribe") if obj.get("tribe") in TRIBES else "",
           "findings": [], "measures": []}
    for f in obj.get("findings") or []:
        if not isinstance(f, dict):
            continue
        try:
            s = int(f.get("s"))
        except (TypeError, ValueError):
            continue
        if not 1 <= s <= n_sent:
            continue
        rec = {"s": s, "factor": str(f.get("factor") or "").strip(),
               "outcome": str(f.get("outcome") or "").strip(),
               "effect": f.get("effect") if f.get("effect") in EFFECTS else "associated",
               "population": str(f.get("population") or "").strip(),
               "status": f.get("status") if f.get("status") in STATUS else "result"}
        if rec["factor"] and rec["outcome"]:
            out["findings"].append(rec)
    for c in obj.get("measures") or []:
        if isinstance(c, dict) and str(c.get("construct") or "").strip():
            try:
                s = int(c.get("s"))
            except (TypeError, ValueError):
                continue
            if 1 <= s <= n_sent:
                out["measures"].append({"s": s, "construct": str(c["construct"]).strip()})
    out["findings"] = out["findings"][:4]
    out["measures"] = out["measures"][:3]
    return out


def todo_items():
    with open(os.path.join(config.ROOT, "data", "processed", "program.json"), encoding="utf-8") as f:
        items = [it for it in json.load(f) if it["abstract"].strip()]
    seen, todo = set(), []
    for it in items:
        key = (it["type"], it["title"].strip().lower())
        if key not in seen:
            seen.add(key)
            todo.append(it)
    return todo


def prompt_text(it):
    sents = split_sentences(it["abstract"][:3000])
    body = "\n".join(f"[{k + 1}] {it['abstract'][a:b]}" for k, (a, b) in enumerate(sents))
    sess = "; ".join(dict.fromkeys(s["session"] for s in it.get("sessions", []))) or "-"
    return PROMPT.format(kind=it["type"], title=it["title"], session=sess, sentences=body,
                         contrib=", ".join(CONTRIB), effects=", ".join(EFFECTS),
                         tribes="\n".join(f'  - "{k}": {v}' for k, v in TRIBES.items())), len(sents)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--of", type=int, default=1)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--part", type=int, default=0, help="split a shard further: this part")
    ap.add_argument("--parts", type=int, default=1)
    ap.add_argument("--ids", default="", help="comma-separated item ids (a quick look)")
    args = ap.parse_args()

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    os.environ.setdefault("HF_HOME", config.HF_CACHE)
    todo = todo_items()[args.shard::args.of][args.part::args.parts]
    if args.ids:
        want = {int(x) for x in args.ids.split(",")}
        todo = [it for it in todo_items() if it["id"] in want]
        args.limit = len(todo)
    elif args.limit:
        todo = todo[:args.limit]
    os.makedirs(OUT_DIR, exist_ok=True)
    name = f"shard_{args.shard}" + (f"_{args.part}" if args.parts > 1 else "")
    out_path = os.path.join(OUT_DIR, "sample.json" if args.limit else f"{name}.json")
    done = {}
    if os.path.exists(out_path) and not args.limit:
        with open(out_path, encoding="utf-8") as f:
            done = json.load(f)
    todo = [it for it in todo if str(it["id"]) not in done]
    # longest prompts first keeps batches evenly padded
    todo.sort(key=lambda it: -len(it["abstract"]))

    tok = AutoTokenizer.from_pretrained(GEN_MODEL, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(GEN_MODEL, dtype=torch.bfloat16, device_map="cuda")
    model.eval()
    print(f"Loaded {GEN_MODEL} on {torch.cuda.get_device_name(0)} | shard {args.shard}/{args.of} "
          f"N={len(todo)}", flush=True)

    def chat(p):
        return tok.apply_chat_template([{"role": "system", "content": SYSTEM},
                                        {"role": "user", "content": p}],
                                       tokenize=False, add_generation_prompt=True,
                                       enable_thinking=False)

    @torch.no_grad()
    def generate(texts, max_new=700):
        enc = tok(texts, return_tensors="pt", padding=True).to("cuda")
        gen = model.generate(**enc, max_new_tokens=max_new, do_sample=False,
                             temperature=None, top_p=None, top_k=None,
                             pad_token_id=tok.pad_token_id)
        return tok.batch_decode(gen[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)

    t0, bad = time.time(), 0
    for b in range(0, len(todo), BATCH):
        recs = todo[b:b + BATCH]
        built = [prompt_text(r) for r in recs]
        outs = generate([chat(p) for p, _ in built])
        retry = []
        for r, (p, n), o in zip(recs, built, outs):
            got = parse(o, n)
            if got is None:
                retry.append((r, p, n))
            else:
                done[str(r["id"])] = got
        # one more try with a little sampling for outputs that did not parse
        for r, p, n in retry:
            o = generate([chat(p + "\nReturn valid JSON only.")], max_new=900)[0]
            got = parse(o, n)
            if got is None:
                bad += 1
                got = {"label": "", "contribution": "", "tribe": "", "findings": [], "measures": [],
                       "failed": True}
            done[str(r["id"])] = got
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(done, f, ensure_ascii=False)
        el = time.time() - t0
        print(f"{min(b + BATCH, len(todo))}/{len(todo)}  {el / 60:.1f} min  failed {bad}", flush=True)
        if args.limit:
            for r in recs:
                print(json.dumps({"title": r["title"], **done[str(r["id"])]}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
