#!/usr/bin/env bash
# Rebuttal step 3 (PAID, calls Codex): looser cycling threshold.
# Reruns the 40 ablation samples for ONE configuration with --cycle-limit 6 (paper: 3), so
# the paper can report whether stops labelled "cycling" become solves when allowed to continue.
# Default configuration: GPT-6 Luna, high effort, legal enumeration + automatic feedback (A),
# the arm with the most cycling stops (28/40). Override with MODEL / EFFORT / ARM.
#
#   bash scripts/rebuttal/3_run_cycling_sensitivity.sh                 # dry run
#   EXECUTE=1 bash scripts/rebuttal/3_run_cycling_sensitivity.sh
#   EXECUTE=1 ONLY_CYCLED=1 bash ...   # only samples that ended in state_cycling (needs step 1)
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
MODEL=${MODEL:-gpt-6-luna}; EFFORT=${EFFORT:-high}; ARM=${ARM:-autocompare}; LIMIT=${LIMIT:-6}
case $ARM in
  basic) runner=run_luna_low.sh ;; legal) runner=run_luna_low_legal.sh ;;
  autocompare) runner=run_luna_low_legal_autocompare.sh ;; *) echo "ARM: basic|legal|autocompare" >&2; exit 1 ;;
esac
all=$repo/workspace/corpus/out/release/all-layers/samples
some=$repo/workspace/corpus/out/release/some-generated-d5/samples
pick() { # group prefix -> sample list
  local g=$1 out=()
  for i in $(seq -w 1 10); do out+=("$g-00$i"); done
  if [[ "${ONLY_CYCLED:-0}" == 1 ]]; then
    local keep=()
    for s in "${out[@]}"; do
      if jq -e --arg s "$s" --arg m "$MODEL" --arg e "$EFFORT" \
        'any(.[]; .sample==$s and .model==$m and .effort==$e and .termination=="state_cycling")' \
        workspace/RESULTS/trajectories/episodes.json >/dev/null; then keep+=("$s"); fi
    done
    out=("${keep[@]:-}")
  fi
  echo "${out[*]:-}"
}
for g in easy mid hard layers; do
  samples=$(pick $g); [[ -n "$samples" ]] || continue
  if [[ $g == layers ]]; then corpus=$some; space=any; else corpus=$all; space=all-layers; fi
  cmd=(env SAMPLES="$samples" REASONING_EFFORT="$EFFORT" MAX_TURNS=80 TIMEOUT=300 IMAGE_HISTORY=all
       COMPARE_TIER=3 bash CODEX_HARNESS_TESTING/$runner
       --model "$MODEL" --corpus "$corpus" --action-space "$space" --cycle-limit "$LIMIT")
  echo "${cmd[*]}"
  if [[ "${EXECUTE:-0}" == 1 ]]; then "${cmd[@]}"; fi
done
