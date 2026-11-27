#!/usr/bin/env python3
"""Embed every program item with the fine-tuned teacher (run on a GPU node).

Output: models/program_emb.npy  [2782, 1024] float32, rows in program.json order, and
models/program_ids.json, the item id of each row (the phone lines rows up by id, 11/26).
Same teacher and text ("title. abstract") as the main index, so the student's
query vectors compare directly; items without an abstract use the title alone.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402


def main():
    import numpy as np
    from sentence_transformers import SentenceTransformer
    with open(os.path.join(config.ROOT, "data", "processed", "program.json"), encoding="utf-8") as f:
        items = json.load(f)
    texts = [f"{it['title']}. {it['abstract']}" if it["abstract"] else it["title"] for it in items]
    model = SentenceTransformer(os.path.join(config.MODELS_DIR, "bge-m3-chi"), device="cuda")
    model.max_seq_length = 512
    emb = model.encode(texts, batch_size=64, convert_to_numpy=True,
                       normalize_embeddings=True).astype("float32")
    np.save(os.path.join(config.MODELS_DIR, "program_emb.npy"), emb)
    with open(os.path.join(config.MODELS_DIR, "program_ids.json"), "w") as f:
        json.dump([it["id"] for it in items], f)
    print("saved", emb.shape)


if __name__ == "__main__":
    main()
