#!/usr/bin/env python3
"""Evaluate on-device hybrid retrieval: student (int8 ONNX) + BM25 fusion.

Everything here can run in a phone/browser: the student embeds the query,
BM25 is plain term statistics over the 2,509 abstracts, and the two scores
are fused per query:  score = minmax(student) + w * minmax(bm25).

Uses the split-trained artifacts (models/ft_runs/{teacher,student}_split) so the
held-out papers are never seen in training. The held-out queries are split by
paper into dev (pick w) and test (report), so w is not tuned on test.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.dirname(__file__))
import config  # noqa: E402
import train_retriever as tr  # noqa: E402

WEIGHTS = [0.0, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5]


def metrics(scores, gold, langs):
    import numpy as np
    g = scores[np.arange(len(gold)), gold]
    # expected rank under random tie-breaking (1 = best); BM25 gives
    # all-zero scores to queries with no shared terms, which must not count as hits
    ranks = ((scores > g[:, None]).sum(1) + 1
             + ((scores == g[:, None]).sum(1) - 1) / 2)
    langs = np.array(langs)

    def s(m):
        r = ranks[m]
        return {"n": int(m.sum()), "R@1": round(float((r <= 1).mean()), 4),
                "R@8": round(float((r <= 8).mean()), 4),
                "MRR@10": round(float(np.where(r <= 10, 1.0 / r, 0).mean()), 4)}
    out = {"all": s(np.ones(len(ranks), bool))}
    for l in ("en", "ko"):
        if (langs == l).any():
            out[l] = s(langs == l)
    return out


def minmax(x):
    lo, hi = x.min(1, keepdims=True), x.max(1, keepdims=True)
    return (x - lo) / (hi - lo + 1e-9)


def main():
    import numpy as np
    from rank_bm25 import BM25Okapi
    from sentence_transformers import SentenceTransformer
    from transformers import AutoTokenizer

    corpus, ids, docs, queries, test_ids = tr.load_data()
    pos = {pid: i for i, pid in enumerate(ids)}
    te = [q for q in queries if q["id"] in test_ids]
    test_sorted = sorted(test_ids)
    dev_ids = set(test_sorted[::2])
    sets = {"dev": [q for q in te if q["id"] in dev_ids],
            "test": [q for q in te if q["id"] not in dev_ids]}

    teacher = SentenceTransformer(os.path.join(tr.RUNS, "teacher_split"),
                                  device="cuda")
    D = tr.encode(teacher, docs)
    sdir = os.path.join(tr.RUNS, "student_split" + tr.TAG)
    tok = AutoTokenizer.from_pretrained(sdir)
    tokz = lambda s: re.findall(r"\w+", s.lower())
    bm = BM25Okapi([tokz(d) for d in docs])

    res = {}
    cache = {}
    for name, qs in sets.items():
        texts = [q["query"] for q in qs]
        gold = np.array([pos[q["id"]] for q in qs])
        langs = [q["lang"] for q in qs]
        dense = tr.onnx_encode(os.path.join(sdir, "model_int8.onnx"), tok, texts) @ D.T
        sparse = np.stack([bm.get_scores(tokz(t)) for t in texts])
        cache[name] = (minmax(dense), minmax(sparse), gold, langs)

    dn, sp, g, l = cache["dev"]
    dev = {w: metrics(dn + w * sp, g, l)["all"]["R@8"] for w in WEIGHTS}
    best_w = max(dev, key=dev.get)
    res["dev_R@8_by_w"] = dev
    res["best_w"] = best_w
    dn, sp, g, l = cache["test"]
    res["test_student_int8"] = metrics(dn, g, l)
    res["test_bm25"] = metrics(sp, g, l)
    res["test_hybrid"] = metrics(dn + best_w * sp, g, l)
    path = os.path.join(config.ROOT, "docs", f"hybrid_report{tr.TAG}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
