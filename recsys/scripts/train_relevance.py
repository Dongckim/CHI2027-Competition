#!/usr/bin/env python3
"""The "does CHI cover this topic?" check for the light encoder (CPU).

The transformer student could tell an off-topic query by its low best cosine alone; the
static encoder cannot (it averages word vectors, so common words pull every query
toward some paper). The check becomes a 5-number logistic regression over signals the
phone already has after ranking:

  top        best cosine to any paper
  gap        best cosine minus the 20th best (a peak, not a flat field)
  bm25       log(1 + best BM25 score)
  coverage   share of the query's content words that occur in the program
  idf        mean idf of those words / log(N) (specific words, not only common ones)

Positives: queries and search phrases of held-out papers (split model, never trained
on), session names and cluster keywords (short queries). Negatives:
LLM-written queries from non-HCI fields (scripts/gen_offtopic.py); fields are split in
two, so the test half is fields the check never saw. The threshold keeps false alarms
on held-out CHI queries at 1% (dev half). Writes the weights to docs/relevance_report.json;
package_model.py puts them in config.json ("relevance").

  python scripts/train_relevance.py
"""
import json
import math
import os
import re
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import train_light as tl  # noqa: E402
from retriever import STOP  # noqa: E402

_TOKEN = re.compile(r"\w+")
NAMES = ["top", "gap", "bm25", "coverage", "idf"]
# hand-written checks, never used for fitting
SHORT = ["haptics", "VR", "accessibility", "eye tracking", "LLM", "motion sickness in vr", "self-driving car",
         "kids and screen time", "sign language", "deepfake", "chatgpt in the classroom",
         "older people using voice assistants", "AR glasses for blind people", "burnout of gig workers",
         "privacy", "social robots", "data visualization", "mental health apps", "citizen science",
         "fabrication", "gesture input", "sleep tracking", "misinformation", "game design",
         "co-design with children"]
OFF = ["sourdough bread fermentation", "medieval castle architecture", "offshore wind turbine blade fatigue",
       "stock market volatility forecasting", "coral reef bleaching", "tax law reform", "soil microbiome",
       "deep sea fish migration", "quantum chromodynamics lattice", "marathon training plans",
       "cryptocurrency mining hardware", "glacier melt rates", "bird song dialects", "ancient roman pottery",
       "wine tasting notes", "nuclear reactor cooling", "black hole thermodynamics", "mosquito malaria vectors",
       "steel alloy corrosion", "football transfer market", "opera singing technique",
       "vaccine cold chain logistics", "earthquake early warning seismology", "ocean acidification",
       "plant root nitrogen uptake", "antibiotic resistance genes", "dinosaur fossil dating",
       "airline fuel hedging", "bee colony collapse", "best pizza recipes in Naples"]


def features(sim, bm, query, idf, n_docs):
    """The five signals; retriever.py and web/retriever.mjs compute the same."""
    t = np.sort(sim)[::-1]
    words = [w for w in _TOKEN.findall(query.lower()) if w not in STOP]
    known = [w for w in words if w in idf]
    return [float(t[0]), float(t[0] - t[min(19, len(t) - 1)]), math.log1p(float(bm.max())),
            len(known) / len(words) if words else 0.0,
            (sum(idf[w] for w in known) / len(known) / math.log(n_docs)) if known else 0.0]


def main():
    from sklearn.linear_model import LogisticRegression
    from transformers import AutoTokenizer
    _, _, sets, bm_texts, _, _ = tl.training_set(True)
    D = tl.doc_matrix(True)
    P = tl.pca_basis(D, 128)
    tok = AutoTokenizer.from_pretrained(tl.student_dir(True))
    enc = tl.StaticQuery(os.path.join(tl.OUT, "static_d256_d128", "static.npz"), tok)
    q, s = tl.quant_rows(tl.l2n(D @ P.T))
    Dq = q.astype(np.float32) * s[:, None]
    bm = tl.BM25(bm_texts)
    n = len(bm_texts)

    def feats(texts):
        return np.array([features(Dq @ enc(x), bm.scores(x), x, bm.idf, n) for x in texts])
    off = json.load(open(os.path.join(ROOT, "data", "processed", "offtopic_queries.json")))
    fields = sorted({o["field"] for o in off})
    train_f = set(fields[::2])
    # short CHI queries too: the held-out papers' search phrases (2-6 words), and the
    # program's own session names and cluster keywords, split the same way
    exp = json.load(open(os.path.join(ROOT, "data", "processed", "doc_expansions.json")))
    prog = json.load(open(os.path.join(ROOT, "data", "processed", "program.json")))
    cl = json.load(open(os.path.join(ROOT, "data", "processed", "clusters.json")))
    names = sorted({s_["session"] for it in prog for s_ in it["sessions"] if s_["session"]}
                   | {k["keyword"] for c in cl["clusters"] for k in c["keywords"]})
    texts = {}
    for k, v in sets.items():
        ids = sorted({x["id"] for x in v})
        texts[k] = ([x["query"] for x in v] + [ph for i in ids for ph in exp.get(str(i), [])]
                    + names[(0 if k == "dev" else 1)::2])
    pos = {k: feats(v) for k, v in texts.items()}
    neg = {"train": feats([o["query"] for o in off if o["field"] in train_f]),
           "test": feats([o["query"] for o in off if o["field"] not in train_f])}
    X = np.vstack([pos["dev"], neg["train"]])
    y = np.r_[np.ones(len(pos["dev"])), np.zeros(len(neg["train"]))]
    mu, sd = X.mean(0), X.std(0) + 1e-9
    lr = LogisticRegression(C=1.0, class_weight="balanced", max_iter=1000).fit((X - mu) / sd, y)
    w = lr.coef_[0] / sd
    b = float(lr.intercept_[0] - (lr.coef_[0] * mu / sd).sum())

    def p(F):
        return 1 / (1 + np.exp(-(F @ w + b)))
    thr = float(np.percentile(p(pos["dev"]), 1))           # 1% false alarms on CHI queries
    short, hand_off = p(feats(SHORT)), p(feats(OFF))
    top_floor = float(np.percentile(pos["dev"][:, 0], 1))  # the cosine-only check, for comparison
    rep = {
        "features": NAMES, "w": [round(float(x), 6) for x in w], "b": round(b, 6), "threshold": round(thr, 4),
        "fields_train": sorted(train_f), "fields_test": sorted(set(fields) - train_f),
        "flagged": {
            "chi_test_queries": round(float((p(pos["test"]) < thr).mean()), 4),
            "offtopic_unseen_fields": round(float((p(neg["test"]) < thr).mean()), 4),
            "hand_short_chi": f"{int((short < thr).sum())}/{len(SHORT)}",
            "hand_offtopic": f"{int((hand_off < thr).sum())}/{len(OFF)}"},
        "cosine_only": {
            "floor": round(top_floor, 4),
            "chi_test_queries": round(float((pos["test"][:, 0] < top_floor).mean()), 4),
            "offtopic_unseen_fields": round(float((neg["test"][:, 0] < top_floor).mean()), 4),
            "hand_short_chi": f"{int((feats(SHORT)[:, 0] < top_floor).sum())}/{len(SHORT)}",
            "hand_offtopic": f"{int((feats(OFF)[:, 0] < top_floor).sum())}/{len(OFF)}"},
        "flagged_short": [x for x, v in zip(SHORT, short) if v < thr],
    }
    print(json.dumps(rep, indent=1))
    json.dump(rep, open(os.path.join(ROOT, "docs", "relevance_report.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
