#!/usr/bin/env bash
# Diagnostic pilot selected from prior Luna successes, not an unbiased benchmark subset.
# easy-0003: GPT-5.6 Luna low, legal-folds (20260923T051831297162Z).
# easy-0004: GPT-6 Luna low, legal-folds (20260923T051336200667Z).
# easy-0010: GPT-6 Luna high, legal-folds (20260923T092156931503Z).
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export SAMPLES="easy-0003 easy-0004 easy-0010"
export REASONING_EFFORT=low
export MAX_TURNS=80
export TIMEOUT=300
export IMAGE_HISTORY=all
exec bash "$script_dir/run_sol_low_legal.sh" \
  --model gpt-6-sol --action-space all-layers \
  --corpus "$script_dir/../workspace/corpus/out/release/all-layers/samples" \
  --compare-tier 0
