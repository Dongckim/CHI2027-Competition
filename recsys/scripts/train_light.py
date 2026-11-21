#!/usr/bin/env python3
"""Make the on-device models lighter, and measure what each cut costs.

The query encoder is the only model that runs on the phone; the paper vectors are
precomputed by the teacher. Both are cut here:

  encoder  L12 / L6 / L4 / L3   the split student's encoder keeping evenly spaced
                                layers, re-distilled (same loss as train_retriever)
           static               no transformer at all: one vector per WordPiece
                                token, averaged, then a linear map into the teacher
                                space (Model2Vec-style, initialised from the student
                                and then trained with the same loss)
  papers   PCA to d dims        uncentred SVD of the paper matrix; the projection is
                                folded into the encoder's head, so the phone stores
                                d-dim vectors and the model outputs d dims
           int8                 one scale per paper vector

Training data = train_retriever's (synthetic queries + unlabeled titles/abstract
sentences) plus the doc2query phrases of the training papers as extra labeled
queries. Held-out papers (20%) never appear. Settings are compared on the dev half
of the held-out queries and reported on the test half, with the deployed hybrid
(BM25 over title + abstract + phrases, hybrid_w 0.5) as well as dense only.

  python scripts/train_light.py                  # split: train + eval all variants
  python scripts/train_light.py --deploy static --dim 256   # retrain on all papers
"""
import argparse
import gzip
import json
import os
import re
import sys
import time

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "src", "package"))
os.environ.setdefault("CHI_LANGS", "en")
os.environ.setdefault("CHI_STUDENT_BASE", "BAAI/bge-small-en-v1.5")
os.environ.setdefault("CHI_STUDENT_PREFIX", "Represent this sentence for searching relevant passages: ")
import train_retriever as tr  # noqa: E402
from retriever import BM25, _minmax  # noqa: E402

RUNS = os.path.join(ROOT, "models", "ft_runs")
OUT = os.path.join(RUNS, "light")
DEPLOY = os.path.join(ROOT, "models", "student_light")
PREFIX = tr.STUDENT_PREFIX
LAYERS = {12: list(range(12)), 6: [0, 2, 4, 7, 9, 11], 4: [0, 4, 7, 11], 3: [0, 6, 11]}
DIMS = [1024, 512, 256, 128]
STATIC_D = [256, 384]
SEED = 42


# ---------------------------------------------------------------- data
def training_set(split):
    """-> (texts, gold index or -1, eval sets, docs, ids, corpus)."""
    corpus, ids, docs, queries, test_ids = tr.load_data()
    pos = {pid: i for i, pid in enumerate(ids)}
    held = test_ids if split else set()
    texts = [q["query"] for q in queries if q["id"] not in held]
    gold = [pos[q["id"]] for q in queries if q["id"] not in held]
    exp = json.load(open(os.path.join(ROOT, "data", "processed", "doc_expansions.json")))
    for pid in ids:
        if pid in held:
            continue
        for ph in exp.get(str(pid), []):
            texts.append(ph)
            gold.append(pos[pid])
    for r in corpus:
        if r["id"] in held:
            continue
        sents = [x.strip() for x in re.split(r"(?<=[.!?])\s+", r["abstract"])]
        for t in [r["title"]] + [x for x in sents if len(x.split()) >= 5][:6]:
            texts.append(t)
            gold.append(-1)
    te = [q for q in queries if q["id"] in test_ids]
    ts = sorted(test_ids)
    dev = set(ts[::2])
    sets = {"dev": [q for q in te if q["id"] in dev], "test": [q for q in te if q["id"] not in dev]}
    phrases = [exp.get(str(i), []) for i in ids]
    bm_texts = [f"{d} ; {' ; '.join(p)}" for d, p in zip(docs, phrases)]
    return texts, np.array(gold), sets, bm_texts, ids, pos


def teacher_vectors(texts, split):
    """Teacher query vectors for the training texts, cached on disk."""
    tag = "split" if split else "full"
    path = os.path.join(OUT, f"teacher_{tag}_{len(texts)}.npy")
    if os.path.exists(path):
        return np.load(path)
    from sentence_transformers import SentenceTransformer
    src = os.path.join(RUNS, "teacher_split") if split else tr.TEACHER_OUT
    t0 = time.time()
    m = SentenceTransformer(src, device="cuda")
    v = tr.encode(m, texts, bs=256).astype("float32")
    del m
    np.save(path, v)
    print(f"  teacher vectors {v.shape} in {time.time() - t0:.0f}s", flush=True)
    return v


