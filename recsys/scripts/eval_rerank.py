#!/usr/bin/env python3
"""Evaluate the Ranker's second pass (aspects, diversity, relevance floor).

All three use only what is already on the device (no new model), so the question
is only whether they help without hurting the plain hybrid ranking:

1. Held-out accuracy with the split-trained models (held-out papers never seen in
   training): R@1/R@8 on the dev half for a grid of aspect_w and mmr_lambda
   (aspects scored by keywords, no extra model call), the chosen setting reported
   on the test half. Rule: highest dev R@8 (the top 8 is what the app shows), then
   highest dev R@1.
2. Multi-aspect queries ("kids and screen time"): share of the top 8 that mention
   every aspect (word lists below), and how many different sessions the top 8 span.
3. Relevance floor: the raw cosine of the best paper for held-out queries vs
   off-topic queries; the floor is set so that about 1% of held-out (in-domain)
   queries would be warned (a wrong warning on a good query costs more than a
   missed one on an off-topic query).

Needs models/ft_runs/teacher_split/doc_emb.npy (teacher_split document vectors,
one GPU pass) and the packaged model in dist/chi2026-retriever for parts 2-3.

  python scripts/eval_rerank.py      # writes docs/rerank_report.json
"""
import json
import os
import shutil
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
import train_retriever as tr  # noqa: E402
from retriever import QueryEncoder, Ranker, Retriever, _norm  # noqa: E402

ASPECT_W = [0.0, 0.1, 0.2, 0.3, 0.5]
MMR = [1.0, 0.9, 0.8, 0.7]

# two-aspect research topics; a paper "covers" an aspect if its title or abstract
# has one of the words (prefix match on word starts)
MULTI = [
    ("kids and screen time", [["child", "kid", "teen", "adolescen", "youth", "parent"], ["screen time", "screen use", "smartphone use", "digital wellbeing", "social media"]]),
    ("haptic feedback for older adults", [["haptic", "vibrotactile", "tactile"], ["older adult", "elderly", "aging", "ageing", "senior"]]),
    ("LLM tutors in programming education", [["llm", "language model", "chatgpt", "gpt", "generative ai"], ["programming", "coding", "code", "software"]]),
    ("VR for chronic pain", [["virtual reality", "vr ", "immersive"], ["pain"]]),
    ("privacy of smart home cameras", [["privacy", "surveillance"], ["smart home", "home camera", "camera", "doorbell"]]),
    ("accessible data visualization for blind users", [["visualization", "chart", "graph"], ["blind", "visually impaired", "low vision", "screen reader"]]),
    ("mental health chatbots for students", [["mental health", "wellbeing", "well-being", "depress", "anxiety"], ["chatbot", "conversational agent", "llm", "agent"]]),
    ("deepfake detection by older adults", [["deepfake", "synthetic media", "ai-generated"], ["older adult", "elderly", "senior", "aging"]]),
    ("gesture input on smartwatches", [["gesture"], ["smartwatch", "watch", "wrist"]]),
    ("misinformation on social media during elections", [["misinformation", "disinformation", "fake news", "fact-check"], ["election", "political", "politic", "voting"]]),
    ("sign language translation with AI", [["sign language", "deaf", "asl"], ["ai", "machine learning", "model", "recognition", "translation"]]),
    ("autonomous vehicles communicating with pedestrians", [["autonomous vehicle", "self-driving", "automated vehicle", "autonomous driving"], ["pedestrian", "ehmi", "crossing"]]),
    ("children's online safety and gaming", [["child", "kid", "teen", "youth", "adolescen"], ["game", "gaming", "play"]]),
    ("crowdworkers and AI labor", [["crowdwork", "crowd work", "gig", "worker", "labor", "labour"], ["ai", "machine learning", "algorithm", "automation"]]),
    ("eye tracking in virtual reality", [["eye tracking", "gaze", "eye-tracking"], ["virtual reality", "vr ", "xr", "mixed reality", "head-mounted"]]),
    ("sustainable food practices and technology", [["food", "eating", "meal", "diet"], ["sustainab", "climate", "environment", "waste"]]),
    ("AI writing assistants for non-native speakers", [["writing", "writer"], ["non-native", "second language", "l2", "esl", "multilingual", "english learner"]]),
    ("wearable sensors for stress", [["wearable", "sensor", "smartwatch", "physiological"], ["stress", "anxiety"]]),
    ("dark patterns in mobile apps", [["dark pattern", "deceptive design", "manipulat"], ["mobile", "app", "smartphone"]]),
    ("explainable AI for doctors", [["explain", "explanation", "xai", "interpretab"], ["clinician", "doctor", "physician", "medical", "clinical"]]),
]

