#!/usr/bin/env python3
"""Train the on-device retriever: fine-tune a teacher, distill a small student.

Pipeline (run on a GPU node, after scripts/gen_queries.py):

  1. Teacher  : fine-tune BAAI/bge-m3 on synthetic (query, paper) pairs with an
                in-batch contrastive loss (CachedMultipleNegativesRankingLoss).
  2. Doc index: the teacher embeds every paper once -> doc matrix [N, 1024].
                This is precomputed and shipped inside the app.
  3. Student  : intfloat/multilingual-e5-small (118M) + a linear head 384->1024
                learns to map a *query* into the teacher's space:
                  loss = MSE(student(q), teacher(q))
                       + CE over all N docs (student(q) . D / tau, gold paper)
                Only the student runs on the phone/browser; docs are fixed.
  4. Export   : student -> ONNX -> int8 (onnxruntime dynamic quantization).

Evaluation is on held-out papers: 20% of papers (and all their queries) never
appear in teacher/student training. Retrieval is over the full corpus, the way
the app searches. A deployment run then retrains on 100% of queries.

  python scripts/train_retriever.py            # split eval + full deploy
  python scripts/train_retriever.py --eval-only-split
"""
import argparse
import json
import os
import random
import re
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402

TEACHER_BASE = "BAAI/bge-m3"
# Student variants are selected by env so the same pipeline can build an
# English-only app (CHI_LANGS=en, English student) or a multilingual one.
STUDENT_BASE = os.environ.get("CHI_STUDENT_BASE", "intfloat/multilingual-e5-small")
STUDENT_PREFIX = os.environ.get("CHI_STUDENT_PREFIX", "query: ")
LANGS = set(os.environ.get("CHI_LANGS", "en,ko").split(","))
TAG = os.environ.get("CHI_RUN_TAG", "")  # suffix for student dirs / report
RUNS = os.path.join(config.MODELS_DIR, "ft_runs")
TEACHER_OUT = os.path.join(config.MODELS_DIR, "bge-m3-chi")
STUDENT_OUT = os.path.join(config.MODELS_DIR, "student" + TAG)
SEED = 42