def doc_matrix(split):
    return np.load(os.path.join(RUNS, "teacher_split", "doc_emb.npy") if split
                   else os.path.join(ROOT, "models", "embeddings.npy")).astype("float32")


def pca_basis(D, d):
    """Top-d right singular vectors of the (uncentred) paper matrix: [d, 1024]."""
    _, _, vt = np.linalg.svd(D, full_matrices=False)
    return vt[:d].astype("float32")


def quant_rows(X):
    """int8 with one scale per row -> (int8 [n,d], float32 scales [n])."""
    s = np.abs(X).max(1) / 127.0 + 1e-12
    return np.round(X / s[:, None]).astype(np.int8), s.astype("float32")


def l2n(X):
    return X / (np.linalg.norm(X, axis=-1, keepdims=True) + 1e-12)


# ---------------------------------------------------------------- models
def student_dir(split):
    return os.path.join(RUNS, "student_split_en") if split else os.path.join(ROOT, "models", "student_en")


class Layered:
    """The split student with only some transformer layers, + its 384->1024 head."""

    def __init__(self, keep, split):
        import torch
        from transformers import AutoModel, AutoTokenizer
        sd = student_dir(split)
        self.tok = AutoTokenizer.from_pretrained(sd)
        self.enc = AutoModel.from_pretrained(os.path.join(sd, "encoder"))
        self.enc.encoder.layer = torch.nn.ModuleList([self.enc.encoder.layer[i] for i in keep])
        self.enc.config.num_hidden_layers = len(keep)
        self.enc = self.enc.cuda()
        self.head = torch.nn.Linear(384, 1024).cuda()
        self.head.load_state_dict(torch.load(os.path.join(sd, "head.pt")))

    def groups(self):
        return [{"params": self.enc.parameters(), "lr": 5e-5},
                {"params": self.head.parameters(), "lr": 1e-3}]

    def train(self, on):
        self.enc.train(on)

    def forward(self, texts):
        import torch.nn.functional as F
        b = self.tok([PREFIX + t for t in texts], padding=True, truncation=True,
                     max_length=64, return_tensors="pt").to("cuda")
        h = self.enc(**b).last_hidden_state
        m = b["attention_mask"].unsqueeze(-1).float()
        return F.normalize(self.head((h * m).sum(1) / m.sum(1)), dim=-1)


class Static:
    """No transformer: mean of per-token vectors E[tok] -> linear -> 1024, normalized.
    Initialised from the student's output for each token on its own, reduced to d
    dims with PCA (the head starts as the inverse projection)."""

    def __init__(self, d, split):
        import torch
        from transformers import AutoTokenizer
        self.tok = AutoTokenizer.from_pretrained(student_dir(split))
        init = self.token_vectors(split)
        _, _, vt = np.linalg.svd(init, full_matrices=False)
        self.E = torch.nn.Embedding(init.shape[0], d).cuda()
        self.E.weight.data = torch.tensor(init @ vt[:d].T, device="cuda")
        self.head = torch.nn.Linear(d, 1024, bias=False).cuda()
        self.head.weight.data = torch.tensor(vt[:d].T.copy(), device="cuda")

    def token_vectors(self, split):
        path = os.path.join(OUT, f"token_init_{'split' if split else 'full'}.npy")
        if os.path.exists(path):
            return np.load(path)
        import torch
        st = Layered(LAYERS[12], split)
        st.train(False)
        vocab = [t for t, _ in sorted(self.tok.get_vocab().items(), key=lambda x: x[1])]
        out = []
        with torch.no_grad():
            for i in range(0, len(vocab), 1024):
                out.append(st.forward(vocab[i:i + 1024]).float().cpu().numpy())
        v = np.concatenate(out)
        np.save(path, v)
        return v

    def groups(self):
        return [{"params": self.E.parameters(), "lr": 2e-3, "weight_decay": 0.0},
                {"params": self.head.parameters(), "lr": 1e-3}]

    def train(self, on):
        pass

    def ids(self, texts):
        return self.tok(texts, add_special_tokens=False, truncation=True,
                        max_length=64)["input_ids"]

    def forward(self, texts):
        import torch
        import torch.nn.functional as F
        ids = self.ids(texts)
        flat = torch.tensor([t for x in ids for t in x] or [0], device="cuda")
        offs = torch.tensor([0] + list(np.cumsum([len(x) for x in ids])[:-1]), device="cuda")
        v = F.embedding_bag(flat, self.E.weight, offs, mode="mean")
        return F.normalize(self.head(v), dim=-1)


