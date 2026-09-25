#!/usr/bin/env bash
# Text-only ablation over the same 40 samples as the image ablation: no images at any turn.
#
# Samples: easy-0001..0010, mid-0001..0010, hard-0001..0010 (release/all-layers) and
#          layers-0001..0010 (some-generated-d5), the first ten of each group.
# Arms:    basic tools, legal-fold enumeration, legal enumeration + automatic tier-3 comparison.
# Model:   GPT-5.6 Luna, low reasoning effort (override with MATCHED_MODEL / MATCHED_EFFORT).
# = 120 episodes.
#
# This wrapper changes no existing script. It runs run_luna_matched40.sh exactly as the image
# ablation did, with one difference: IMAGE_HISTORY=none, which run_luna_matched40.sh passes to
# codex_fold_loop.py as --image-history none. That mode attaches no image, removes get_images
# from the action schema, and appends codex_fold_prompt_text_only.md to the prompt. Turn limit,
# timeout, stopping limits, sample IDs and tool arms are the image ablation's, so each
# text-only episode pairs with the image episode on the same sample and arm.
#
# Usage:
#   bash CODEX_HARNESS_TESTING/run_textonly_matched40.sh --pilot   # one episode, to time a turn
#   bash CODEX_HARNESS_TESTING/run_textonly_matched40.sh           # all 120 episodes
#   PARALLEL=1 bash CODEX_HARNESS_TESTING/run_textonly_matched40.sh  # arms one after another
#
# By default the three arms run in parallel, each working through its 40 samples in order;
# logs go to CODEX_HARNESS_TESTING/matched40-state/. The run is resumable: completed
# (sample, arm) pairs with this exact configuration are skipped, so rerunning after an
# interruption only does what is missing. Requires jq (brew install jq).
set -eo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(dirname -- "$here")
command -v jq >/dev/null || { echo 'jq is required: brew install jq' >&2; exit 1; }

export MATCHED_MODEL=${MATCHED_MODEL:-gpt-5.6-luna}
export MATCHED_EFFORT=${MATCHED_EFFORT:-low}
export IMAGE_HISTORY=none

if [[ "${1:-}" == --pilot ]]; then
  # One easy sample on the autocompare arm, with every setting the full run uses, so the
  # pilot also counts as that (sample, arm) pair and is skipped by the full run.
  cd "$repo_dir"
  REASONING_EFFORT=$MATCHED_EFFORT MAX_TURNS=${MAX_TURNS:-80} TIMEOUT=${TIMEOUT:-300} \
    SAMPLES=easy-0001 TOOLS=legal-folds \
    bash "$here/run_luna_low_legal_autocompare.sh" \
    --corpus "$repo_dir/workspace/corpus/out/release/all-layers/samples" \
    --action-space all-layers --model "$MATCHED_MODEL"
  echo "Pilot done. Seconds per turn: runs/<latest>/easy-0001/turn-*/process.json (duration_s)."
  exit 0
fi

exec bash "$here/run_luna_matched40.sh"
