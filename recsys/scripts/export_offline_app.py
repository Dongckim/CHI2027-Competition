#!/usr/bin/env python3
"""Bundle the on-device recommender into app/offline/ (no server, no internet).

After scripts/train_retriever.py has produced models/student/, this copies
everything the browser needs to run the whole flow locally:

  app/offline/
    index.html, sw.js, manifest.webmanifest   (committed)
    model/   model_int8.onnx, tokenizer.json, tokenizer_config.json
    data/    doc_emb.f32  (N x 1024 float32, teacher doc vectors)
             papers.json  (display + BM25 text), config.json
    vendor/  onnxruntime-web (wasm) + @huggingface/tokenizers

model/, data/, vendor/ are build outputs (gitignored). vendor/ needs npm once
(run on a machine with internet); everything after that works offline.
"""
import json
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402

APP = os.path.join(config.ROOT, "app", "offline")
# CHI_RUN_TAG picks a student variant, e.g. "_en" -> models/student_en
TAG = os.environ.get("CHI_RUN_TAG", "")
STUDENT = os.path.join(config.MODELS_DIR, "student" + TAG)
NPM_DIR = os.path.join(config.MODELS_DIR, "ft_runs", "npm")
ORT_VERSION = "1.30.0"
TOKENIZERS_VERSION = "0.2.0"
VENDOR_FILES = {
    "onnxruntime-web/dist/ort.wasm.min.mjs": "ort.wasm.min.mjs",
    "onnxruntime-web/dist/ort-wasm-simd-threaded.mjs": "ort-wasm-simd-threaded.mjs",
    "onnxruntime-web/dist/ort-wasm-simd-threaded.wasm": "ort-wasm-simd-threaded.wasm",
    "@huggingface/tokenizers/dist/tokenizers.min.mjs": "tokenizers.min.mjs",
}


def vendor():
    out = os.path.join(APP, "vendor")
    os.makedirs(out, exist_ok=True)
    nm = os.path.join(NPM_DIR, "node_modules")
    if not all(os.path.exists(os.path.join(nm, k)) for k in VENDOR_FILES):
        os.makedirs(NPM_DIR, exist_ok=True)
        subprocess.run(["npm", "install", "--prefix", NPM_DIR,
                        f"onnxruntime-web@{ORT_VERSION}",
                        f"@huggingface/tokenizers@{TOKENIZERS_VERSION}"], check=True)
    for src, dst in VENDOR_FILES.items():
        shutil.copy(os.path.join(nm, src), os.path.join(out, dst))


def short_authors(authors):
    names = [a["name"] for a in authors]
    return ", ".join(names[:3]) + (" et al." if len(names) > 3 else "")


def main():
    import numpy as np

    with open(config.CORPUS, encoding="utf-8") as f:
        corpus = json.load(f)
    doc = np.load(os.path.join(STUDENT, "doc_embeddings.npy")).astype("<f4")
    assert doc.shape[0] == len(corpus)

    os.makedirs(os.path.join(APP, "model"), exist_ok=True)
    os.makedirs(os.path.join(APP, "data"), exist_ok=True)
    for f in ("model_int8.onnx", "tokenizer.json", "tokenizer_config.json"):
        shutil.copy(os.path.join(STUDENT, f), os.path.join(APP, "model", f))

    doc.tofile(os.path.join(APP, "data", "doc_emb.f32"))
    with open(os.path.join(STUDENT, "student_config.json"), encoding="utf-8") as f:
        scfg = json.load(f)
    model_mb = round(os.path.getsize(os.path.join(STUDENT, "model_int8.onnx")) / 1e6)
    papers = [{
        "id": r["id"], "type": r["type"], "title": r["title"],
        "abstract": r["abstract"], "authors": short_authors(r["authors"]),
        "track": r["track"], "doi": r["doi"], "session": r["session_name"],
        "room": r["room"], "floor": r["floor"], "start": r["start"], "end": r["end"],
    } for r in corpus]
    with open(os.path.join(APP, "data", "papers.json"), "w", encoding="utf-8") as f:
        json.dump(papers, f, ensure_ascii=False, separators=(",", ":"))

    hybrid_w = 0.3
    hp = os.path.join(config.ROOT, "docs", f"hybrid_report{TAG}.json")
    if os.path.exists(hp):
        with open(hp, encoding="utf-8") as f:
            hybrid_w = json.load(f).get("best_w", hybrid_w)
    with open(os.path.join(APP, "data", "config.json"), "w", encoding="utf-8") as f:
        json.dump({"n": int(doc.shape[0]), "dim": int(doc.shape[1]),
                   "query_prefix": scfg["query_prefix"], "max_len": scfg["max_len"],
                   "hybrid_w": hybrid_w, "model_mb": model_mb}, f)

    vendor()
    total = sum(os.path.getsize(os.path.join(d, x))
                for d, _, fs in os.walk(APP) for x in fs)
    print(f"Offline app bundled at {APP} ({total / 1e6:.1f} MB), hybrid_w={hybrid_w}")


if __name__ == "__main__":
    main()
