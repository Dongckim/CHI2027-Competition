#!/usr/bin/env python3
"""Topic and keyword clusters of the whole program (08 Day wrap-up bubbles, the
"conference map" that is on hold in Figma, and lists the app can browse).

  topic clusters    k-means on the teacher vectors of every program item (the same
                    1,024-d vectors the recommender uses), k chosen from a sweep
  keywords          per cluster, the words/phrases that set it apart from the rest
                    (class-based TF-IDF over title + abstract + doc2query phrases),
                    each with the ids of the items that contain it
  map               2-D position of each cluster (PCA of the centroids), for a map view
  label             a short name; scripts/name_clusters.py (GPU) writes a better one

Session names are NOT used to build the clusters; agreement with the sessions (NMI)
is reported only as a check.

  python scripts/build_clusters.py          # data/processed/clusters.json, docs/cluster_report.json
"""
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import normalized_mutual_info_score, silhouette_score

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src", "package"))
from retriever import STOP  # noqa: E402

KS = [16, 20, 24, 28, 32, 40, 48]
SEED = 0
GENERIC = set("""study studies paper papers work works research researchers findings results
approach approaches system systems design designs designed using use used user users
participants participant people human humans interaction interactions hci chi based
new novel present presents propose proposed explore explores explored understanding
understand insights implications support supports tool tools method methods data
across within also however two three one first may can could would well way ways
toward towards via including include includes among different various often study's
qualitative quantitative interview interviews survey surveys workshop workshops
experiment experiments evaluation evaluate evaluated lab field analysis framework
technology technologies digital online future potential challenges challenge
increasingly while yet together task tasks experience experiences human-computer often still
whether without whose recent recently growing despite important significant""".split())
WORD = re.compile(r"[a-z][a-z0-9\-]+")


def terms(text):
    w = [x for x in WORD.findall(text.lower()) if x not in STOP and x not in GENERIC and len(x) > 2]
    return set(w) | {f"{a} {b}" for a, b in zip(w, w[1:])}


def main():
    items = json.load(open(os.path.join(ROOT, "data", "processed", "program.json")))
    emb = np.load(os.path.join(ROOT, "models", "program_emb.npy"))
    exp = json.load(open(os.path.join(ROOT, "data", "processed", "doc_expansions.json")))
    seen, keep = set(), []
    for i, it in enumerate(items):
        key = (it["type"], it["title"].strip().lower())
        if key not in seen:
            seen.add(key)
            keep.append(i)
    X = emb[keep]
    X = X / np.linalg.norm(X, axis=1, keepdims=True)
    sess = [(items[i]["sessions"][0]["session"] if items[i]["sessions"] else "")
            for i in keep]
    paper = [k for k, i in enumerate(keep) if items[i]["type"] in ("Paper", "Journals") and sess[k]]

    sweep = []
    for k in KS:
        km = KMeans(k, n_init=10, random_state=SEED).fit(X)
        sil = silhouette_score(X, km.labels_, metric="cosine", sample_size=2000, random_state=SEED)
        nmi = normalized_mutual_info_score([sess[j] for j in paper], km.labels_[paper])
        sizes = np.bincount(km.labels_)
        sweep.append({"k": k, "silhouette": round(float(sil), 4), "nmi_vs_sessions": round(float(nmi), 4),
                      "min_size": int(sizes.min()), "max_size": int(sizes.max())})
        print(sweep[-1], flush=True)
    # highest silhouette; ties (within 0.002) go to fewer clusters (easier bubbles)
    top = max(s["silhouette"] for s in sweep)
    k = min(s["k"] for s in sweep if s["silhouette"] >= top - 0.002)
    km = KMeans(k, n_init=20, random_state=SEED).fit(X)
    lab = km.labels_
    cent = km.cluster_centers_ / np.linalg.norm(km.cluster_centers_, axis=1, keepdims=True)

    docs = [terms(f"{items[i]['title']} {items[i]['abstract']} {' '.join(exp.get(str(items[i]['id']), []))}")
            for i in keep]
    df = Counter(t for d in docs for t in d)
    n_docs = len(docs)
    xy = PCA(2, random_state=SEED).fit_transform(cent)
    xy = (xy - xy.min(0)) / (xy.max(0) - xy.min(0))
    clusters = []
    for c in range(k):
        mem = [j for j in range(len(keep)) if lab[j] == c]
        tf = Counter(t for j in mem for t in docs[j])
        # class-based TF-IDF: common in this cluster, rare elsewhere; phrases first
        sc = {t: (n / len(mem)) * math.log(1 + n_docs / df[t]) * (1.3 if " " in t else 1.0)
              for t, n in tf.items() if n >= 3}
        kws = []
        for t, _ in sorted(sc.items(), key=lambda x: -x[1]):
            if any(t in k2 or k2 in t for k2 in kws):
                continue
            kws.append(t)
            if len(kws) == 8:
                break
        sims = X[mem] @ cent[c]
        order = [mem[j] for j in np.argsort(-sims)]
        ses = Counter(sess[j] for j in mem if sess[j] and not sess[j].startswith(("Posters", "Demo")))
        clusters.append({
            "id": f"c{c:02d}", "label": " · ".join(kws[:2]).title(), "label_source": "keywords",
            "size": len(mem),
            "types": dict(Counter(items[keep[j]]["type"] for j in mem).most_common()),
            "keywords": [{"keyword": t, "items": [items[keep[j]]["id"] for j in mem if t in docs[j]]}
                         for t in kws],
            "top_sessions": [s for s, _ in ses.most_common(3)],
            "examples": [items[keep[j]]["title"] for j in order[:5]],
            "items": [items[keep[j]]["id"] for j in order],
            "map": {"x": round(float(xy[c, 0]), 4), "y": round(float(xy[c, 1]), 4)},
            "centroid_similarity": round(float(sims.mean()), 4)})
    clusters.sort(key=lambda c: -c["size"])
    out = {"k": k, "method": "k-means on teacher vectors (bge-m3 fine-tuned), cosine",
           "n_items": len(keep), "clusters": clusters,
           "item_cluster": {str(items[keep[j]]["id"]): f"c{lab[j]:02d}" for j in range(len(keep))}}
    json.dump(out, open(os.path.join(ROOT, "data", "processed", "clusters.json"), "w"),
              ensure_ascii=False, indent=1)
    rep = {"sweep": sweep, "chosen_k": k,
           "sizes": sorted([c["size"] for c in clusters], reverse=True),
           "clusters": [{"id": c["id"], "label": c["label"], "size": c["size"],
                         "keywords": [x["keyword"] for x in c["keywords"]],
                         "top_sessions": c["top_sessions"], "examples": c["examples"][:3]}
                        for c in clusters]}
    json.dump(rep, open(os.path.join(ROOT, "docs", "cluster_report.json"), "w"), ensure_ascii=False, indent=1)
    for c in clusters:
        print(f"{c['id']} {c['size']:>4} {c['label'][:40]:<40} | {', '.join(x['keyword'] for x in c['keywords'][:5])}")
    print("k =", k)


if __name__ == "__main__":
    main()
