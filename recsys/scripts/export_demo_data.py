#!/usr/bin/env python3
"""Precompute top-8 recommendations for sample topics with the on-device model
and dump a self-contained JSON blob to embed in the showcase artifact (so the
Paper World Cup works client-side with no server).

Uses exactly what app/offline runs: the int8 student embeds the query, BM25
scores the abstracts, and the two are fused with the hybrid weight from
app/offline/data/config.json. Runs on CPU in a few seconds.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402

TOPICS = [
    "privacy and user trust in wearable AI devices",
    "large language models for accessibility",
    "virtual reality for education and learning",
    "haptic feedback interfaces",
    "AI-assisted mental health support",
    "gesture and gaze based interaction",
]
APP = os.path.join(config.ROOT, "app", "offline")


def main():
    import numpy as np
    import onnxruntime as ort
    from rank_bm25 import BM25Okapi
    from tokenizers import Tokenizer

    with open(config.CORPUS, encoding="utf-8") as f:
        corpus = json.load(f)
    with open(os.path.join(APP, "data", "config.json")) as f:
        cfg = json.load(f)
    D = np.fromfile(os.path.join(APP, "data", "doc_emb.f32"), dtype="<f4").reshape(cfg["n"], cfg["dim"])
    tok = Tokenizer.from_file(os.path.join(APP, "model", "tokenizer.json"))
    so = ort.SessionOptions()
    so.intra_op_num_threads = 4
    sess = ort.InferenceSession(os.path.join(APP, "model", "model_int8.onnx"), so,
                                providers=["CPUExecutionProvider"])
    tokz = lambda s: re.findall(r"\w+", s.lower())
    bm = BM25Okapi([tokz(f"{r['title']}. {r['abstract']}") for r in corpus])
    minmax = lambda x: (x - x.min()) / (x.max() - x.min() + 1e-9)

    out = {"model": "on-device student (int8) + BM25 hybrid", "n_docs": len(corpus), "topics": []}
    for q in TOPICS:
        ids = tok.encode(cfg["query_prefix"] + q).ids[: cfg["max_len"]]
        qv = sess.run(None, {"input_ids": np.array([ids], dtype="int64"),
                             "attention_mask": np.ones((1, len(ids)), dtype="int64")})[0][0]
        dense = D @ qv
        fused = minmax(dense) + cfg["hybrid_w"] * minmax(bm.get_scores(tokz(q)))
        cards = []
        for i in np.argsort(-fused)[:8]:
            r = corpus[i]
            cards.append({
                "id": r["id"], "title": r["title"], "type": r["type"],
                "score": round(float(dense[i]), 4),
                "authors": [a["name"] for a in r["authors"]],
                "track": r["track"], "abstract": (r["abstract"] or "")[:300],
                "room": r["room"], "floor": r["floor"], "session": r["session_name"],
                "start": r["start"], "end": r["end"], "doi": r["doi"],
            })
        out["topics"].append({"query": q, "top8": cards})
    path = os.path.join(config.ROOT, "app", "demo_data.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print("WROTE", path, round(os.path.getsize(path) / 1024, 1), "KB,",
          len(out["topics"]), "topics")


if __name__ == "__main__":
    main()
