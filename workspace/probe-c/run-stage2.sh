#!/usr/bin/env bash
# Probe C stage 2 -- the full all-layers simple-fold search over the CPs stage 1 left in play.
#
# This is the expensive one. T4 proves deciding simple foldability is NP-hard, so a share of
# the 195 CPs will exhaust the query budget; that TIMEOUT fraction is a reported result, not a
# failure of the run. Expect a long wall clock on the large tessellation CPs.
#
#   bash workspace/probe-c/run-stage2.sh
#
# Tuning: --budget is queries (simulated folds) per CP -- the unit the paper's query-efficiency
# claim is measured in, so keep it fixed once results are quoted. --depth caps sequence length.
# /!\ RE-RUN PENDING as of 2026-09-16. stage2.mjs was fixed for a false-EXHAUSTED bug (noisy
# coordinates split one crease line into two buckets). The fix loosens matching, which enlarges
# the search space, and a spot check at a 10x smaller budget turned 27 of the 156 EXHAUSTED
# verdicts into TIMEOUT -- none into SOLVED. At the real budget they may well close again, but
# until this script is re-run, every probeC.* number in notes/facts.json is derived from the
# pre-fix results. Re-run, then: node workspace/tools/facts.mjs && node workspace/tools/doccheck.mjs
set -euo pipefail
cd "$(dirname "$0")/../.."

BUDGET="${BUDGET:-2000000}"
DEPTH="${DEPTH:-32}"
OUT="workspace/probe-c/stage2-log.txt"

# GATE. The first stage 2 run reported EXHAUSTED ("proven not simple-foldable") for 155 of 195
# CPs -- all of it wrong, from three geometry bugs. Never trust a run that has not passed the
# round trip first: these CPs are built BY FOLDING, so anything but SOLVED is a solver bug.
echo "self-test: fold forward, then ask the solver to recover the sequence..."
node workspace/probe-c/selftest.mjs 25 300000 | tail -1
echo

echo "refreshing stage 1 verdicts..."
node workspace/probe-c/screen.mjs | tail -3

echo
echo "stage 2: budget=$BUDGET queries/CP, depth=$DEPTH -- logging to $OUT"
node workspace/probe-c/stage2.mjs --budget="$BUDGET" --depth="$DEPTH" 2>&1 | tee "$OUT"

# Refresh the numbers the write-up is allowed to quote, and check every doc that cites them.
# A result that changes here must change everywhere it is quoted, in the same commit.
echo
node workspace/tools/facts.mjs
node workspace/tools/doccheck.mjs || {
  echo
  echo "^ docs disagree with the run you just did. 'node workspace/tools/doccheck.mjs --fix'"
  echo "  rewrites the tagged citations; RETIRED/BROKEN/UNOWNED need a human."
}
