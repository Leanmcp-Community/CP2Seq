#!/usr/bin/env bash
# Text-only ablation: does the model need the images?
#
# Reruns the strongest image configurations of the Luna ablation with NO images attached
# (--image-history none: nothing is sent, get_images is removed, and a short prompt appendix
# says so). Everything else matches the image runs already in the paper: GPT-6 Luna, high
# effort, 80 turns, 300 s timeout, same stopping limits, same ten sample IDs per group. The
# comparison is therefore paired by sample against Table 4's "GPT-6 Luna / High" rows.
#
# Default scope, chosen where the image runs actually solve something (medium and hard are
# 0/10 with images, so a text-only run there cannot show a drop):
#   groups  easy, some-layers          (10 samples each)
#   arms    legal, autocompare         (L and A in Table 4)
#   = 40 episodes
#
# Usage:
#   bash CODEX_HARNESS_TESTING/run_textonly_ablation.sh --pilot   # one episode, to time a turn
#   bash CODEX_HARNESS_TESTING/run_textonly_ablation.sh           # the full 40 episodes
# Overrides:
#   TEXTONLY_GROUPS="easy some mid hard"  ARMS="basic legal autocompare"  MATCHED_EFFORT=low
#
# Resumable: finished (sample, arm) pairs are detected from runs/*/config.json and skipped, so
# rerunning after an interruption only does what is missing. Requires jq (brew install jq).
set -eo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(dirname -- "$here")
command -v jq >/dev/null || { echo 'jq is required: brew install jq' >&2; exit 1; }

export MATCHED_MODEL=${MATCHED_MODEL:-gpt-6-luna}
export MATCHED_EFFORT=${MATCHED_EFFORT:-high}
export IMAGE_HISTORY=none
export ARMS=${ARMS:-legal autocompare}
groups=${TEXTONLY_GROUPS:-easy some}

if [[ "${1:-}" == --pilot ]]; then
  # easy-0006: solved with images by GPT-6 Luna high under both L and A, so a text-only
  # failure here is informative, and the episode is long enough to time real turns.
  cd "$repo_dir"
  REASONING_EFFORT=$MATCHED_EFFORT SAMPLES=easy-0006 TOOLS=legal-folds \
    bash "$here/run_luna_low_legal_autocompare.sh" \
    --corpus "$repo_dir/workspace/corpus/out/release/all-layers/samples" \
    --action-space all-layers --model "$MATCHED_MODEL"
  echo "Pilot done. Per-turn seconds are in runs/<latest>/easy-0006/turn-*/process.json (duration_s)."
  exit 0
fi

log_dir="$here/matched40-state/textonly-$(date +%Y%m%dT%H%M%S)"
mkdir -p "$log_dir"
pids=()
# One process per group, in parallel; within a group the arms run one after the other.
for group in $groups; do
  echo "group $group: log $log_dir/$group.log"
  MATCHED_GROUP=$group bash "$here/run_luna_matched40.sh" >"$log_dir/$group.log" 2>&1 &
  pids+=("$!")
  sleep 2
done
status=0
for pid in "${pids[@]}"; do wait "$pid" || status=1; done
echo "Done (status $status). Logs: $log_dir"
exit "$status"
