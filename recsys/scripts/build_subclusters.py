#!/usr/bin/env python3
"""Second level of the topic clusters: each of the 20 clusters split into a few
sub-topics, so the app can start broad and narrow down to where a recommended talk sits
(11/7 meeting: "start big by topic, then narrow"). CPU, a few seconds.

Each cluster is split again with k-means on the same teacher vectors into about one
sub-topic per 35 talks (3-6), each at least 8 talks. Keywords are class-based
TF-IDF against the other sub-topics of the same cluster (what sets this one apart from
its siblings), so they differ from the parent's keywords. Writes "subclusters" into
data/processed/clusters.json; scripts/name_clusters.py --sub names them.

  python scripts/build_subclusters.py
"""
import json
import math
import os
import sys
from collections import Counter

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from build_clusters import terms  # noqa: E402

SEED = 0
MIN_SIZE = 8
TARGET = 35
WEAK = {"has", "have", "how", "what", "their", "them", "these", "shows", "show"}


def main():
    path = os.path.join(ROOT, "data", "processed", "clusters.json")
    data = json.load(open(path, encoding="utf-8"))
    items = json.load(open(os.path.join(ROOT, "data", "processed", "program.json")))
    pos = {it["id"]: i for i, it in enumerate(items)}
    emb = np.load(os.path.join(ROOT, "models", "program_emb.npy"))
    exp = json.load(open(os.path.join(ROOT, "data", "processed", "doc_expansions.json")))
    report = []
    for c in data["clusters"]:
        ids = c["items"]
        X = emb[[pos[i] for i in ids]]
        X = X / np.linalg.norm(X, axis=1, keepdims=True)
        # about TARGET talks per sub-topic (3-6 of them): silhouette alone splits almost
        # every cluster in two, which narrows too little; fewer if one comes out tiny
        k = int(min(6, max(3, round(len(ids) / TARGET))))
        while True:
            km = KMeans(k, n_init=10, random_state=SEED).fit(X)
            if np.bincount(km.labels_).min() >= MIN_SIZE or k == 2:
                break
            k -= 1
        sil = silhouette_score(X, km.labels_, metric="cosine")
        lab = km.labels_
        cent = km.cluster_centers_ / np.linalg.norm(km.cluster_centers_, axis=1, keepdims=True)
        docs = [terms(f"{items[pos[i]]['title']} {items[pos[i]]['abstract']} {' '.join(exp.get(str(i), []))}")
                for i in ids]
        df = Counter(t for d in docs for t in d)
        xy = PCA(2, random_state=SEED).fit_transform(cent) if k > 2 else np.array([[0.0, 0.5], [1.0, 0.5]])
        xy = (xy - xy.min(0)) / (xy.max(0) - xy.min(0) + 1e-9)
        subs = []
        for s in range(k):
            mem = [j for j in range(len(ids)) if lab[j] == s]
            tf = Counter(t for j in mem for t in docs[j])
            sc = {t: (n / len(mem)) * math.log(1 + len(ids) / df[t]) * (1.3 if " " in t else 1.0)
                  for t, n in tf.items() if n >= 2}
            kws = []
            for t, _ in sorted(sc.items(), key=lambda x: (-x[1], x[0])):
                if t in WEAK or any(t in k2 or k2 in t for k2 in kws):
                    continue
                kws.append(t)
                if len(kws) == 6:
                    break
            sims = X[mem] @ cent[s]
            order = [mem[j] for j in np.argsort(-sims, kind="stable")]
            subs.append({"label": " · ".join(kws[:2]).title(), "label_source": "keywords", "size": len(mem),
                         "keywords": [{"keyword": t, "items": [ids[j] for j in mem if t in docs[j]]} for t in kws],
                         "examples": [items[pos[ids[j]]]["title"] for j in order[:5]],
                         "items": [ids[j] for j in order],
                         "map": {"x": round(float(xy[s, 0]), 4), "y": round(float(xy[s, 1]), 4)}})
        subs.sort(key=lambda x: -x["size"])
        for n, sub in enumerate(subs):
            sub["id"] = f"{c['id']}.{n + 1}"
        c["subclusters"] = [{"id": x.pop("id"), **x} for x in subs]
        report.append({"id": c["id"], "label": c["label"], "k": k, "silhouette": round(float(sil), 4),
                       "subs": [(x["id"], x["size"], x["label"]) for x in c["subclusters"]]})
        print(f"{c['id']} {c['label'][:28]:<28} k={k} " + " | ".join(f"{x['size']} {x['label']}" for x in c["subclusters"]),
              flush=True)
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    rep_path = os.path.join(ROOT, "docs", "cluster_report.json")
    rep = json.load(open(rep_path))
    rep["subclusters"] = report
    json.dump(rep, open(rep_path, "w"), ensure_ascii=False, indent=1)
    print("wrote", path, sum(len(c["subclusters"]) for c in data["clusters"]), "sub-topics")


if __name__ == "__main__":
    main()
