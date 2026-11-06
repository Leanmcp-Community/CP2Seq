#!/usr/bin/env bash
# Rebuttal step 1: offline audits and matched baselines. Calls NO model; costs CPU only.
#
#   RUNS=/path/to/full/CODEX_HARNESS_TESTING/runs bash scripts/rebuttal/1_offline_audits.sh
#
# RUNS must be the FULL run tree the paper's inventory was built from (Dheeraj's machine:
# /Users/ddod/LEANMCP/ROBOTICS/FoldOrigami/CODEX_HARNESS_TESTING/runs). The local checkout
# holds only a subset. Outputs go to workspace/RESULTS/{identity-audit,feedback-audit,
# trajectories,matched-baselines,rebuttal-stats}.
#
# Expected wall time: identity audit part A minutes; part B (200 rollouts x 40 samples) and
# BFS (600 s cap x 40 samples) up to several hours. Steps are independent; comment out any.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
RUNS=${RUNS:-$repo/CODEX_HARNESS_TESTING/runs}
R=workspace/RESULTS
echo "== runs root: $RUNS"

echo "== 0. unit tests"
node DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/test_terminal_match.mjs

echo "== 1. identity audit (accepted solutions + adversarial random rollouts)"
node workspace/audit_identity.mjs --runs "$RUNS" --rollouts 200 --seed 1 --out $R/identity-audit

echo "== 2. comparison-feedback audit over every call"
node workspace/audit_compare_feedback.mjs --runs "$RUNS" --out $R/feedback-audit

echo "== 3. trajectory-level failure analysis + offline cycling sensitivity"
node workspace/trajectory_analysis.mjs --runs "$RUNS" --cycle-limits 2,3,4,5,6 --out $R/trajectories

echo "== 4. matched random-legal and BFS baselines on the 40 ablation samples"
node workspace/matched_baselines.mjs --random-episodes 100 --turns 80 \
  --bfs-budgets 80,1000,10000,100000 --bfs-seconds 600 --seed 1 --out $R/matched-baselines

echo "== 5. instance-clustered statistics (applies identity-audit flips)"
python3 workspace/analysis/rebuttal_stats.py --boot 10000 --seed 1

echo "== done. Reports:"
ls $R/identity-audit/report.md $R/feedback-audit/report.md $R/trajectories/report.md \
   $R/matched-baselines/report.md $R/rebuttal-stats/stats.md