def distill(model, texts, gold, T, D, epochs, tau=0.02, bs=128):
    """train_retriever's student loss: CE over all papers + MSE to the teacher."""
    import torch
    import torch.nn.functional as F
    torch.manual_seed(SEED)
    Dt, Tt, Gt = (torch.tensor(x, device="cuda") for x in (D, T, gold))
    params = model.groups()
    opt = torch.optim.AdamW(params, weight_decay=0.01)
    steps = epochs * ((len(texts) + bs - 1) // bs)
    warm = max(1, steps // 10)
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: min((s + 1) / warm, max(0.0, (steps - s) / (steps - warm + 1))))
    order = np.arange(len(texts))
    for ep in range(epochs):
        model.train(True)
        np.random.default_rng(SEED + ep).shuffle(order)
        tot = 0.0
        for i in range(0, len(order), bs):
            idx = order[i:i + bs]
            with torch.autocast("cuda", dtype=torch.bfloat16):
                v = model.forward([texts[j] for j in idx]).float()
            loss = F.mse_loss(v, Tt[idx]) * v.shape[1]
            lab = Gt[idx] >= 0
            if lab.any():
                loss = loss + F.cross_entropy(v[lab] @ Dt.T / tau, Gt[idx][lab])
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            tot += loss.item()
        if ep % 5 == 4 or ep == epochs - 1:
            print(f"    epoch {ep + 1}/{epochs} loss {tot / (len(order) / bs):.4f}", flush=True)
    model.train(False)
    return model


# ---------------------------------------------------------------- export
def export_layered(model, P, out_dir):
    """ONNX int8 with the PCA projection folded into the head; positions cut to 64."""
    import torch
    os.makedirs(out_dir, exist_ok=True)
    enc = model.enc.float().cpu().eval()
    emb = enc.embeddings
    emb.position_embeddings = torch.nn.Embedding.from_pretrained(emb.position_embeddings.weight[:64].clone())
    emb.register_buffer("position_ids", emb.position_ids[:, :64].clone(), persistent=False)
    if hasattr(emb, "token_type_ids"):
        emb.register_buffer("token_type_ids", emb.token_type_ids[:, :64].clone(), persistent=False)
    enc.config.max_position_embeddings = 64
    W = model.head.weight.detach().cpu().numpy()
    b = model.head.bias.detach().cpu().numpy()
    head = torch.nn.Linear(W.shape[1], P.shape[0])
    head.weight.data = torch.tensor(P @ W)
    head.bias.data = torch.tensor(P @ b)

    class Wrap(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.enc, self.head = enc, head

        def forward(self, input_ids, attention_mask):
            h = self.enc(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
            m = attention_mask.unsqueeze(-1).float()
            return torch.nn.functional.normalize(self.head((h * m).sum(1) / m.sum(1)), dim=-1)

    dummy = model.tok([PREFIX + "hello"], return_tensors="pt")
    fp32 = os.path.join(out_dir, "model.onnx")
    torch.onnx.export(Wrap().eval(), (dummy["input_ids"], dummy["attention_mask"]), fp32,
                      input_names=["input_ids", "attention_mask"], output_names=["embedding"],
                      opset_version=17, dynamic_axes={"input_ids": {0: "b", 1: "t"},
                                                      "attention_mask": {0: "b", 1: "t"},
                                                      "embedding": {0: "b"}})
    from onnxruntime.quantization import QuantType, quantize_dynamic
    int8 = os.path.join(out_dir, "model_int8.onnx")
    quantize_dynamic(fp32, int8, weight_type=QuantType.QInt8)
    os.remove(fp32)
    model.tok.save_pretrained(out_dir)
    return int8


def export_static(model, P, out_dir):
    """static.npz: tokens int8 [V, d] + scales [V] + head float16 [d, dims]."""
    os.makedirs(out_dir, exist_ok=True)
    E = model.E.weight.detach().float().cpu().numpy()
    H = (P @ model.head.weight.detach().float().cpu().numpy()).T  # [d, dims]
    q, s = quant_rows(E)
    path = os.path.join(out_dir, "static.npz")
    np.savez(path, tokens=q, scales=s, head=np.ascontiguousarray(H.astype(np.float16)))
    model.tok.save_pretrained(out_dir)
    return path


class OnnxQuery:
    def __init__(self, path, tok):
        import onnxruntime as ort
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1
        self.s = ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])
        self.tok = tok

    def __call__(self, text):
        b = self.tok([PREFIX + text], truncation=True, max_length=64, return_tensors="np")
        return self.s.run(None, {"input_ids": b["input_ids"].astype("int64"),
                                 "attention_mask": b["attention_mask"].astype("int64")})[0][0]


class StaticQuery:
    """What the phone does: look up int8 token rows, average, multiply by the head."""

    def __init__(self, path, tok):
        z = np.load(path)
        self.E = z["tokens"].astype(np.float32) * z["scales"][:, None]
        self.H = z["head"].astype(np.float32)
        self.tok = tok

    def __call__(self, text):
        ids = self.tok(text, add_special_tokens=False, truncation=True, max_length=64)["input_ids"]
        v = (self.E[ids].mean(0) if ids else np.zeros(self.E.shape[1], np.float32)) @ self.H
        return v / (np.linalg.norm(v) + 1e-12)


# ---------------------------------------------------------------- eval
def ranks(enc, Dq, qs, pos, bm, w=0.5):
    """Rank of the gold paper, dense only and hybrid; and encoder latency."""
    dense, hyb, lat = [], [], []
    for q in qs:
        g = pos[q["id"]]
        t0 = time.perf_counter()
        v = enc(q["query"])
        lat.append((time.perf_counter() - t0) * 1000)
        sim = Dq @ v
        dense.append(int((sim > sim[g]).sum()) + 1)
        s = _minmax(sim) + w * _minmax(bm.scores(q["query"]))
        hyb.append(int((s > s[g]).sum()) + 1)
    m = lambda r, k: round(float((np.array(r) <= k).mean()), 4)
    return {"dense": {"R@1": m(dense, 1), "R@8": m(dense, 8)},
            "hybrid": {"R@1": m(hyb, 1), "R@8": m(hyb, 8)},
            "encode_ms": round(float(np.median(lat)), 2)}


def sizes(model_path, D, d):
    mb = lambda n: round(n / 1e6, 2)
    raw = open(model_path, "rb").read()
    q, s = quant_rows(D)
    return {"model_mb": mb(len(raw)), "model_gzip_mb": mb(len(gzip.compress(raw, 6))),
            "papers_f32_mb": mb(D.shape[0] * d * 4), "papers_int8_mb": mb(q.nbytes + s.nbytes)}


def evaluate(name, path, kind, tok, D, P, sets, pos, bm):
    enc = (OnnxQuery if kind == "onnx" else StaticQuery)(path, tok)
    Dp = l2n(D @ P.T)
    q, s = quant_rows(Dp)
    Dq = q.astype(np.float32) * s[:, None]
    r = {k: ranks(enc, Dq, v, pos, bm) for k, v in sets.items()}
    r["size"] = sizes(path, D, P.shape[0])
    print(f"  {name:<14} dev {r['dev']['hybrid']}  test {r['test']['hybrid']}  "
          f"dense test {r['test']['dense']}  {r['size']['model_mb']}MB  {r['test']['encode_ms']}ms",
          flush=True)
    return r


W_GRID = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]


