#!/usr/bin/env python3
"""The phone model against the server model: accuracy and how often they agree (GPU node).

server   fine-tuned BAAI/bge-m3 (2.2 GB, needs a GPU server) embeds the query; paper
         vectors 1,024-d float32; score = minmax(cos) + 0.5 * minmax(BM25)
device   the packaged model (scripts/train_light.py): static token vectors (8 MB), paper
         vectors 128-d int8, its own BM25 weight; runs in the phone's browser

1. accuracy on held-out papers (test half; split models never saw them), plus the
   off-the-shelf bge-m3 and the first on-device model (34 MB transformer) for scale
2. agreement on the same requests with the deployed models: retriever top 8 for 52
   research questions, and the ARC route (6 stops) for them on all five days
3. size and time per query

  sbatch scripts/eval_ondevice.slurm        # writes docs/ondevice_report.json
"""
import json
import os
import shutil
import sys
import tempfile
import time

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = os.path.join(ROOT, "dist", "chi2026-retriever")
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, PKG)
sys.dont_write_bytecode = True
import train_light as tl  # noqa: E402
import train_retriever as tr  # noqa: E402
from eval_planner import HAND  # noqa: E402

CACHE = os.path.join(tl.OUT, "server_cache.npz")


def metrics(ranks):
    r = np.array(ranks)
    return {"R@1": round(float((r <= 1).mean()), 4), "R@8": round(float((r <= 8).mean()), 4)}


def ranks(sims, bms, gold, w):
    out = []
    for sim, b, g in zip(sims, bms, gold):
        s = tl._minmax(sim) + w * tl._minmax(b) if w else sim
        out.append(int((s > s[g]).sum()) + 1)
    return out


def profiles():
    cases = json.load(open(os.path.join(ROOT, "tests", "cases.json")))
    qs = [c["input"]["research_topic"] for c in cases if c["group"] in ("normal", "fuzzy")]
    import random
    synth = [q["query"] for q in json.load(open(os.path.join(ROOT, "data", "processed", "synth_queries.json")))
             if q.get("lang", "en") == "en"]
    random.Random(0).shuffle(synth)
    return list(dict.fromkeys(qs + HAND + synth[:30]))


def server_package(tmp):
    """The packaged model with the server's vectors: 1,024-d float32, BM25 weight 0.5,
    the cosine relevance floor. The query encoder is swapped in after loading."""
    shutil.copytree(PKG, tmp, dirs_exist_ok=True)
    for f in ("program_vec.npy", "program_scale.npy"):
        os.remove(os.path.join(tmp, f))
    shutil.copy(os.path.join(ROOT, "models", "program_emb.npy"), tmp)
    cfg = json.load(open(os.path.join(tmp, "config.json")))
    cfg.update(hybrid_w=0.5, relevance_floor=0.318, same_topic_sim=0.75)
    cfg.pop("relevance", None)
    json.dump(cfg, open(os.path.join(tmp, "config.json"), "w"))
    return tmp


