#!/bin/bash
#SBATCH --job-name=chi2026-embed
#SBATCH --partition=RTX3090
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
#SBATCH --time=00:30:00
#SBATCH --output=logs/embed-%j.out

# Build the CHI 2026 embedding index on a GPU compute node.
# Submit from the project root:  sbatch scripts/build_index.slurm
# Model weights must be pre-downloaded into models/hf_cache on the login node
# (compute nodes have no internet).

set -e
cd "$SLURM_SUBMIT_DIR"
mkdir -p logs
source .venv/bin/activate
export HF_HOME="$PWD/models/hf_cache"
export HF_HUB_OFFLINE=1          # force use of the local cache
export TOKENIZERS_PARALLELISM=false

echo "Node: $(hostname) | GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader)"
python scripts/build_index.py