# ---------------------------------------------------------------- data / eval
def load_data():
    with open(config.CORPUS, encoding="utf-8") as f:
        corpus = json.load(f)
    with open(os.path.join(config.ROOT, "data", "processed", "synth_queries.json"),
              encoding="utf-8") as f:
        queries = [q for q in json.load(f) if q["lang"] in LANGS]
    ids = [r["id"] for r in corpus]
    docs = [f"{r['title']}. {r['abstract']}" for r in corpus]
    rnd = random.Random(SEED)
    shuffled = ids[:]
    rnd.shuffle(shuffled)
    test_ids = set(shuffled[: len(ids) // 5])
    return corpus, ids, docs, queries, test_ids


def retrieval_metrics(qv, dv, gold_idx, langs):
    """qv [Q,d], dv [N,d] normalized; gold_idx [Q]. Returns overall + per-lang."""
    import numpy as np
    scores = qv @ dv.T
    gold_scores = scores[np.arange(len(gold_idx)), gold_idx]
    # expected rank under random tie-breaking (1 = best); BM25 gives
    # all-zero scores to queries with no shared terms, which must not count as hits
    ranks = ((scores > gold_scores[:, None]).sum(1) + 1
             + ((scores == gold_scores[:, None]).sum(1) - 1) / 2)

    def summarize(mask):
        r = ranks[mask]
        return {"n": int(mask.sum()),
                "R@1": round(float((r <= 1).mean()), 4),
                "R@8": round(float((r <= 8).mean()), 4),
                "R@20": round(float((r <= 20).mean()), 4),
                "MRR@10": round(float(np.where(r <= 10, 1.0 / r, 0).mean()), 4)}
    langs = np.array(langs)
    out = {"all": summarize(np.ones(len(ranks), bool))}
    for l in ("en", "ko"):
        if (langs == l).any():
            out[l] = summarize(langs == l)
    return out


def bm25_metrics(docs, test_q, gold_idx, langs):
    import numpy as np
    import re
    from rank_bm25 import BM25Okapi
    tokz = lambda s: re.findall(r"\w+", s.lower())
    bm = BM25Okapi([tokz(d) for d in docs])
    scores = np.stack([bm.get_scores(tokz(q)) for q in test_q])
    # BM25 scores are not normalized vectors; reuse the rank logic directly
    gold = scores[np.arange(len(gold_idx)), gold_idx]
    # expected rank under random tie-breaking (1 = best); BM25 gives
    # all-zero scores to queries with no shared terms, which must not count as hits
    ranks = ((scores > gold[:, None]).sum(1) + 1
             + ((scores == gold[:, None]).sum(1) - 1) / 2)
    langs = np.array(langs)

    def s(mask):
        r = ranks[mask]
        return {"n": int(mask.sum()), "R@1": round(float((r <= 1).mean()), 4),
                "R@8": round(float((r <= 8).mean()), 4),
                "R@20": round(float((r <= 20).mean()), 4),
                "MRR@10": round(float(np.where(r <= 10, 1.0 / r, 0).mean()), 4)}
    out = {"all": s(np.ones(len(ranks), bool))}
    for l in ("en", "ko"):
        if (langs == l).any():
            out[l] = s(langs == l)
    return out


# ---------------------------------------------------------------- teacher
def encode(model, texts, bs=64):
    return model.encode(texts, batch_size=bs, convert_to_numpy=True,
                        normalize_embeddings=True, show_progress_bar=False)


def train_teacher(train_pairs, out_dir, epochs=2):
    from datasets import Dataset
    from sentence_transformers import (SentenceTransformer,
                                       SentenceTransformerTrainer,
                                       SentenceTransformerTrainingArguments)
    from sentence_transformers.losses import CachedMultipleNegativesRankingLoss
    from sentence_transformers.training_args import BatchSamplers

    model = SentenceTransformer(TEACHER_BASE, device="cuda",
                                cache_folder=config.HF_CACHE)
    model.max_seq_length = 512
    ds = Dataset.from_dict({"anchor": [q for q, _ in train_pairs],
                            "positive": [d for _, d in train_pairs]})
    loss = CachedMultipleNegativesRankingLoss(model, mini_batch_size=16)
    args = SentenceTransformerTrainingArguments(
        output_dir=out_dir + "_ckpt", num_train_epochs=epochs,
        per_device_train_batch_size=128, learning_rate=1e-5, warmup_ratio=0.1,
        bf16=True, batch_sampler=BatchSamplers.NO_DUPLICATES,
        save_strategy="no", logging_steps=10, report_to="none", seed=SEED)
    SentenceTransformerTrainer(model=model, args=args, train_dataset=ds,
                               loss=loss).train()
    model.save(out_dir)
    return model


# ---------------------------------------------------------------- student
class Student:
    """e5-small encoder + mean pooling + linear 384->1024 + L2 norm."""

    def __init__(self, out_dim=1024):
        import torch
        from transformers import AutoModel, AutoTokenizer
        self.tok = AutoTokenizer.from_pretrained(STUDENT_BASE)
        self.enc = AutoModel.from_pretrained(STUDENT_BASE).cuda()
        self.head = torch.nn.Linear(self.enc.config.hidden_size, out_dim).cuda()

    def parameters(self):
        return list(self.enc.parameters()) + list(self.head.parameters())

    def forward(self, texts):
        import torch.nn.functional as F
        b = self.tok([STUDENT_PREFIX + t for t in texts], padding=True,
                     truncation=True, max_length=64, return_tensors="pt").to("cuda")
        h = self.enc(**b).last_hidden_state
        m = b["attention_mask"].unsqueeze(-1).float()
        pooled = (h * m).sum(1) / m.sum(1)
        return F.normalize(self.head(pooled), dim=-1)

    def encode(self, texts, bs=256):
        import numpy as np
        import torch
        self.enc.eval()
        out = []
        with torch.no_grad():
            for i in range(0, len(texts), bs):
                out.append(self.forward(texts[i:i + bs]).float().cpu().numpy())
        return np.concatenate(out)


def train_student(train_q, train_gold, teacher_qv, doc_matrix, epochs=20,
                  tau=0.02, alpha=1.0):
    """Distill: match teacher query vectors + rank gold doc over all docs.

    Rows with train_gold == -1 are extra unlabeled texts (titles, abstract
    sentences) that only get the MSE term — they teach the student the
    teacher's embedding space beyond the synthetic queries.
    """
    import numpy as np
    import torch
    import torch.nn.functional as F
    torch.manual_seed(SEED)
    st = Student(doc_matrix.shape[1])
    D = torch.tensor(doc_matrix, device="cuda")
    T = torch.tensor(teacher_qv, device="cuda")
    G = torch.tensor(train_gold, device="cuda")
    opt = torch.optim.AdamW([
        {"params": st.enc.parameters(), "lr": 5e-5},
        {"params": st.head.parameters(), "lr": 1e-3}], weight_decay=0.01)
    bs = 128
    steps = epochs * ((len(train_q) + bs - 1) // bs)
    warm = max(1, steps // 10)
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: min((s + 1) / warm, max(0.0, (steps - s) / (steps - warm + 1))))
    order = np.arange(len(train_q))
    for ep in range(epochs):
        st.enc.train()
        np.random.default_rng(SEED + ep).shuffle(order)
        tot = 0.0
        for i in range(0, len(order), bs):
            idx = order[i:i + bs]
            with torch.autocast("cuda", dtype=torch.bfloat16):
                v = st.forward([train_q[j] for j in idx]).float()
            mse = F.mse_loss(v, T[idx]) * v.shape[1]  # per-vector squared error
            lab = G[idx] >= 0
            ce = (F.cross_entropy(v[lab] @ D.T / tau, G[idx][lab])
                  if lab.any() else v.new_zeros(()))
            loss = ce + alpha * mse
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            tot += loss.item()
        print(f"  student epoch {ep+1}/{epochs} loss {tot / (len(order)/bs):.4f}",
              flush=True)
    return st


def export_student(st, out_dir):
    """Save HF weights + head, ONNX fp32 and int8."""
    import torch
    os.makedirs(out_dir, exist_ok=True)
    st.enc.save_pretrained(os.path.join(out_dir, "encoder"))
    st.tok.save_pretrained(out_dir)
    torch.save(st.head.state_dict(), os.path.join(out_dir, "head.pt"))
    with open(os.path.join(out_dir, "student_config.json"), "w") as f:
        json.dump({"base": STUDENT_BASE, "query_prefix": STUDENT_PREFIX,
                   "max_len": 64, "langs": sorted(LANGS)}, f)

    class Wrap(torch.nn.Module):
        def __init__(self, enc, head):
            super().__init__()
            self.enc, self.head = enc, head

        def forward(self, input_ids, attention_mask):
            h = self.enc(input_ids=input_ids,
                         attention_mask=attention_mask).last_hidden_state
            m = attention_mask.unsqueeze(-1).float()
            v = self.head((h * m).sum(1) / m.sum(1))
            return torch.nn.functional.normalize(v, dim=-1)

    w = Wrap(st.enc.float().cpu().eval(), st.head.float().cpu().eval())
    dummy = st.tok(["query: hello"], return_tensors="pt")
    fp32 = os.path.join(out_dir, "model.onnx")
    torch.onnx.export(w, (dummy["input_ids"], dummy["attention_mask"]), fp32,
                      input_names=["input_ids", "attention_mask"],
                      output_names=["embedding"], opset_version=17,
                      dynamic_axes={"input_ids": {0: "b", 1: "t"},
                                    "attention_mask": {0: "b", 1: "t"},
                                    "embedding": {0: "b"}})
    from onnxruntime.quantization import QuantType, quantize_dynamic
    int8 = os.path.join(out_dir, "model_int8.onnx")
    quantize_dynamic(fp32, int8, weight_type=QuantType.QInt8)
    return int8


def onnx_encode(path, tok, texts, bs=64):
    import numpy as np
    import onnxruntime as ort
    so = ort.SessionOptions()
    so.intra_op_num_threads = 4
    sess = ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])
    out = []
    for i in range(0, len(texts), bs):
        b = tok([STUDENT_PREFIX + t for t in texts[i:i + bs]], padding=True,
                truncation=True, max_length=64, return_tensors="np")
        out.append(sess.run(None, {"input_ids": b["input_ids"].astype("int64"),
                                   "attention_mask": b["attention_mask"].astype("int64")})[0])
    return np.concatenate(out)


# ---------------------------------------------------------------- main
def run(split, report, student_only=False):
    """split=True: train on 80% papers, eval on 20%. False: train on all.

    student_only: reuse the already fine-tuned teacher instead of retraining it.
    """
    import numpy as np
    from sentence_transformers import SentenceTransformer

    corpus, ids, docs, queries, test_ids = load_data()
    pos = {pid: i for i, pid in enumerate(ids)}
    tr = [q for q in queries if not (split and q["id"] in test_ids)]
    te = [q for q in queries if split and q["id"] in test_ids]
    tr_pairs = [(q["query"], docs[pos[q["id"]]]) for q in tr]
    tag = "split" if split else "full"
    print(f"[{tag}] train queries {len(tr)} | test queries {len(te)}", flush=True)

    te_q = [q["query"] for q in te]
    te_gold = np.array([pos[q["id"]] for q in te])
    te_lang = [q["lang"] for q in te]

    if split:
        t0 = time.time()
        report["bm25"] = bm25_metrics(docs, te_q, te_gold, te_lang)
        print("  bm25", report["bm25"]["all"], flush=True)
    if split and not student_only:
        base = SentenceTransformer(TEACHER_BASE, device="cuda",
                                   cache_folder=config.HF_CACHE)
        base.max_seq_length = 512
        report["bge_m3_base"] = retrieval_metrics(
            encode(base, te_q), encode(base, docs), te_gold, te_lang)
        print("  base", report["bge_m3_base"]["all"], f"{time.time()-t0:.0f}s",
              flush=True)
        del base

    out = os.path.join(RUNS, "teacher_split") if split else TEACHER_OUT
    if student_only:
        teacher = SentenceTransformer(out, device="cuda")
    else:
        t0 = time.time()
        teacher = train_teacher(tr_pairs, out)
        report[f"teacher_train_seconds_{tag}"] = round(time.time() - t0)
    doc_matrix = encode(teacher, docs).astype("float32")
    if split and not student_only:
        report["bge_m3_finetuned"] = retrieval_metrics(
            encode(teacher, te_q), doc_matrix, te_gold, te_lang)
        print("  teacher", report["bge_m3_finetuned"]["all"], flush=True)

    # labeled synthetic queries + unlabeled titles/abstract sentences of the
    # training papers (MSE-only, gold=-1) for broader distillation coverage
    tr_q = [q["query"] for q in tr]
    tr_gold = [pos[q["id"]] for q in tr]
    for r in corpus:
        if split and r["id"] in test_ids:
            continue
        sents = [x.strip() for x in re.split(r"(?<=[.!?])\s+", r["abstract"])]
        for t in [r["title"]] + [x for x in sents if len(x.split()) >= 5][:6]:
            tr_q.append(t)
            tr_gold.append(-1)
    tr_gold = np.array(tr_gold)
    print(f"  student data: {int((tr_gold >= 0).sum())} queries + "
          f"{int((tr_gold < 0).sum())} unlabeled texts", flush=True)
    teacher_qv = encode(teacher, tr_q).astype("float32")
    del teacher
    import torch
    torch.cuda.empty_cache()

    t0 = time.time()
    st = train_student(tr_q, tr_gold, teacher_qv, doc_matrix)
    report[f"student_train_seconds_{tag}"] = round(time.time() - t0)
    if split:
        report["student_torch"] = retrieval_metrics(
            st.encode(te_q), doc_matrix, te_gold, te_lang)
        print("  student", report["student_torch"]["all"], flush=True)

    sdir = os.path.join(RUNS, "student_split" + TAG) if split else STUDENT_OUT
    int8 = export_student(st, sdir)
    report[f"student_int8_mb_{tag}"] = round(os.path.getsize(int8) / 1e6, 1)
    if split:
        qv = onnx_encode(int8, st.tok, te_q)
        report["student_onnx_int8"] = retrieval_metrics(qv, doc_matrix, te_gold,
                                                        te_lang)
        print("  student int8", report["student_onnx_int8"]["all"], flush=True)
    else:
        # ship the doc index the app will search against
        np.save(os.path.join(STUDENT_OUT, "doc_embeddings.npy"), doc_matrix)
        if TAG:  # variant students share the main teacher index; leave it alone
            return
        np.save(config.EMB_PATH, doc_matrix)
        with open(config.EMB_META, "w", encoding="utf-8") as f:
            json.dump({"model": os.path.relpath(TEACHER_OUT, config.ROOT),
                       "student": os.path.relpath(STUDENT_OUT, config.ROOT),
                       "dim": int(doc_matrix.shape[1]), "n": len(ids),
                       "ids": ids, "device": "cuda"}, f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--eval-only-split", action="store_true")
    ap.add_argument("--student-only", action="store_true",
                    help="keep the fine-tuned teachers, retrain/export students")
    a = ap.parse_args()
    os.environ.setdefault("HF_HOME", config.HF_CACHE)
    path = os.path.join(config.ROOT, "docs", f"training_report{TAG}.json")
    report = {"seed": SEED, "teacher_base": TEACHER_BASE,
              "student_base": STUDENT_BASE, "langs": sorted(LANGS)}
    if a.student_only and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            report = json.load(f)  # keep baseline/teacher numbers
    run(True, report, a.student_only)
    if not a.eval_only_split:
        run(False, report, a.student_only)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
