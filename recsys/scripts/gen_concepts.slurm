#!/bin/bash
#SBATCH --job-name=chi-concepts
#SBATCH --partition=A6000
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=80G
#SBATCH --time=06:00:00
#SBATCH --array=0-3
#SBATCH --output=logs/gen_concepts-%A_%a.out

# Submit from the project root:  sbatch scripts/gen_concepts.slurm
# One shard per array task; a rerun skips items already in its shard file.
# Quick check first:  CHI_LIMIT=16 sbatch --array=0 scripts/gen_concepts.slurm
set -e
cd "$SLURM_SUBMIT_DIR"
source .venv/bin/activate
export HF_HOME="$PWD/models/hf_cache"
export HF_HUB_OFFLINE=1
export TOKENIZERS_PARALLELISM=false

echo "Node: $(hostname) | GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader)"
PYTHONUNBUFFERED=1 python scripts/gen_concepts.py --shard "${SLURM_ARRAY_TASK_ID:-0}" \
  --of "${CHI_SHARDS:-4}" --limit "${CHI_LIMIT:-0}" --task "${CHI_TASK:-terms}"
