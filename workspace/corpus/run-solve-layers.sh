#!/usr/bin/env bash
# The some-layers solver: correctness gate first, then the baseline batch.
#
# Order matters. The round trip is the gate -- if the solver reports EXHAUSTED on a CP that was
# built by folding, every number the batch produces afterwards is meaningless, so the batch does
# not run until it passes.
#
# Costs, so you can pick the arguments knowingly: expanding one node is O(L) engine calls and
# each call is O(L^2) in the tear check, and iterative deepening re-expands on every pass. Depth
# is the expensive knob, not n.
set -euo pipefail
cd "$(dirname "$0")"

echo "== gate: round trip, 4-fold samples =="
node test-solve-layers.mjs --n 8 --steps 4 --partial 0.5 --budget 200000

echo
echo "== gate: round trip, 6-fold samples (slower; this is where the depth cost shows) =="
node test-solve-layers.mjs --n 6 --steps 6 --partial 0.5 --budget 1000000

echo
echo "== batch: the query baseline across the p(partial) sweep =="
for p in 0.00 0.50 1.00; do
    echo "-- p(partial) = $p"
    node test-solve-layers.mjs --n 10 --steps 5 --partial "$p" --budget 1000000
done

echo
echo "next: record the query percentiles and any TIMEOUT rate in notes/plan/corpus-plan.md,"
echo "      alongside the all-layers baseline they have to be compared against"
