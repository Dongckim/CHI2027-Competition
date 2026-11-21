#!/usr/bin/env python3
"""Encode the whole CHI 2026 corpus into embeddings (run on a GPU node).

Reads data/processed/corpus.json, embeds "title. abstract" for every record
with the configured sentence embedding model, and saves:
  models/embeddings.npy   float32 [N, dim], L2-normalized
  models/index_meta.json  model name, dim, ids in row order

Designed for SLURM: picks GPU automatically if torch.cuda is available,
otherwise falls back to CPU. Model weights are loaded from the local HF cache
(pre-downloaded on the login node) so no internet is needed on the compute node.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402


def main():
    import numpy as np
    import torch
    from sentence_transformers import SentenceTransformer

    os.environ.setdefault("HF_HOME", config.HF_CACHE)

    with open(config.CORPUS, encoding="utf-8") as f:
        corpus = json.load(f)

    texts = [f"{r['title']}. {r['abstract']}" for r in corpus]
    ids = [r["id"] for r in corpus]

    device = "cuda" if torch.cuda.is_available() else "cpu"
    gpu = torch.cuda.get_device_name(0) if device == "cuda" else "CPU"
    print(f"Device: {device} ({gpu}) | model: {config.MODEL_NAME} | N={len(texts)}")

    model = SentenceTransformer(config.MODEL_NAME, device=device,
                                cache_folder=config.HF_CACHE)

    t0 = time.time()
    emb = model.encode(texts, batch_size=64, show_progress_bar=True,
                       convert_to_numpy=True, normalize_embeddings=True)
    dt = time.time() - t0
    emb = emb.astype("float32")

    os.makedirs(config.MODELS_DIR, exist_ok=True)
    np.save(config.EMB_PATH, emb)
    with open(config.EMB_META, "w", encoding="utf-8") as f:
        json.dump({
            "model": config.MODEL_NAME,
            "dim": int(emb.shape[1]),
            "n": int(emb.shape[0]),
            "ids": ids,
            "device": device,
            "encode_seconds": round(dt, 1),
        }, f)
    print(f"Saved {emb.shape} to {config.EMB_PATH} in {dt:.1f}s "
          f"({len(texts)/dt:.1f} docs/s)")


if __name__ == "__main__":
    main()