def main():
    from retriever import Retriever
    from arc import ARC
    rep = {}
    # ---- 1. held-out accuracy (test half)
    _, _, sets, bm_texts, _, pos = tl.training_set(True)
    test = sets["test"]
    gold = [pos[q["id"]] for q in test]
    bm = tl.BM25(bm_texts)
    bms = [bm.scores(q["query"]) for q in test]

    # ---- 2. the strings the device embeds for the agreement requests
    qs = profiles()
    dev_r, dev_a = Retriever(PKG), ARC(PKG)
    asked = []
    dev_a.ex.embed = (lambda f: (lambda t: (asked.append(t), f(t))[1]))(dev_a.ex.embed)
    dev_r.ranker.embed = (lambda f: (lambda t: (asked.append(t), f(t))[1]))(dev_r.ranker.embed)
    days = dev_a.days
    device = {"retriever": {}, "route": {}}
    t_dev = []
    for q in qs:
        t0 = time.perf_counter()
        device["retriever"][q] = [r["id"] for r in dev_r.predict({"research_topic": q, "top_k": 8})["results"]]
        t_dev.append((time.perf_counter() - t0) * 1000)
        for d in days:
            o = dev_a.handle({"screen": "route", "day": d, "profile": {"research": q, "pace": 3}})
            device["route"][f"{q}|{d}"] = [s["id"] for s in o.get("stops", [])]
    asked = list(dict.fromkeys(asked))

    # ---- GPU: server vectors (cached)
    if os.path.exists(CACHE):
        z = np.load(CACHE, allow_pickle=True)
        cache = {k: z[k] for k in z.files}
    else:
        import torch
        from sentence_transformers import SentenceTransformer
        cache = {}
        m = SentenceTransformer(os.path.join(tl.RUNS, "teacher_split"), device="cuda")
        cache["split_q"] = tr.encode(m, [q["query"] for q in test], bs=128)
        del m
        m = SentenceTransformer(tr.TEACHER_BASE, device="cuda", cache_folder=os.environ.get("HF_HOME"))
        m.max_seq_length = 512
        cache["base_q"] = tr.encode(m, [q["query"] for q in test], bs=128)
        corpus, ids, docs, _, _ = tr.load_data()
        cache["base_d"] = tr.encode(m, docs, bs=32)
        del m
        m = SentenceTransformer(tr.TEACHER_OUT, device="cuda")
        cache["full_q"] = tr.encode(m, asked, bs=128)
        cache["asked"] = np.array(asked, dtype=object)
        lat = []
        for q in qs[:30]:
            torch.cuda.synchronize()
            t0 = time.perf_counter()
            tr.encode(m, [q], bs=1)
            torch.cuda.synchronize()
            lat.append((time.perf_counter() - t0) * 1000)
        cache["gpu_ms"] = np.array([float(np.median(lat))])
        np.savez(CACHE, **cache)
    D = tl.doc_matrix(True)
    sims = [D @ v for v in cache["split_q"]]
    acc = {"server_finetuned_dense": metrics(ranks(sims, bms, gold, 0)),
           "server_finetuned_hybrid_w0.5": metrics(ranks(sims, bms, gold, 0.5))}
    sims_b = [cache["base_d"] @ v for v in cache["base_q"]]
    acc["bge_m3_offshelf_dense"] = metrics(ranks(sims_b, bms, gold, 0))
    acc["bge_m3_offshelf_hybrid_w0.5"] = metrics(ranks(sims_b, bms, gold, 0.5))
    lr = json.load(open(os.path.join(ROOT, "docs", "light_report.json")))
    acc["device_v1_34MB_transformer"] = lr["variants"]["current_L12 d1024"]["test"]["hybrid"]
    acc["device_v2_8MB_static"] = lr["chosen"]["eval"]["hybrid"]
    acc["bm25_only"] = lr["variants"]["bm25_only"]["test"]["hybrid"]
    rep["accuracy_test_half"] = {"n_queries": len(test), **acc}
    print(json.dumps(rep, indent=1), flush=True)

    # ---- 2. agreement, server pass
    vec = {t: v.astype(np.float32) for t, v in zip(cache["asked"], cache["full_q"])}
    tmp = server_package(tempfile.mkdtemp())
    srv_r, srv_a = Retriever(tmp), ARC(tmp)
    srv_r.ranker.embed = lambda t: vec[t]
    srv_a.ex.embed = lambda t: vec[t]
    o8, top1, jac, same_n, quality = [], [], [], [], []
    for q in qs:
        sc = srv_a._score(srv_a._profile({"research": q}))
        s = [r["id"] for r in srv_r.predict({"research_topic": q, "top_k": 8})["results"]]
        d = device["retriever"][q]
        o8.append(len(set(s) & set(d)) / 8)
        top1.append(s[0] == d[0])
        for day in days:
            so = [x["id"] for x in srv_a.handle({"screen": "route", "day": day,
                                                 "profile": {"research": q, "pace": 3}}).get("stops", [])]
            do = device["route"][f"{q}|{day}"]
            if so and do:
                # how good the phone's route is by the server's own scores
                val = lambda ids: sum(float(sc[srv_a._item_by_id(x)]) for x in ids) / len(ids)
                quality.append(val(do) / val(so))
            if so or do:
                jac.append(len(set(so) & set(do)) / len(set(so) | set(do)))
                same_n.append(len(set(so) & set(do)))
    shutil.rmtree(tmp)
    rep["agreement"] = {
        "requests": len(qs), "routes": len(jac),
        "retriever_top8_overlap": round(float(np.mean(o8)), 4),
        "retriever_same_top1": round(float(np.mean(top1)), 4),
        "route_stop_jaccard": round(float(np.mean(jac)), 4),
        "route_same_stops_mean": round(float(np.mean(same_n)), 2),
        "route_identical": round(float(np.mean([j == 1.0 for j in jac])), 4),
        "route_quality_by_server_score": round(float(np.mean(quality)), 4),
        "route_quality_p10": round(float(np.percentile(quality, 10)), 4),
        "note": "route quality = mean server score of the phone's stops / of the server's stops; "
                "server BM25 weight 0.5, phone 1.0 (each tuned for its encoder)"}
    mb = lambda f: round(os.path.getsize(f) / 1e6, 2)
    rep["size_time"] = {
        "server": {"encoder_mb": round(sum(os.path.getsize(os.path.join(tr.TEACHER_OUT, f))
                                            for f in os.listdir(tr.TEACHER_OUT)
                                            if os.path.isfile(os.path.join(tr.TEACHER_OUT, f))) / 1e6),
                   "paper_vectors_mb": mb(os.path.join(ROOT, "models", "program_emb.npy")),
                   "query_ms_gpu": round(float(cache["gpu_ms"][0]), 1), "needs": "GPU server + network"},
        "device": {"encoder_mb": round(sum(mb(os.path.join(PKG, f)) for f in
                                           ("static_tokens.npy", "static_scales.npy", "static_head.npy")), 2),
                   "paper_vectors_mb": round(mb(os.path.join(PKG, "program_vec.npy"))
                                             + mb(os.path.join(PKG, "program_scale.npy")), 2),
                   "retriever_request_ms_cpu_python": round(float(np.median(t_dev)), 1),
                   "needs": "nothing: the phone's browser, offline"}}
    print(json.dumps({k: rep[k] for k in ("agreement", "size_time")}, indent=1))
    json.dump(rep, open(os.path.join(ROOT, "docs", "ondevice_report.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
