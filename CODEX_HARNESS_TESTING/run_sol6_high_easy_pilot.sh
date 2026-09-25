#!/usr/bin/env bash
# Follow-up on the two unsuccessful low-effort Sol pilot samples.
# Same settings as run_sol6_easy_pilot.sh except reasoning effort and sample subset.
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export SAMPLES="easy-0003 easy-0010"
export REASONING_EFFORT=high
export MAX_TURNS=80
export TIMEOUT=300
export IMAGE_HISTORY=all
exec bash "$script_dir/run_sol_low_legal.sh" \
  --model gpt-6-sol --action-space all-layers \
  --corpus "$script_dir/../workspace/corpus/out/release/all-layers/samples" \
  --compare-tier 0
