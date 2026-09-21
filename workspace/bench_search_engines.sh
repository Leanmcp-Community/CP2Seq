#!/usr/bin/env bash
# A/B the two BFS expansion strategies on the same samples, in one process.
#
#   replay    -- the merged search_baseline.mjs strategy: rebuild each node by
#                re-folding its whole path from a flat sheet, twice per child.
#   stateful  -- each node carries its own state; a child's state is the one
#                tryFold already produced. One fold per child.
#
# Both must report the same status, depth and winning action list. If the
# header line says ENGINES DISAGREE, the rewrite is wrong and nothing else in
# the output means anything.
#
# Run:  bash workspace/bench_search_engines.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Deliberately a mix: samples that solve fast, and easy-0003/0007 which do not.
# An unsolved sample is the more informative benchmark, because it runs the full
# time budget and so measures throughput rather than luck.
SAMPLES="${SAMPLES:-easy-0001 easy-0002 easy-0003 easy-0004 easy-0007}"
SECONDS_BUDGET="${SECONDS_BUDGET:-30}"

echo "budget ${SECONDS_BUDGET}s per engine per sample"
echo
node workspace/search_baseline_stateful.mjs --benchmark \
  --seconds "$SECONDS_BUDGET" $SAMPLES
