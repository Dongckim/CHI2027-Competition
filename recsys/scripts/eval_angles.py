#!/usr/bin/env python3
"""Score the Arc angles against the labelled pairs in data/eval.

data/eval/angle_pairs.json: 48 questions x their top-15 retrieved programme items (720
pairs). data/eval/label_batches/gold_*.json: one angle per pair (support / challenge /
reframe / off), labelled by reading each abstract (guide: data/eval/LABELING.md).

Questions with an even qid are the dev half (thresholds are tuned there), odd the test
half (reported). "off" is what the engine returns as None (not on the map).

  CHI_ANGLES_DIR=data/processed python scripts/eval_angles.py            # report
  CHI_ANGLES_DIR=data/processed python scripts/eval_angles.py --sweep    # tune on dev
Writes docs/angle_eval.json.
"""
import argparse
import glob
import itertools
import json
import os
import sys
from collections import Counter

ROOT = os.path.join(os.path.dirname(__file__), "..")
PKG = os.path.join(ROOT, "dist", "chi2026-retriever")
sys.path.insert(0, os.path.join(ROOT, "src", "package"))
os.environ.setdefault("CHI_ANGLES_DIR", os.path.join(ROOT, "data", "processed"))
import angles as A  # noqa: E402

LABELS = ("support", "reframe", "challenge", "off")


def load_gold(holdout=False):
    """The 48 questions (dev / test), or the 32 held-out ones (data/eval/holdout, 11/20:
    written by an agent from sampled papers in attendee words, never used for tuning)."""
    gold = []
    pat = ("holdout", "gold_*.json") if holdout else ("label_batches", "gold_*.json")
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "eval", *pat))):
        with open(f, encoding="utf-8") as fh:
            gold += json.load(fh)
    pairs_file = ("holdout", "pairs.json") if holdout else ("angle_pairs.json",)
    with open(os.path.join(ROOT, "data", "eval", *pairs_file), encoding="utf-8") as f:
        pairs = {(p["qid"], p["id"]): p for p in json.load(f)}
    for g in gold:
        g["q"] = pairs[(g["qid"], g["id"])]["q"]
        g["rank"] = pairs[(g["qid"], g["id"])]["rank"]
    return gold


def score(rows):
    conf = Counter((g, p) for g, p in rows)
    out = {"n": len(rows), "accuracy": round(sum(conf[(l, l)] for l in LABELS) / max(1, len(rows)), 3)}
    for l in LABELS:
        tp = conf[(l, l)]
        pp = sum(conf[(g, l)] for g in LABELS)
        gp = sum(conf[(l, p)] for p in LABELS)
        prec = tp / pp if pp else None
        rec = tp / gp if gp else None
        f1 = 2 * prec * rec / (prec + rec) if prec and rec else 0.0
        out[l] = {"precision": None if prec is None else round(prec, 3),
                  "recall": None if rec is None else round(rec, 3), "f1": round(f1, 3),
                  "predicted": pp, "gold": gp}
    out["macro_f1"] = round(sum(out[l]["f1"] for l in LABELS) / len(LABELS), 3)
    # the map: on (any angle) vs off
    on_tp = sum(conf[(g, p)] for g in LABELS[:3] for p in LABELS[:3])
    on_pp = sum(conf[(g, p)] for g in LABELS for p in LABELS[:3])
    on_gp = sum(conf[(g, p)] for g in LABELS[:3] for p in LABELS)
    out["on_map"] = {"precision": round(on_tp / on_pp, 3) if on_pp else None,
                     "recall": round(on_tp / on_gp, 3) if on_gp else None}
    out["confusion"] = {g: {p: conf[(g, p)] for p in LABELS} for g in LABELS}
    return out


ALL_TYPES = {t for ts in A.FORMATS.values() for t in ts}


def run(eng, gold, half=None):
    """As the Arc screens judge: the search's first talks with their cards (and the
    search-rank Reframes, A._near), any other pair by its cards alone."""
    qs = {}
    rows, detail = [], []
    for g in gold:
        if half is not None and g["qid"] % 2 != half:
            continue
        if g["q"] not in qs:
            q = eng.question(g["q"])
            qs[g["q"]] = (q, dict(eng._judged(q, ALL_TYPES)[0]))
        q, judged = qs[g["q"]]
        i = eng.arc._item_by_id(g["id"])
        v = judged.get(i) or (eng.judge(i, q) if q["kind"] == "relation" else None)
        p = v["angle"] if v else "off"
        rows.append((g["angle"], p))
        detail.append({"qid": g["qid"], "id": g["id"], "gold": g["angle"], "pred": p,
                       "sub": v["subtype"] if v else "", "gold_sub": g.get("subtype", "")})
    return rows, detail


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sweep", action="store_true")
    args = ap.parse_args()
    eng = A.Angles(PKG)
    gold = load_gold()
    print("gold:", Counter(g["angle"] for g in gold))
    parsed = {}
    for g in gold:
        if g["q"] not in parsed:
            q = eng.question(g["q"])
            parsed[g["q"]] = {k: q[k] for k in ("kind", "x", "y", "dir", "ctx")}
    if args.sweep:
        best = None
        grid = itertools.product([0.6, 0.65, 0.7, 0.75], [0.75, 0.8, 0.85], [0.5, 0.55, 0.6], [0.85, 0.9])
        for m, s, lo, hi in grid:
            if s < m:
                continue
            A.MATCH, A.STRICT, A.COS_LO, A.COS_HI = m, s, lo, hi
            r = score(run(eng, gold, 0)[0])
            # challenge precision first (a wrong Challenge costs trust), then macro F1
            ch = r["challenge"]["precision"] or 0.0
            key = (r["macro_f1"] + 0.5 * ch, r["accuracy"])
            print(m, s, lo, hi, r["macro_f1"], r["accuracy"], r["challenge"]["precision"],
                  r["support"]["f1"], r["reframe"]["f1"], r["off"]["f1"])
            if best is None or key > best[0]:
                best = (key, (m, s, lo, hi))
        print("best on dev:", best)
        A.MATCH, A.STRICT, A.COS_LO, A.COS_HI = best[1]
    dev, _ = run(eng, gold, 0)
    test, det = run(eng, gold, 1)
    allr, alld = run(eng, gold)
    ho = load_gold(holdout=True)
    hor, hod = run(eng, ho) if ho else ([], [])
    rep = {"params": {"MATCH": A.MATCH, "STRICT": A.STRICT, "COS_LO": A.COS_LO, "COS_HI": A.COS_HI},
           "dev": score(dev), "test": score(test), "all": score(allr),
           "holdout": score(hor) if hor else None, "parsed": parsed,
           "errors_test": [d for d in det if d["gold"] != d["pred"]][:60]}
    with open(os.path.join(ROOT, "docs", "angle_eval.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    for k in ("dev", "test", "all", "holdout"):
        r = rep[k]
        if r is None:
            continue
        print(k, "acc", r["accuracy"], "macroF1", r["macro_f1"], "on-map", r["on_map"],
              {l: (r[l]["precision"], r[l]["recall"]) for l in LABELS})
    print(json.dumps(rep["test"]["confusion"]))


if __name__ == "__main__":
    main()
