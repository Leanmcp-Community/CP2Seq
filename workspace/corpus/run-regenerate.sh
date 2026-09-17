#!/usr/bin/env bash
# Regenerate the release corpus on the fixed planarize, then check it with the strict verifier.
#
# WHY THIS RUN EXISTS. The stored crease patterns were displaced by up to EPS/2 = 5e-10 by
# planarize's own cut-position rounding: it snapped every cut parameter onto a 1e-9 lattice and
# built the vertex FROM the snapped parameter, so the coordinate written to disk was not the
# coordinate the fold produced. That is in the DATA, not in a checker, so no amount of fixing the
# comparison removes it -- the corpus has to be made again. planarize.mjs now merges near-equal
# cuts while keeping the first unrounded value, and identifies vertices by a radius lookup over
# neighbouring cells instead of by a grid key. Measured effect of the fix alone, same input:
# 858 vertices before, 825 after -- 33 points the grid had split at a cell boundary.
#
# SIZE. 400 all-layers (easy 200 / mid 100 / hard 100) and 200 some-layers, 600 in total, down
# from 1050. The all-layers strata carry their own quotas in strata-release.json and run in ONE
# invocation, because the isomorphic-duplicate table is per-invocation and splitting the run
# would stop duplicates across strata being caught.
#
# /!\ THE DEEP SOME-LAYERS END IS GONE, and that is a real loss, not a tidy-up. The corpus
# previously ran to nine folds on that tier and the argument for it was that the difficulty the
# benchmark is about lives past the depth the solver can reach. d7-d9 is also where nearly all
# the generation time went -- hours, against minutes for everything else. This run stops at six.
# If the deep end is wanted back, it is four lines below and a long wall-clock, not a redesign.
#
# WHAT TO EXPECT, written down BEFORE the run so the result can disagree with it:
#
#   - verify-exact is the number that matters. On the OLD corpus, with the bottleneck metric, it
#     was 141 exact of 1050, with failures clustering at ~1e-10 to ~1e-9 -- exactly the
#     displacement the planarize fix removes. If the diagnosis is right those collapse. What may
#     survive is last-bit disagreement from reflection arithmetic (~1e-16), which is a different
#     question needing a different answer.
#   - The old run also showed 5 samples deviating at 1e-4 to 1e-5, far above any rounding, with
#     dozens of segments that pair with nothing at all. Four of the five were d8/d9 samples that
#     this smaller corpus no longer generates, so their absence here is NOT evidence they were
#     fixed. They are preserved under failures-snapshot/ and are still unexplained.
#   - Composition is seed-driven and deterministic: the previous two runs agreed exactly,
#     including one isomorphic duplicate rejected in some-verified-d3. A change in the counts is
#     a result about the fix, not a detail -- report it rather than absorbing it.
#
# /!\ This rebuilds out/release in place. The previous corpus is in git; commit or stash first
# if you want to diff the two.
#
#   bash run-regenerate.sh
set -euo pipefail
cd "$(dirname "$0")"
OUT=out/release

# /!\ CLEAR THE OUTPUT FIRST, and this is not housekeeping -- leaving it out produced a corpus
# that could not be interpreted. merge-release.mjs discovers batches by looking for directories
# containing a manifest.json, so every batch from every previous run is picked up whether or not
# this script still generates it. When the all-layers batches were renamed and the deep
# some-layers ones dropped, the stale directories stayed: the merge reported 1400 samples across
# eleven batches instead of 600 across five, "67 isomorphic duplicates across batches" that were
# simply the same seeds present twice, and -- the part that makes the numbers meaningless -- a
# mixture of patterns written by the OLD planarize and the new one, verified together.
#
# Safe to delete: the previous corpus is committed (4631c0ce), so `git checkout -- out/release`
# restores it, and everything here rebuilds from its seed regardless.
echo "=== 0/4  clearing $OUT ==="
rm -rf $OUT
mkdir -p $OUT

echo "=== 1/4  all-layers (easy 200 / mid 100 / hard 100) ==="
node generate.mjs --seed 20260918 --out $OUT/all-layers \
    --strata strata-release.json --export-steps

echo
echo "=== 2/4  some-layers, VERIFIED (3-4 folds, 50 each) ==="
for d in 3 4; do
    node generate-layers.mjs --n 50 --steps $d --partial 0.5 --seed $((20260917 + d)) \
        --out $OUT/some-verified-d$d --export-steps --verify --verify-budget 1000000
done

echo
echo "=== 3/4  some-layers, GENERATED (5-6 folds, 50 each) ==="
for d in 5 6; do
    node generate-layers.mjs --n 50 --steps $d --partial 0.5 --seed $((20260918 + d)) \
        --out $OUT/some-generated-d$d --export-steps
done

echo
echo "=== 4/4  merge, verify, index ==="
node merge-release.mjs $OUT

echo
echo "--- strict: exact segment match, no tolerance in the verdict ---"
node verify-exact.mjs $OUT --quiet || true
echo
echo "--- tolerant: the existing replay check, for comparison with the old numbers ---"
node verify-replay.mjs $OUT --quiet || true

# /!\ THE INDEX IS BUILT LAST, and building it earlier silently lied. build-index.mjs reads
# replay-check.json to fill the browser's REPLAY column; run before the verifiers, on a directory
# this script has just cleared, that file does not exist and every sample is indexed as having
# passed. The browser then offers a "replay FAILED" filter that can never match anything, which
# is worse than not offering it -- a viewer that cannot show its own failures hides the thing
# most worth seeing.
echo
node build-index.mjs $OUT > $OUT/index.json

echo
echo "done. compare against the expectations at the top of this script before believing it."
