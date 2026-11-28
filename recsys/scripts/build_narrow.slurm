#!/bin/bash
#SBATCH --job-name=chi-narrow-keep
#SBATCH --partition=cpu-max24,cpu-max16,cpu-max10
#SBATCH --qos=nogpu
#SBATCH --cpus-per-task=8
#SBATCH --mem=48G
#SBATCH --time=02:00:00
#SBATCH --output=logs/build_narrow-%j.out

# CPU only: the engine judges every written question (scripts/build_narrow.py).
# Submit from the project root:  sbatch scripts/build_narrow.slurm
set -e
cd "$SLURM_SUBMIT_DIR"
source .venv/bin/activate
echo "Node: $(hostname) | CPUs: $SLURM_CPUS_PER_TASK"
CHI_WORKERS=8 PYTHONUNBUFFERED=1 python scripts/build_narrow.py
