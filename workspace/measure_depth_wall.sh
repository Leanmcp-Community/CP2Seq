#!/usr/bin/env bash
# Measure the BFS depth wall: for a range of time budgets, how deep does the
# search actually get? Produces the data behind the "depth vs time" figure.
#
# SELECTION is the experimental condition, not a tuning knob:
#   any  the enumerator's default -- whole-stack folds plus contiguous top/bottom runs
#   all  whole-stack folds only
# All 4180 reference folds in out/release/all-layers are whole-stack, so on that corpus
# `all` cannot lose a reference solution while `any` multiplies the candidate count by the
# layer count. Run both and the difference is the price of the wider action space. On the
# some-verified-* / some-generated-* corpora, where about a third of reference folds are
# partial, only `any` is valid.
#
# Run:  bash workspace/measure_depth_wall.sh
#       SELECTION=all bash workspace/measure_depth_wall.sh
set -euo pipefail

cd "$(dirname "$0")/.."

EASY="easy-0001 easy-0002 easy-0003 easy-0004 easy-0005 easy-0006 easy-0007"
MID="${MID:-mid-0001 mid-0002 mid-0003}"
HARD="${HARD:-hard-0001 hard-0002}"
SAMPLES="${SAMPLES:-$EASY $MID $HARD}"

# Geometric budget ladder. Each step is ~4x, so on a b-branching tree each step should buy
# about log_b(4) extra levels if nothing else is limiting.
BUDGETS="${BUDGETS:-1 4 15 60 240 960}"
SELECTION="${SELECTION:-any}"

# The stateful searcher, which agrees with the merged search_baseline.mjs node for node
# (see bench_search_engines.sh) and does not re-fold each path from a flat sheet.
SEARCH=workspace/search_baseline_stateful.mjs

OUT="workspace/depth_wall${SELECTION:+_$SELECTION}"
[ "$SELECTION" = any ] && OUT=workspace/depth_wall
mkdir -p "$OUT"
CSV="$OUT/depth_wall.csv"
echo "budget_s,sample_id,status,depth,reference,expanded,generated,seconds" > "$CSV"

echo "selection filter: $SELECTION"
for s in $BUDGETS; do
  echo "=== budget ${s}s ===" >&2
  json="$OUT/budget-${s}s.json"
  node "$SEARCH" --json --selection "$SELECTION" --seconds "$s" \
    --max-states 5000000 $SAMPLES > "$json"
  node -e '
    const rows = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const r of rows) {
      console.log([process.argv[2], r.sample_id, r.status, r.depth ?? "",
                   r.reference ?? "", r.expanded ?? "", r.generated ?? "",
                   (r.seconds ?? "")].join(","));
    }
  ' "$json" "$s" >> "$CSV"
done

echo >&2
echo "wrote $CSV" >&2
column -s, -t < "$CSV"
