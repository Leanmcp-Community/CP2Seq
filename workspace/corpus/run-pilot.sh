#!/usr/bin/env bash
# Pilot batch of the synthetic Pureland corpus.
#
# Nothing is filtered and no coupling cut point is applied: this batch exists to produce the
# distribution that those decisions get made from (notes/plan/corpus-plan.md, and group B of
# notes/plan/experiment-spec-checklist.md, where the cut points are "pending pilot").
#
# Read out/pilot/report.md afterwards.
set -euo pipefail
cd "$(dirname "$0")"

node generate.mjs \
    --n 40 \
    --seed 20260916 \
    --out out/pilot \
    --export-steps

echo
echo "next: read workspace/corpus/out/pilot/report.md"
echo "      then pick the coupling cut points and the degeneracy filters from it"
