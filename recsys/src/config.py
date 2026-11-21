"""Shared paths and model configuration."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_RAW = os.path.join(ROOT, "data", "raw", "chi2026_latest.json")
CORPUS = os.path.join(ROOT, "data", "processed", "corpus.json")
META = os.path.join(ROOT, "data", "processed", "meta.json")

MODELS_DIR = os.path.join(ROOT, "models")
EMB_PATH = os.path.join(MODELS_DIR, "embeddings.npy")
EMB_META = os.path.join(MODELS_DIR, "index_meta.json")
HF_CACHE = os.path.join(MODELS_DIR, "hf_cache")

# Multilingual embedding model: lets users type a research topic in Korean or
# English and match it against the (English) CHI abstracts cross-lingually.
MODEL_NAME = os.environ.get("CHI_MODEL", "BAAI/bge-m3")

# bge-m3 is an instruction-free model; no query prefix needed. For bge-*-en
# models a query instruction would go here.
QUERY_PREFIX = os.environ.get("CHI_QUERY_PREFIX", "")
