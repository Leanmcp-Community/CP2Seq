#!/usr/bin/env bash
# Sonnet 5.5 on the other 10 instances of the Luna pass@5 set: easy-0006..0010 (all-layers,
# action space all-layers) and layers-0006..0010 (some-generated-d5, action space any).
# With claude-20261107T175727765597Z / T183345423404Z / T232254743781Z this covers all 20.
# Same settings as 8_generality.sh: L+A, text only, low effort, 80 turns, 300 s timeout.
# Cost estimate from the pilot: easy ~$3-4 per episode, layers ~$1 -> about $20 in total.
#
#   bash scripts/rebuttal/8c_sonnet_rest10.sh                                   # dry run
#   caffeinate -i env EXECUTE=1 bash scripts/rebuttal/8c_sonnet_rest10.sh       # run
# Resume after a quota stop (2026-11-07: easy-0006, 0007 done in claude-20261107T234703304522Z;
# hit the 5-hour limit at easy-0008 turn 13, resets 7pm):
#   caffeinate -i env EXECUTE=1 EASY="easy-0008 easy-0009 easy-0010" bash scripts/rebuttal/8c_sonnet_rest10.sh
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
all=$repo/workspace/corpus/out/release/all-layers/samples
some=$repo/workspace/corpus/out/release/some-generated-d5/samples
common=(REASONING_EFFORT=low EFFORT=low MAX_TURNS=80 TIMEOUT=300 IMAGE_HISTORY=none CLAUDE_MODEL=claude-sonnet-5-5)
R=CODEX_HARNESS_TESTING/run_claude_low_legal_autocompare.sh
EASY=${EASY-"easy-0006 easy-0007 easy-0008 easy-0009 easy-0010"}
LAYERS=${LAYERS-"layers-0006 layers-0007 layers-0008 layers-0009 layers-0010"}
a=(env "${common[@]}" SAMPLES="$EASY"
   sh $R --corpus "$all" --action-space all-layers)
b=(env "${common[@]}" SAMPLES="$LAYERS"
   sh $R --corpus "$some" --action-space any)
if [[ -n "$EASY" ]]; then echo "${a[*]}"; [[ "${EXECUTE:-0}" == 1 ]] && "${a[@]}"; fi
if [[ -n "$LAYERS" ]]; then echo "${b[*]}"; [[ "${EXECUTE:-0}" == 1 ]] && "${b[@]}"; fi
exit 0