def sweep_hybrid_w(names):
    """The BM25 weight again for each encoder (a weaker encoder may want more keyword
    weight): chosen on the dev half, reported on the test half. CPU only."""
    from transformers import AutoTokenizer
    _, _, sets, bm_texts, _, pos = training_set(True)
    D = doc_matrix(True)
    tok = AutoTokenizer.from_pretrained(student_dir(True))
    bm = BM25(bm_texts)
    cache = {k: [bm.scores(q["query"]) for q in v] for k, v in sets.items()}
    path = os.path.join(ROOT, "docs", "light_report.json")
    rep = json.load(open(path))
    rep.setdefault("hybrid_w", {})
    for name in names:
        v, d = name.rsplit("_d", 1)
        d = int(d)
        P = pca_basis(D, d)
        if v == "current_L12":
            e = OnnxQuery(os.path.join(RUNS, "student_split_en", "model_int8.onnx"), tok)
            enc = lambda t, e=e, P=P: l2n(P @ e(t))
        else:
            f = os.path.join(OUT, name, "model_int8.onnx" if v.startswith("L") else "static.npz")
            enc = (OnnxQuery if v.startswith("L") else StaticQuery)(f, tok)
        q, s = quant_rows(l2n(D @ P.T))
        Dq = q.astype(np.float32) * s[:, None]
        res = {}
        for k, qs in sets.items():
            sims = [Dq @ enc(x["query"]) for x in qs]
            for w in W_GRID:
                r = []
                for x, sim, b in zip(qs, sims, cache[k]):
                    sc = _minmax(sim) + w * _minmax(b)
                    g = pos[x["id"]]
                    r.append(int((sc > sc[g]).sum()) + 1)
                r = np.array(r)
                res.setdefault(str(w), {})[k] = {"R@1": round(float((r <= 1).mean()), 4),
                                                 "R@8": round(float((r <= 8).mean()), 4)}
        best = max(res, key=lambda w: (res[w]["dev"]["R@8"], res[w]["dev"]["R@1"]))
        rep["hybrid_w"][name] = {"by_w": res, "chosen": float(best), "test": res[best]["test"]}
        print(f"  {name:<18} w={best}  dev {res[best]['dev']}  test {res[best]['test']}  "
              f"(w=0.5 test {res['0.5']['test']})", flush=True)
        json.dump(rep, open(path, "w"), indent=1)


