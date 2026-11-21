#!/usr/bin/env python3
"""Evaluate document expansion (doc2query) for the on-device ranking.

Each paper gets LLM-written search phrases (scripts/gen_expansions.py, a separate
sample from the training/evaluation queries) added to its keyword index. Two ways:

  separate  a second BM25 over the phrases only:
            score = minmax(cos) + 0.5*minmax(BM25 abstract) + wx*minmax(BM25 phrases)
  combined  the phrases appended to title + abstract in one BM25

Held-out papers (split-trained models, never seen in training): settings chosen on
the dev half (highest R@8, then R@1), reported on the test half. Both with and
without the aspect pass (aspect_w 0.3).

Caveat: the phrases and the evaluation queries come from the same LLM, so their
wording may match better than a real user's would. The hand-written short queries
at the end (top 3 before/after on the packaged model) are the sanity check.

  python scripts/eval_expansion.py      # writes docs/expansion_report.json
"""
import json
import os
import sys
import time

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = os.path.join(ROOT, "dist", "chi2026-retriever")
RUNS = os.path.join(ROOT, "models", "ft_runs")
sys.path.insert(0, PKG)
sys.dont_write_bytecode = True
os.environ.setdefault("CHI_LANGS", "en")
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "src"))
import eval_rerank as er  # noqa: E402
import train_retriever as tr  # noqa: E402
from retriever import BM25, QueryEncoder, Ranker, Retriever, _minmax  # noqa: E402

WX = [0.1, 0.25, 0.5, 0.75, 1.0]
HAND = ["motion sickness in vr", "self-driving car", "kids and screen time",
        "LLM coding assistants for novice programmers", "sign language",
        "chatgpt in the classroom", "deepfake", "older people using voice assistants",
        "AR glasses for blind people", "burnout of gig workers"]


def main():
    corpus, ids, docs, queries, test_ids = tr.load_data()
    pos = {pid: i for i, pid in enumerate(ids)}
    exp = json.load(open(os.path.join(ROOT, "data", "processed", "doc_expansions.json")))
    phrases = [exp.get(str(i), []) for i in ids]
    te = [q for q in queries if q["id"] in test_ids]
    ts = sorted(test_ids)
    dev = set(ts[::2])
    sets = {"dev": [q for q in te if q["id"] in dev], "test": [q for q in te if q["id"] not in dev]}
    enc = QueryEncoder(er.split_root())
    D = np.load(os.path.join(RUNS, "teacher_split", "doc_emb.npy"))
    rk = Ranker(D, docs, enc, dict(enc.cfg))
    rk_comb = Ranker(D, [f"{d} ; {' ; '.join(p)}" for d, p in zip(docs, phrases)], enc, dict(enc.cfg))
    bx = BM25([" ; ".join(p) for p in phrases])
    w = enc.cfg["hybrid_w"]
    combos = [("none", 0.0)] + [("separate", x) for x in WX] + [("combined", 0.0)]
    rep = {"n_phrases": sum(map(len, phrases)), "papers_with_phrases": sum(bool(p) for p in phrases)}

    def run(qs):
        res = {}
        for n, q in enumerate(qs):
            g = pos[q["id"]]
            sim = D @ enc(q["query"])
            mc = _minmax(sim)
            bd = _minmax(rk.bm25.scores(q["query"]))
            bxs = _minmax(bx.scores(q["query"]))
            bc = _minmax(rk_comb.bm25.scores(q["query"]))
            asp = rk.aspects(q["query"])
            per_d = np.stack([_minmax(rk.bm25.scores(a)) for a in asp]).min(0) if asp else 0
            per_c = np.stack([_minmax(rk_comb.bm25.scores(a)) for a in asp]).min(0) if asp else 0
            for mode, x in combos:
                base = mc + w * (bc if mode == "combined" else bd) + (x * bxs if mode == "separate" else 0)
                for aw in (0.0, 0.3):
                    s = base + aw * (per_c if mode == "combined" else per_d)
                    r = int((s > s[g]).sum()) + 1
                    res.setdefault(f"{mode} wx={x} aspect_w={aw}", []).append(r)
            if n % 150 == 0:
                print(f"  {n}/{len(qs)}", flush=True)
        return {k: {"R@1": round(float((np.array(v) <= 1).mean()), 4),
                    "R@8": round(float((np.array(v) <= 8).mean()), 4)} for k, v in res.items()}

    rep["dev"] = run(sets["dev"])
    for k, v in rep["dev"].items():
        print("dev", k, v, flush=True)
    best = max(rep["dev"], key=lambda k: (rep["dev"][k]["R@8"], rep["dev"][k]["R@1"]))
    rep["chosen"] = best
    t = run(sets["test"])
    rep["test"] = {"none (aspect_w=0)": t["none wx=0.0 aspect_w=0.0"],
                   "current (aspect_w=0.3)": t["none wx=0.0 aspect_w=0.3"],
                   "chosen: " + best: t[best], "all": t}
    print("chosen", best, flush=True)
    print("test", {k: v for k, v in rep["test"].items() if k != "all"}, flush=True)

    # hand-written short queries on the packaged (deployed) model: top 3 before / after
    mode, x, aw = best.split()[0], float(best.split()[1][3:]), float(best.split()[2][9:])
    r = Retriever(PKG)
    papers = r.papers
    pid_phr = [exp.get(str(p["id"]), []) for p in papers]
    hand = {}
    lat = {"before": [], "after": []}
    for label in ("before", "after"):
        if label == "after":
            if mode == "separate":
                r.ranker.bm25x = BM25([" ; ".join(p) for p in pid_phr])
                r.cfg["expansion_w"] = x
            elif mode == "combined":
                r.ranker.bm25 = BM25([f"{p['title']}. {p['abstract']} ; {' ; '.join(e)}"
                                      for p, e in zip(papers, pid_phr)])
            r.cfg["aspect_w"] = aw
        for q in HAND:
            t0 = time.perf_counter()
            out = r.predict({"research_topic": q, "top_k": 8})
            lat[label].append((time.perf_counter() - t0) * 1000)
            hand.setdefault(q, {})[label] = [x_["title"] for x_ in out["results"]]
    rep["hand"] = hand
    rep["latency_ms_median"] = {k: round(float(np.median(v)), 1) for k, v in lat.items()}
    for q, v in hand.items():
        print(f"\n{q}\n  before: " + " | ".join(t[:50] for t in v["before"][:3])
              + "\n  after:  " + " | ".join(t[:50] for t in v["after"][:3]))
    print("latency", rep["latency_ms_median"])
    path = os.path.join(ROOT, "docs", "expansion_report.json")
    json.dump(rep, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote", path)


if __name__ == "__main__":
    main()
