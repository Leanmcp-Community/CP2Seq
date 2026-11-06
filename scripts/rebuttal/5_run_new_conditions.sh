#!/usr/bin/env bash
# PAID (calls Codex). Two new arms on the same 40 ablation samples, GPT-5.6 Luna low effort,
# 80 turns, 300 s timeout, full image history -- identical settings to the existing B/L/A arms:
#   B+A          basic tools + automatic target feedback, no legal enumeration
#   images-only  basic tools, no coordinates anywhere (images + stack bounding box only)
#
#   bash scripts/rebuttal/5_run_new_conditions.sh                  # dry run: print commands
#   EXECUTE=1 bash scripts/rebuttal/5_run_new_conditions.sh        # both arms
#   EXECUTE=1 ARMS=images-only bash scripts/rebuttal/5_run_new_conditions.sh
#   EXECUTE=1 SMOKE=1 ...   # 2 easy + 1 some-layers sample per arm first, to check cost
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
ARMS=${ARMS:-"b-plus-a images-only"}
all=$repo/workspace/corpus/out/release/all-layers/samples
some=$repo/workspace/corpus/out/release/some-generated-d5/samples
if [[ "${SMOKE:-0}" == 1 ]]; then
  all_samples="easy-0001 easy-0004"; some_samples="layers-0001"
else
  all_samples=$(for g in easy mid hard; do for i in $(seq -w 1 10); do printf '%s-00%s ' $g $i; done; done)
  some_samples=$(for i in $(seq -w 1 10); do printf 'layers-00%s ' $i; done)
fi
for arm in $ARMS; do
  case $arm in
    b-plus-a) runner=run_luna_low_autocompare_base.sh ;;
    images-only) runner=run_luna_low_images_only.sh ;;
    *) echo "unknown arm $arm" >&2; exit 1 ;;
  esac
  for part in all some; do
    if [[ $part == all ]]; then samples=$all_samples; corpus=$all; space=all-layers
    else samples=$some_samples; corpus=$some; space=any; fi
    cmd=(env SAMPLES="$samples" REASONING_EFFORT=low MAX_TURNS=80 TIMEOUT=300 IMAGE_HISTORY=all
         bash CODEX_HARNESS_TESTING/$runner --corpus "$corpus" --action-space "$space")
    echo "${cmd[*]}"
    if [[ "${EXECUTE:-0}" == 1 ]]; then "${cmd[@]}"; fi
  done
done
