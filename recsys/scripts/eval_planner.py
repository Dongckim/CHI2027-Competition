#!/usr/bin/env python3
"""Greedy vs "best" route planner (ARC route screen), same profiles, same scores.

greedy  the best-scoring talk of the day first, then the best one that still fits, ...
best    the set of talks with the highest total score that fits the day (DP over the
        day's top 40 talks; posters/demos tried every 15 min inside their window)

Profiles: the normal and fuzzy topics of tests/cases.json, the hand-written short
queries of eval_expansion.py and 30 random synthetic queries, on every conference day,
at pace 3 (6 stops) and pace 5 (10 stops). Wildcard (BRIDGE) is placed the same way
in both, so only the regular picks differ.

  python scripts/eval_planner.py      # writes docs/planner_report.json
"""
import json
import os
import random
import sys
import time

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = os.path.join(ROOT, "dist", "chi2026-retriever")
sys.path.insert(0, PKG)
sys.dont_write_bytecode = True
from arc import ARC  # noqa: E402

HAND = ["motion sickness in vr", "self-driving car", "kids and screen time",
        "LLM coding assistants for novice programmers", "sign language",
        "chatgpt in the classroom", "deepfake", "older people using voice assistants",
        "AR glasses for blind people", "burnout of gig workers"]


def main():
    cases = json.load(open(os.path.join(ROOT, "tests", "cases.json")))
    qs = [c["input"]["research_topic"] for c in cases if c["group"] in ("normal", "fuzzy")]
    synth = [q["query"] for q in json.load(open(os.path.join(ROOT, "data", "processed",
                                                             "synth_queries.json")))
             if q.get("lang", "en") == "en"]
    random.Random(0).shuffle(synth)
    qs += HAND + synth[:30]
    arc = ARC(PKG)
    res = {}
    for n, q in enumerate(qs):
        for day in arc.days:
            for pace in (3, 5):
                outs = {}
                for planner in ("greedy", "best"):
                    t0 = time.perf_counter()
                    o = arc.handle({"screen": "route", "day": day, "planner": planner,
                                    "profile": {"research": q, "pace": pace}})
                    ms = (time.perf_counter() - t0) * 1000
                    if not o.get("stops"):
                        break
                    rank = {r["id"]: r["rank"] for r in o["recommendations"]}
                    picks = [s for s in o["stops"] if s["kind"] == "pick"]
                    outs[planner] = {
                        "total": sum(s["score"] for s in picks), "stops": len(o["stops"]),
                        "top1": o["recommendations"][0]["status"] == "in_route",
                        "top16_in_route": sum(r["status"] == "in_route" for r in o["recommendations"]),
                        "alternatives": sum(r["status"] == "alternative" for r in o["recommendations"]),
                        "mean_rank": float(np.mean([rank.get(s["id"], 17) for s in picks])) if picks else 0,
                        "ids": sorted(s["id"] for s in picks), "ms": ms}
                if len(outs) == 2:
                    res.setdefault(pace, []).append(outs)
        print(f"{n + 1}/{len(qs)} {q[:50]}", flush=True)
    rep = {"profiles": len(qs), "days": len(arc.days)}
    for pace, rows in res.items():
        g = {p: [r[p] for r in rows] for p in ("greedy", "best")}
        diff = [r["best"]["total"] - r["greedy"]["total"] for r in rows]
        rep[f"pace{pace}"] = {
            "routes": len(rows),
            "same_route": round(float(np.mean([r["best"]["ids"] == r["greedy"]["ids"] for r in rows])), 3),
            "best_higher": round(float(np.mean([d > 1e-6 for d in diff])), 3),
            "gain_when_higher_pct": round(float(np.mean([d / r["greedy"]["total"] * 100 for d, r in zip(diff, rows)
                                                          if d > 1e-6] or [0])), 2),
            **{p: {"total_score": round(float(np.mean([x["total"] for x in v])), 3),
                   "stops": round(float(np.mean([x["stops"] for x in v])), 2),
                   "top1_in_route": round(float(np.mean([x["top1"] for x in v])), 3),
                   "top16_in_route": round(float(np.mean([x["top16_in_route"] for x in v])), 2),
                   "top16_as_alternative": round(float(np.mean([x["alternatives"] for x in v])), 2),
                   "mean_rank_of_picks": round(float(np.mean([x["mean_rank"] for x in v])), 2),
                   "ms_median": round(float(np.median([x["ms"] for x in v])), 1),
                   "ms_p95": round(float(np.percentile([x["ms"] for x in v], 95)), 1)}
               for p, v in g.items()}}
        print(pace, json.dumps(rep[f"pace{pace}"], indent=1), flush=True)
    path = os.path.join(ROOT, "docs", "planner_report.json")
    json.dump(rep, open(path, "w"), indent=1)
    print("wrote", path)


if __name__ == "__main__":
    main()
