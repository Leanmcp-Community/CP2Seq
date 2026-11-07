#!/usr/bin/env bash
# FREE (calls no model). Did the model ever reach the target state and fail to submit it?
# Replays every visited accepted state of every saved episode and checks CP match + E_id.
# The result also equals what an oracle-stop rule would have scored on these trajectories.
#
#   bash scripts/rebuttal/7_passed_through_audit.sh
#   RUNS=/path/to/other/runs bash scripts/rebuttal/7_passed_through_audit.sh
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
RUNS=${RUNS:-$repo/CODEX_HARNESS_TESTING/runs}
args=(--runs "$RUNS")
# The released supplement holds the ablation episodes whose local copies were lost.
supp=$repo/PAPER_FINAL/iclr2026/origami-preprint-source/runs
[[ -d $supp ]] && args+=(--runs "$supp")
node workspace/audit_passed_through.mjs "${args[@]}" --out workspace/RESULTS/passed-through
