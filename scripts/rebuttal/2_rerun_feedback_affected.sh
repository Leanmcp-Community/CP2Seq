#!/usr/bin/env bash
# Rebuttal step 2 (PAID, calls Codex): rerun every ablation episode whose comparison feedback
# differed from the fixed tool at ANY turn, with the fixed tool. Original results stay in
# their run folders; reruns land in new codex-* folders so both columns can be reported.
#
# Needs step 1 first (reads workspace/RESULTS/feedback-audit/rerun.tsv).
#   bash scripts/rebuttal/2_rerun_feedback_affected.sh            # dry run: prints commands
#   EXECUTE=1 bash scripts/rebuttal/2_rerun_feedback_affected.sh  # actually run
#
# Only Luna ablation conditions (80 turns, all image history) are rerun; earlier on-demand
# runs are listed but skipped because their budgets differ (paper reports them as measured).
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
tsv=workspace/RESULTS/feedback-audit/rerun.tsv
[[ -f $tsv ]] || { echo "Run 1_offline_audits.sh first ($tsv missing)" >&2; exit 1; }
all=$repo/workspace/corpus/out/release/all-layers/samples
some=$repo/workspace/corpus/out/release/some-generated-d5/samples
while IFS=$'\t' read -r model effort tools tier auto sample run; do
  [[ -n "$sample" ]] || continue
  if [[ "$auto" != true ]]; then echo "SKIP (on-demand, not an ablation arm): $model $sample $run"; continue; fi
  case $sample in layers-*) corpus=$some; space=any ;; *) corpus=$all; space=all-layers ;; esac
  cmd=(env SAMPLES="$sample" REASONING_EFFORT="$effort" MAX_TURNS=80 TIMEOUT=300 IMAGE_HISTORY=all
       COMPARE_TIER="$tier" bash CODEX_HARNESS_TESTING/run_luna_low_legal_autocompare.sh
       --model "$model" --corpus "$corpus" --action-space "$space")
  echo "${cmd[*]}"
  if [[ "${EXECUTE:-0}" == 1 ]]; then "${cmd[@]}"; fi
done < "$tsv"