def relevance_floor(variant, d, D, sets, tok):
    """1st percentile of the best paper's cosine over the held-out queries (split model):
    below it, CHI probably does not cover the topic (config relevance_floor)."""
    P = pca_basis(D, d)
    path = os.path.join(OUT, f"{variant}_d{d}", "model_int8.onnx" if variant.startswith("L") else "static.npz")
    enc = (OnnxQuery if variant.startswith("L") else StaticQuery)(path, tok)
    q, s = quant_rows(l2n(D @ P.T))
    Dq = q.astype(np.float32) * s[:, None]
    top = [float((Dq @ enc(x["query"])).max()) for v in sets.values() for x in v]
    return round(float(np.percentile(top, 1)), 4)


# ---------------------------------------------------------------- main
def build(variant, split, texts, gold, T, D, epochs):
    if variant.startswith("L"):
        m = Layered(LAYERS[int(variant[1:])], split)
    else:
        m = Static(int(variant.split("_d")[1]), split)
    t0 = time.time()
    distill(m, texts, gold, T, D, epochs)
    print(f"  {variant} trained in {time.time() - t0:.0f}s", flush=True)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variants", default="L12,L6,L4,L3,static_d256,static_d384")
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--static-epochs", type=int, default=30)
    ap.add_argument("--deploy", help="variant to retrain on all papers, e.g. static_d256")
    ap.add_argument("--dim", type=int, default=256, help="paper vector dims for --deploy")
    ap.add_argument("--sweep-w", help="comma list like static_d256_d128,L6_d128 (CPU)")
    a = ap.parse_args()
    if a.sweep_w:
        return sweep_hybrid_w(a.sweep_w.split(","))
    os.makedirs(OUT, exist_ok=True)
    split = not a.deploy
    texts, gold, sets, bm_texts, ids, pos = training_set(split)
    print(f"[{'split' if split else 'full'}] {int((gold >= 0).sum())} labeled + "
          f"{int((gold < 0).sum())} unlabeled texts", flush=True)
    T = teacher_vectors(texts, split)
    D = doc_matrix(split)
    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained(student_dir(split))

    if a.deploy:
        v = a.deploy
        # the floor comes from the split model of the same kind (held-out queries)
        _, _, sp_sets, _, _, _ = training_set(True)
        stok = AutoTokenizer.from_pretrained(student_dir(True))
        floor = relevance_floor(v, a.dim, doc_matrix(True), sp_sets, stok)
        path = os.path.join(ROOT, "docs", "light_report.json")
        rep = json.load(open(path))
        hw = rep["hybrid_w"][f"{v}_d{a.dim}"]
        rep["chosen"] = {"variant": v, "dim": a.dim, "relevance_floor": floor, "hybrid_w": hw["chosen"],
                         "eval": {"hybrid": hw["test"]},
                         "before": rep["variants"]["current_L12 d1024"]["test"]}
        json.dump(rep, open(path, "w"), indent=1)
        print("relevance floor", floor, flush=True)
        m = build(v, False, texts, gold, T, D, a.static_epochs if v.startswith("static") else a.epochs)
        P = pca_basis(D, a.dim) if a.dim < 1024 else np.eye(1024, dtype="float32")
        os.makedirs(DEPLOY, exist_ok=True)
        path = (export_layered if v.startswith("L") else export_static)(m, P, DEPLOY)
        np.save(os.path.join(DEPLOY, "projection.npy"), P)
        json.dump({"variant": v, "dim": a.dim, "query_prefix": PREFIX if v.startswith("L") else "",
                   "max_len": 64, "file": os.path.basename(path)},
                  open(os.path.join(DEPLOY, "light_config.json"), "w"), indent=1)
        print("deployed", v, a.dim, "->", DEPLOY, os.path.getsize(path) / 1e6, "MB")
        return

    bm = BM25(bm_texts)
    path = os.path.join(ROOT, "docs", "light_report.json")
    rep = json.load(open(path)) if os.path.exists(path) else {}
    rep["note"] = ("held-out papers; hybrid = minmax(cos) + 0.5*minmax(BM25 title+abstract+phrases); "
                   "paper vectors PCA-projected and int8; encode_ms = 1 CPU thread, query alone")
    rep.setdefault("variants", {})
    # the student that ships today, with paper vectors cut to each size (no retraining)
    base = os.path.join(RUNS, "student_split_en", "model_int8.onnx")
    for d in DIMS:
        P = pca_basis(D, d)
        enc = OnnxQuery(base, tok)
        proj = lambda t, e=enc, P=P: l2n(P @ e(t))
        Dp = l2n(D @ P.T)
        q, s = quant_rows(Dp)
        Dq = q.astype(np.float32) * s[:, None]
        r = {k: ranks(proj, Dq, v, pos, bm) for k, v in sets.items()}
        r["size"] = sizes(base, D, d)
        rep["variants"][f"current_L12 d{d}"] = r
        print(f"  current d{d:<5} dev {r['dev']['hybrid']}  test {r['test']['hybrid']}  dense {r['test']['dense']}", flush=True)
    # no dense part at all: BM25 only
    r = {}
    for k, v in sets.items():
        rr = []
        for q in v:
            s = bm.scores(q["query"])
            rr.append(int((s > s[pos[q["id"]]]).sum()) + 1)
        r[k] = {"hybrid": {"R@1": round(float((np.array(rr) <= 1).mean()), 4),
                           "R@8": round(float((np.array(rr) <= 8).mean()), 4)}}
    rep["variants"]["bm25_only"] = r
    print("  bm25 only", r, flush=True)
    json.dump(rep, open(path, "w"), indent=1)

    for v in a.variants.split(","):
        m = build(v, True, texts, gold, T, D, a.static_epochs if v.startswith("static") else a.epochs)
        for d in DIMS:
            P = pca_basis(D, d)
            vd = os.path.join(OUT, f"{v}_d{d}")
            p = (export_layered if v.startswith("L") else export_static)(m, P, vd)
            rep["variants"][f"{v} d{d}"] = evaluate(f"{v} d{d}", p, "onnx" if v.startswith("L") else "static",
                                                    tok, D, P, sets, pos, bm)
            json.dump(rep, open(path, "w"), indent=1)
        del m
        import torch
        torch.cuda.empty_cache()
    print("wrote", path)


if __name__ == "__main__":
    main()
