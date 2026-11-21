#!/bin/bash
#SBATCH --job-name=chi-ondevice
#SBATCH --partition=A6000
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=64G
#SBATCH --time=04:00:00
#SBATCH --output=logs/eval_ondevice-%j.out

# Submit from the project root:  sbatch scripts/eval_ondevice.slurm
# Models must be pre-downloaded into models/hf_cache (compute nodes are offline).
set -e
cd "$SLURM_SUBMIT_DIR"
source .venv/bin/activate
export HF_HOME="$PWD/models/hf_cache"
export HF_HUB_OFFLINE=1
export TOKENIZERS_PARALLELISM=false

echo "Node: $(hostname) | GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader)"
PYTHONUNBUFFERED=1 python scripts/eval_ondevice.py "$@"
