#!/usr/bin/env bash
# The release corpus: both tiers, across the depth range each one can reach.
#
# EVERY SAMPLE IS CORRECT BY CONSTRUCTION -- it was produced by folding, and the pattern is what
# the folding left behind. There is no verified/generated split any more. The old one recorded
# whether a search could re-derive the sequence inside a budget, which capped the "verified" half
# at about five folds and made it, by measurement, entirely easy. The difficulty this corpus is
# about lives past that depth, so splitting on it was splitting on the wrong thing.
#
# The forward check runs separately and covers everything: verify-replay.mjs replays each
# recorded sequence and confirms it reproduces the pattern beside it, at O(folds).
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

echo "=== all-layers (4-19 folds, stratified) ==="
node generate.mjs --n 100 --seed 20260917 --out $OUT/all-shallow \
    --strata strata-shallow.json --export-steps
node generate.mjs --n 50  --seed 20260918 --out $OUT/all-deep --export-steps

echo
echo "=== some-layers (3-9 folds) ==="
for d in 3 4 5; do
    node generate-layers.mjs --n 100 --steps $d --partial 0.5 --seed $((20260917 + d)) \
        --out $OUT/some-d$d --export-steps
done
for d in 6 7 8 9; do
    node generate-layers.mjs --n 50 --steps $d --partial 0.5 --seed $((20260918 + d)) \
        --out $OUT/some-d$d --export-steps
done

echo
echo "next: node merge-release.mjs $OUT     (one manifest over every batch)"
echo "      node verify-replay.mjs $OUT     (replay every recorded sequence)"
