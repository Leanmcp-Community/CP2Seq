#!/usr/bin/env bash
# Same corpus, plus the pure-search label on every sample (slow: the solver is the thing that
# stalls past ~8 folds, so the hard strata will mostly TIMEOUT -- that is the measurement).
#
# Two things come out of this that the corpus itself does not need:
#   1. the subset the pure-search baseline curve can be drawn on
#   2. the depth at which the solver gives up -- the number to beat when it gets hardened
#
# /!\ An EXHAUSTED verdict on a sample we folded ourselves is a SOLVER BUG, not a finding:
#     the sequence exists by construction. The report calls this out.
set -euo pipefail
cd "$(dirname "$0")"

node generate.mjs \
    --n 40 \
    --seed 20260916 \
    --out out/verified \
    --export-steps \
    --verify --verify-budget 200000

echo
echo "next: read workspace/corpus/out/verified/report.md -- the last table is the solver's ceiling"
