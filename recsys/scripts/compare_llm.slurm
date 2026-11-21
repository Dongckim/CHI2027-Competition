#!/bin/bash
#SBATCH --job-name=chi-llm-compare
#SBATCH --partition=A6000
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=80G
#SBATCH --time=03:00:00
#SBATCH --array=0-6
#SBATCH --output=logs/compare_llm-%A_%a.out

# Submit from the project root:  sbatch scripts/compare_llm.slurm
# Tasks 0-1 greedy, 2-6 sampled (see scripts/compare_llm.py). Quick look: CHI_LIMIT=2 --array=0
set -e
cd "$SLURM_SUBMIT_DIR"
source .venv/bin/activate
export HF_HOME="$PWD/models/hf_cache"
export HF_HUB_OFFLINE=1
export TOKENIZERS_PARALLELISM=false

echo "Node: $(hostname) | GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader)"
PYTHONUNBUFFERED=1 python scripts/compare_llm.py --run "${SLURM_ARRAY_TASK_ID:-0}" --limit "${CHI_LIMIT:-0}"
