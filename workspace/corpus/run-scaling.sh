#!/usr/bin/env bash
# The paper's headline measurement: search cost vs. sequence length, both tiers, one axis.
#
# COST WARNING, from the gate's own numbers: some-layers 6-fold instances ran ~705k queries
# median with half unsolved inside a million, at roughly 7 seconds each. n=30 x depth 6 is
# therefore tens of minutes on its own, and depth 7 is worse by a large factor that is exactly
# what the run is measuring. scaling.json is rewritten after every cell, so killing this part
# way through leaves usable data rather than nothing.
#
# Start with the cheap half, read it, then decide whether to pay for the deep end.
set -euo pipefail
cd "$(dirname "$0")"

echo "== depths 3-5, both tiers, n=30 (minutes) =="
node scaling.mjs --n 30 --depths 3,4,5 --budget 1000000 --partial 0.5 --out out/scaling

echo
echo "== depth 6, both tiers, n=30 (this is the expensive one) =="
node scaling.mjs --n 30 --depths 4,6 --budget 1000000 --partial 0.5 --out out/scaling-deep

echo
echo "next: the growth factor per +2 folds is printed at the end of each run."
echo "      If fewer than half the instances solved at either end, the printed factor is a"
echo "      LOWER bound -- the unsolved ones are the expensive tail, not a random sample."
