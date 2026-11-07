#!/usr/bin/env bash
# Corpus v2: fix the layer explosion in the all-layers tier, and extend the some-layers tier.
#
# WHY (measured 2026-11-07 on the v1 release, out/release):
#   all-layers easy  layers p50 22,  max 512,    collapsed 11/200
#   all-layers mid   layers p50 94,  max 512,    collapsed 65/100
#   all-layers hard  layers p50 404, max 16384,  collapsed 96/100, 56/100 above 256 layers
# Whole-stack folds sampled uniformly almost always cross every layer, so layers double per fold
# and "hard" mostly means "a sliver folded in half many times" (fold-engine.mjs coupling note).
# Depth and layer count were the same variable, and hard states did not fit in a prompt.
#
# FIX: --coupling-cap 16 (one fold may crease at most 16 layers). Pilot, n=10 per stratum,
# seed 20261201 (scratchpad, 2026-11-07):
#   cap 4   hard does not fill (0/10), mid layers p50 28
#   cap 8   hard 3/10 filled, layers p50 52
#   cap 16  all strata fill; layers p50 easy 28 / mid 64 / hard 86, max 102 (v1: 16384);
#           bbox still shrinks with depth (collapsed 5/10 hard), which release.mjs explains is
#           inherent to whole-stack folding, not degeneracy.
# --max-attempts 400 (x n=30 default = 12000 attempts per stratum): the default 1200 filled
# only 39/100 hard (every rejection "stalled": no fold crosses <= CAP layers). Generation is
# seconds, so this costs nothing.
# Same strata and quotas as v1 (strata-release.json: easy 4-10 x200, mid 11-13 x100,
# hard 14-19 x100), new seed so v1 and v2 never share an instance.
#
# SOME-LAYERS: v1 stops at six folds. d7 and d8 are added back (n=50 each). Expect HOURS for
# these two (run-regenerate.sh: d7-d9 took most of the old generation time).
#
# Writes to out/release-v2; out/release (v1, used by every run so far) is NOT touched.
#
#   bash workspace/corpus/run-regenerate-v2.sh            # everything
#   SKIP_DEEP_LAYERS=1 bash workspace/corpus/run-regenerate-v2.sh   # all-layers only (minutes)
set -euo pipefail
cd "$(dirname "$0")"
OUT=out/release-v2
CAP=${CAP:-16}
rm -rf "$OUT"; mkdir -p "$OUT"

echo "=== 1/3 all-layers, coupling cap $CAP ==="
time node generate.mjs --seed 20261210 --out $OUT/all-layers-cap$CAP \
    --strata strata-release.json --coupling-cap "$CAP" --max-attempts 400 --export-steps

if [[ "${SKIP_DEEP_LAYERS:-0}" != 1 ]]; then
  echo "=== 2/3 some-layers d7, d8 (slow) ==="
  for d in 7 8; do
    time node generate-layers.mjs --n 50 --steps $d --partial 0.5 --seed $((20261210 + d)) \
        --out $OUT/some-generated-d$d --export-steps
  done
fi

echo "=== 3/3 replay check ==="
node verify-replay.mjs $OUT
echo "done: $OUT  (report.md in each batch; compare layers_final with out/release)"
