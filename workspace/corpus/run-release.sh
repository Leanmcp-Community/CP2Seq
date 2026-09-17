#!/usr/bin/env bash
# The release corpus: two splits, and the split is the honest part.
#
#   VERIFIED    every sample carries a pure_search verdict from the tier's own solver, so the
#               (pattern, sequence) pair has been checked by something other than the generator
#               that made it. Bounded by what the solver can close in reasonable time: about six
#               folds all-layers, five some-layers.
#   GENERATED   deeper samples, correct BY CONSTRUCTION -- they were produced by folding -- but
#               with no independent verdict. This is where the real difficulty lives, and saying
#               so is better than pretending the corpus stops at five folds.
#
# Scale is ~400 per tier, matching the published comparables (GamiBench 372, OrigamiSpace 350)
# rather than chasing a bigger number. Ten thousand abstract patterns would not answer the
# question actually asked of a synthetic corpus, which is whether its instances mean anything.
#
# /!\ THE SHALLOW END MAY NOT FILL. There are only so many distinct three-fold patterns once the
# square's eight symmetries are deduplicated, and the generators reject isomorphic duplicates
# rather than shipping them twice. A quota that does not fill is reported as not filled.
set -euo pipefail
cd "$(dirname "$0")"
OUT=out/release

echo "=== all-layers, VERIFIED (3-6 folds, 100 each) ==="
node generate.mjs --n 100 --seed 20260917 --out $OUT/all-verified \
    --strata strata-verified.json --export-steps --verify --verify-budget 1000000

echo
echo "=== all-layers, GENERATED (4-19 folds, 50 per stratum) ==="
node generate.mjs --n 50 --seed 20260918 --out $OUT/all-generated --export-steps

echo
echo "=== some-layers, VERIFIED (3-5 folds, 100 each) ==="
for d in 3 4 5; do
    node generate-layers.mjs --n 100 --steps $d --partial 0.5 --seed $((20260917 + d)) \
        --out $OUT/some-verified-d$d --export-steps --verify --verify-budget 1000000
done

echo
echo "=== some-layers, GENERATED (6-9 folds, 50 each) ==="
for d in 6 7 8 9; do
    node generate-layers.mjs --n 50 --steps $d --partial 0.5 --seed $((20260918 + d)) \
        --out $OUT/some-generated-d$d --export-steps
done

echo
echo "next: node release.mjs $OUT/all-verified   (and each other batch) to pick the release subset"
