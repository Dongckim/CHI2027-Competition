#!/usr/bin/env python3
"""Keep the written questions the engine itself can answer (after gen_narrow.py).

For each term, each of the LLM's questions is read by the engine as the phone would read it:
it must parse as "X raises Y" (a relation), be at most 16 words, name every content word of a
term of up to three words (half of a longer session title's), and its Arc
must hold at least one Support among the talks read. The three kept come first by how many
of the three angles they fill, then by Supports, then in the LLM's order, no two alike (no
two with a question cosine of CQ_SAME or more). A term with none left keeps the phone's own narrowing.

Input:  data/processed/narrow_todo.json, data/processed/narrow_raw/shard_*.json
Output: data/processed/narrow.json  {"<key>": [question, question, question]}

  CHI_WORKERS=20 python scripts/build_narrow.py   (or sbatch scripts/build_narrow.slurm, CPU only)
"""
import glob
import json
import os
import sys
from collections import Counter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(ROOT, "src", "package"))
os.environ.setdefault("CHI_ANGLES_DIR", os.path.join(ROOT, "data", "processed"))
import angles as A  # noqa: E402

PKG = os.path.join(ROOT, "dist", "chi2026-retriever")
PROC = os.path.join(ROOT, "data", "processed")
K = 3


_ENG = None


def _init():
    global _ENG
    _ENG = A.Angles(PKG)


def keep(item):
    """(key, kept questions, stats) for one term's written questions."""
    key, term, cands = item
    eng = _ENG
    types = eng._types(eng._formats({}))
    stats = Counter(terms=1)
    tw = A.content(term.lower())[0]
    rows = []
    for c in cands:
        stats["written"] += 1
        q = eng.question(c["q"])
        if q["kind"] != "relation":
            stats["not a relation"] += 1
            continue
        words = A.content(q["text"])[0]
        if len(c["q"].split()) > A.CQ_WORDS + 2:
            stats["too long"] += 1
            continue
        # a word or two: all of them; a session title: at least half of its words
        hit = sum(1 for w in tw if any(A._same(w, u) for u in words))
        if hit < (len(tw) if len(tw) <= 3 else (len(tw) + 1) // 2):
            stats["without the term"] += 1
            continue
        judged, _, _ = eng._judged(q, types)
        n = Counter(v["angle"] for _, v in judged)
        if n["support"] < 1:
            stats["no Support"] += 1
            continue
        # the most angles first, then Supports, then the LLM's own order (the shorter question
        # first read worse: "Does being blind reduce connection to nature?", 11/27)
        rows.append((-sum(1 for a in A.ANGLES if n[a] > 0), -n["support"], len(rows), q, c["q"]))
    rows.sort(key=lambda r: r[:3])
    kept = []
    for *_, q, text in rows:
        if any(float(q["V"] @ p["V"]) >= A.CQ_SAME for p, _ in kept):
            continue
        kept.append((q, text))
        if len(kept) == K:
            break
    if kept:
        stats["terms kept"] += 1
        stats["questions kept"] += len(kept)
    return key, [t for _, t in kept], stats


def main():
    import multiprocessing as mp
    workers = int(os.environ.get("CHI_WORKERS", "1"))
    todo = {t["key"]: t["term"] for t in json.load(open(os.path.join(PROC, "narrow_todo.json"), encoding="utf-8"))}
    raw = {}
    for f in sorted(glob.glob(os.path.join(PROC, "narrow_raw", "shard_*.json"))):
        raw.update(json.load(open(f, encoding="utf-8")))
    items = [(k, todo[k], c) for k, c in sorted(raw.items()) if k in todo]
    out, stats = {}, Counter()
    with mp.Pool(workers, initializer=_init) as pool:
        for n, (key, kept, st) in enumerate(pool.imap_unordered(keep, items, chunksize=8), 1):
            stats.update(st)
            if kept:
                out[key] = kept
            if n % 200 == 0 or n == len(items):
                print(f"{n}/{len(items)} terms, {stats['terms kept']} kept", flush=True)
    out = dict(sorted(out.items()))
    with open(os.path.join(PROC, "narrow.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print(dict(stats))


if __name__ == "__main__":
    main()
