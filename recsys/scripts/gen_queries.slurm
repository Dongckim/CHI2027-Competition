#!/bin/bash
#SBATCH --job-name=chi-gen_queries
#SBATCH --partition=A6000
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=64G
#SBATCH --time=02:00:00
#SBATCH --output=logs/gen_queries-%j.out

# Submit from the project root:  sbatch scripts/gen_queries.slurm
# Models must be pre-downloaded into models/hf_cache (compute nodes are offline).
set -e
cd "$SLURM_SUBMIT_DIR"
source .venv/bin/activate
export HF_HOME="$PWD/models/hf_cache"
export HF_HUB_OFFLINE=1
export TOKENIZERS_PARALLELISM=false

echo "Node: $(hostname) | GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader)"
python scripts/gen_queries.py