OFF_TOPIC = [
    "diffusion large language models", "helping people quit smoking", "protein folding prediction",
    "stock market price forecasting", "quantum error correction", "crop yield estimation from satellites",
    "best pizza recipes in Naples", "compiler optimization for GPUs", "dark matter detection",
    "medieval European tax law", "battery chemistry for electric cars", "earthquake early warning seismology",
    "blockchain consensus algorithms", "antibiotic resistance in hospitals", "football match outcome prediction",
    "volcanic ash dispersion modelling", "high frequency trading latency", "plant genome sequencing",
    "rocket engine combustion", "tax evasion detection in banking",
]


def covers(text, words):
    t = " " + _norm(text) + " "
    return any((" " + _norm(w)) in t if not w.endswith(" ") else (" " + _norm(w) + " ") in t
               for w in words)


def split_root():
    """A model folder for QueryEncoder with the split-trained student."""
    d = os.path.join(RUNS, "student_split_en", "pkg")
    os.makedirs(d, exist_ok=True)
    s = os.path.join(RUNS, "student_split_en")
    for f in ("model_int8.onnx", "tokenizer.json"):
        if not os.path.exists(os.path.join(d, f)):
            shutil.copy(os.path.join(s, f), d)
    sc = json.load(open(os.path.join(s, "student_config.json")))
    json.dump({"query_prefix": sc["query_prefix"], "max_len": sc["max_len"], "hybrid_w": 0.5},
              open(os.path.join(d, "config.json"), "w"))
    return d


def grid_ranks(ranker, qs, gold, combos):
    """Rank of the right paper for every (aspect_w, mmr_lambda), each query's
    vectors and scores computed once."""
    out = {c: [] for c in combos}
    for n, (q, g) in enumerate(zip(qs, gold)):
        sim, base, asp, per = ranker.parts(q, mode="keyword")
        for aw, ml in combos:
            order, _ = ranker.order(base, per, aw, ml)
            out[(aw, ml)].append(int(np.flatnonzero(order == g)[0]) + 1)
        if n % 100 == 0:
            print(f"  {n}/{len(qs)}", flush=True)
    res = {}
    for c, r in out.items():
        r = np.array(r)
        res[c] = {"R@1": round(float((r <= 1).mean()), 4), "R@8": round(float((r <= 8).mean()), 4)}
    return res


