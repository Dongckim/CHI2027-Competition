#!/usr/bin/env python3
"""Arc engine vs a general LLM on the same 720 pairs: accuracy and repeatability.

Reads data/eval/llm_runs/run_*.json (scripts/compare_llm.py) and the gold labels, runs
the on-device engine five times over the same pairs, and writes docs/llm_compare.json.

Accuracy is on the test half (odd qids), as in docs/angle_eval.json: the engine's
thresholds were tuned on the even half. Repeatability uses all 48 questions:
  pairs_same     share of (question, item) pairs that get the same angle in every run
  arcs_same      share of questions whose Supports and Challenges are the same in every run
  challenge_flip questions where some run shows a Challenge and another run does not

  python scripts/compare_llm_report.py
"""
import glob
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.dirname(__file__))
import eval_angles as E  # noqa: E402

RUNS = os.path.join(ROOT, "data", "eval", "llm_runs")


def preds_engine(eng, gold):
    _, det = E.run(eng, gold)
    return {(d["qid"], d["id"]): d["pred"] for d in det}


def preds_llm(path):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    meta = d.pop("_meta")
    return {(int(q), int(i)): a for q, row in d.items() for i, a in row.items()}, meta


def accuracy(pred, gold, half=1):
    rows = [(g["angle"], pred[(g["qid"], g["id"])]) for g in gold if g["qid"] % 2 == half]
    return E.score(rows)


def repeat(runs, gold):
    keys = [(g["qid"], g["id"]) for g in gold]
    same = sum(1 for k in keys if len({r[k] for r in runs}) == 1) / len(keys)
    qids = sorted({g["qid"] for g in gold})
    arcs_same, flips = 0, []
    for q in qids:
        ks = [k for k in keys if k[0] == q]
        sets = [tuple(sorted((k[1], r[k]) for k in ks if r[k] in ("support", "challenge"))) for r in runs]
        arcs_same += len(set(sets)) == 1
        has = [any(r[k] == "challenge" for k in ks) for r in runs]
        if any(has) and not all(has):
            flips.append(q)
    return {"pairs_same": round(same, 3), "arcs_same": round(arcs_same / len(qids), 3),
            "challenge_flip": len(flips), "challenge_flip_qids": flips, "questions": len(qids)}


def main():
    import angles as A
    eng = A.Angles(E.PKG)
    gold = E.load_gold()
    engine_runs = [preds_engine(eng, gold) for _ in range(5)]
    greedy, sampled, metas = [], [], []
    for p in sorted(glob.glob(os.path.join(RUNS, "run_[0-9].json"))):
        pr, meta = preds_llm(p)
        (sampled if meta["sampled"] else greedy).append(pr)
        metas.append(meta)
    rep = {"engine": {"test": accuracy(engine_runs[0], gold), "repeat": repeat(engine_runs, gold)},
           "llm_meta": metas}
    if greedy:
        rep["llm_greedy"] = {"test": accuracy(greedy[0], gold), "repeat": repeat(greedy, gold)}
    if sampled:
        tests = [accuracy(s, gold) for s in sampled]
        rep["llm_sampled"] = {"test_runs": tests, "repeat": repeat(sampled, gold),
                              "macro_f1_mean": round(sum(t["macro_f1"] for t in tests) / len(tests), 3)}
    rep["examples"] = examples(gold, engine_runs[0], sampled)
    with open(os.path.join(ROOT, "docs", "llm_compare.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    for k in ("engine", "llm_greedy", "llm_sampled"):
        if k in rep:
            t = rep[k].get("test") or rep[k]["test_runs"][0]
            print(k, "macroF1", t["macro_f1"], "acc", t["accuracy"], "on-map", t["on_map"],
                  {l: (t[l]["precision"], t[l]["recall"]) for l in E.LABELS[:3]}, rep[k]["repeat"])


def examples(gold, engine, sampled):
    """Per question: the Arc each system draws (Figma 12 groups), every sampled run."""
    with open(os.path.join(ROOT, "data", "processed", "program.json"), encoding="utf-8") as f:
        title = {it["id"]: it["title"] for it in json.load(f)}
    out = {}
    for g in gold:
        q = out.setdefault(g["qid"], {"q": g["q"], "items": {}})
        q["items"][g["id"]] = {"title": title[g["id"]], "rank": g["rank"], "gold": g["angle"],
                               "engine": engine[(g["qid"], g["id"])],
                               "llm": [s[(g["qid"], g["id"])] for s in sampled]}
    return out


if __name__ == "__main__":
    main()
