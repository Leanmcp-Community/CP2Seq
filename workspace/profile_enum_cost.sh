#!/usr/bin/env bash
# Measure what one list_legal_folds call costs, across all three tiers.
# Answers TODO.md §3 (hard-0001 enumeration cost, recorded as unmeasured).
#
# Run:  bash workspace/profile_enum_cost.sh
set -euo pipefail

cd "$(dirname "$0")/.."

OUT=workspace/enum_cost
mkdir -p "$OUT"

# Small and large CP within each tier, so the spread is visible and not just the
# tier label. easy-0108 and mid-0030 are the 736-edge outliers; hard-0043 is the
# 24448-edge extreme.
SAMPLES="${SAMPLES:-easy-0001 easy-0003 easy-0108 mid-0001 mid-0030 hard-0001 hard-0043}"

# Per sample. hard-0043 may well blow through this; that is itself the answer.
BUDGET="${BUDGET:-300}"

echo "profiling: $SAMPLES"
echo "budget ${BUDGET}s per sample"
echo

# One run, both formats. The JSON is flushed after every sample, so an interrupted run
# still leaves usable data behind.
node workspace/profile_enum_cost.mjs --budget "$BUDGET" \
  --json-out "$OUT/enum_cost.json" $SAMPLES | tee "$OUT/enum_cost.txt"

echo
echo "wrote $OUT/enum_cost.txt and $OUT/enum_cost.json"