def main():
    corpus, ids, docs, queries, test_ids = tr.load_data()
    pos = {pid: i for i, pid in enumerate(ids)}
    te = [q for q in queries if q["id"] in test_ids]
    test_sorted = sorted(test_ids)
    dev_ids = set(test_sorted[::2])
    sets = {"dev": [q for q in te if q["id"] in dev_ids],
            "test": [q for q in te if q["id"] not in dev_ids]}
    enc = QueryEncoder(split_root())
    D = np.load(os.path.join(RUNS, "teacher_split", "doc_emb.npy"))
    ranker = Ranker(D, docs, enc, dict(enc.cfg))
    rep = {"grid_dev": {}}

    # 1. held-out accuracy
    dq = [q["query"] for q in sets["dev"]]
    dg = [pos[q["id"]] for q in sets["dev"]]
    combos = [(aw, ml) for aw in ASPECT_W for ml in MMR]
    for (aw, ml), v in grid_ranks(ranker, dq, dg, combos).items():
        rep["grid_dev"][f"aspect_w={aw} mmr={ml}"] = v
        print("dev", aw, ml, v, flush=True)
    g = rep["grid_dev"]
    aw, ml = max(combos, key=lambda c: (g[f"aspect_w={c[0]} mmr={c[1]}"]["R@8"],
                                         g[f"aspect_w={c[0]} mmr={c[1]}"]["R@1"], -c[0], c[1]))
    rep["chosen"] = {"aspect_w": aw, "mmr_lambda": ml, "aspect_mode": "keyword"}
    tq = [q["query"] for q in sets["test"]]
    tg = [pos[q["id"]] for q in sets["test"]]
    t = grid_ranks(ranker, tq, tg, [(0.0, 1.0), (aw, ml)])
    rep["test"] = {"plain": t[(0.0, 1.0)], "chosen": t[(aw, ml)], "n": len(tq)}
    print("test", rep["test"], flush=True)

    # 3. relevance floor (split model, held-out queries vs off-topic)
    top_in = np.array([float((D @ enc(q)).max()) for q in tq])
    top_off = np.array([float((D @ enc(q)).max()) for q in OFF_TOPIC])
    floor = round(float(np.percentile(top_in, 1)), 3)
    rep["relevance"] = {"floor": floor, "percentile": 1,
                        "by_percentile": {p: {"floor": round(float(np.percentile(top_in, p)), 3),
                                              "in_domain_warned": round(float((top_in < np.percentile(top_in, p)).mean()), 4),
                                              "off_topic_warned": round(float((top_off < np.percentile(top_in, p)).mean()), 4)}
                                          for p in (0.5, 1, 2)}, "in_domain_warned": round(float((top_in < floor).mean()), 4),
                        "off_topic_warned": round(float((top_off < floor).mean()), 4),
                        "in_domain_top_sim_median": round(float(np.median(top_in)), 3),
                        "off_topic_top_sim": {q: round(float(s), 3) for q, s in zip(OFF_TOPIC, top_off)}}
    print("relevance", {k: v for k, v in rep["relevance"].items() if k != "off_topic_top_sim"}, flush=True)

    # 2. multi-aspect + diversity + latency on the packaged (deployed) model
    r = Retriever(PKG)
    papers = r.papers
    text = [f"{p['title']}. {p['abstract']}" for p in papers]
    rows = {}
    for name, (a, m) in {"plain": (0.0, 1.0), "chosen": (aw, ml)}.items():
        r.cfg["aspect_w"], r.cfg["mmr_lambda"], r.cfg["aspect_mode"] = a, m, "keyword"
        r.cfg["relevance_floor"] = None
        cov, sess, lat, per = [], [], [], {}
        for q, asp in MULTI:
            t0 = time.perf_counter()
            out = r.predict({"research_topic": q, "top_k": 8})
            lat.append((time.perf_counter() - t0) * 1000)
            idx = [next(i for i, p in enumerate(papers) if p["id"] == x["id"]) for x in out["results"]]
            c = [all(covers(text[i], w) for w in asp) for i in idx]
            cov.append(sum(c))
            sess.append(len({papers[i]["session"] for i in idx}))
            per[q] = {"both_aspects": sum(c), "sessions": sess[-1],
                      "titles": [papers[i]["title"] for i in idx]}
        rows[name] = {"both_aspects_of_8": round(float(np.mean(cov)), 2),
                      "distinct_sessions_of_8": round(float(np.mean(sess)), 2),
                      "latency_ms_median": round(float(np.median(lat)), 1),
                      "latency_ms_max": round(float(np.max(lat)), 1), "per_query": per}
        print(name, {k: v for k, v in rows[name].items() if k != "per_query"}, flush=True)
    rep["multi_aspect"] = rows
    path = os.path.join(ROOT, "docs", "rerank_report.json")
    json.dump(rep, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote", path)


if __name__ == "__main__":
    main()
