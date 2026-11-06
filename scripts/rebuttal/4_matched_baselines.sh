#!/usr/bin/env bash
# Matched baselines: BFS and random-legal on the SAME 40 instances the Luna ablations used,
# same action space, same legal-fold enumerator, success = CP match + E_id. Calls NO model.
#
# Question it answers: with the same budget, does a blind search do better or worse than
# the model? One model turn that calls list_legal_folds costs about one BFS expansion
# (one enumeration of the legal folds from one state), so "80 expansions" is the model's
# 80-turn budget, and the larger budgets show how much more search BFS needs.
#
#   bash scripts/rebuttal/4_matched_baselines.sh          # quick: ~minutes
#   FULL=1 bash scripts/rebuttal/4_matched_baselines.sh   # full: up to ~hours (600 s cap per sample)
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
if [[ "${FULL:-0}" == 1 ]]; then
  node workspace/matched_baselines.mjs --random-episodes 100 --turns 80 \
    --bfs-budgets 80,1000,10000,100000 --bfs-seconds 600 --seed 1 \
    --out workspace/RESULTS/matched-baselines
else
  node workspace/matched_baselines.mjs --random-episodes 20 --turns 80 \
    --bfs-budgets 80,1000 --bfs-seconds 60 --seed 1 \
    --out workspace/RESULTS/matched-baselines-quick
fi
