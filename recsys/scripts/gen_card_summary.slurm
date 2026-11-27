#!/bin/bash
#SBATCH --job-name=chi-cardsum
#SBATCH --partition=A6000,L40S,RTX6000ADA,RTXPro6000
#SBATCH --exclude=n85
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=80G
#SBATCH --time=03:00:00
#SBATCH --array=0-3
#SBATCH --output=logs/gen_cardsum-%A_%a.out

# Submit from the project root:  sbatch scripts/gen_card_summary.slurm
# One shard per array task; a rerun skips items already in its shard file.
# Quick check first:  CHI_LIMIT=8 sbatch --array=0 scripts/gen_results.slurm
set -e
cd "$SLURM_SUBMIT_DIR"
source .venv/bin/activate
export HF_HOME="$PWD/models/hf_cache"
export HF_HUB_OFFLINE=1
export TOKENIZERS_PARALLELISM=false

echo "Node: $(hostname) | GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader)"
PYTHONUNBUFFERED=1 python scripts/gen_card_summary.py --shard "${SLURM_ARRAY_TASK_ID:-0}" \
  --of "${CHI_SHARDS:-4}" --limit "${CHI_LIMIT:-0}"
