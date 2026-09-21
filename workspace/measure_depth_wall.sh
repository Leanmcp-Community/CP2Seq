#!/usr/bin/env bash
# Measure the BFS depth wall: for a range of time budgets, how deep does the
# search actually get? Produces the data behind the "depth vs time" figure.
#
# Output: one JSON array per budget on stdout, plus a combined CSV.
# Run:  bash workspace/measure_depth_wall.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Samples across all three tiers. Adjust freely; keep the count small per tier
# because the hard ones will burn the full budget every time.
EASY="easy-0001 easy-0002 easy-0003 easy-0004 easy-0005 easy-0006 easy-0007"
MID="${MID:-mid-0001 mid-0002 mid-0003}"
HARD="${HARD:-hard-0001 hard-0002}"
SAMPLES="${SAMPLES:-$EASY $MID $HARD}"

# Geometric budget ladder. Each step is ~4x, so on a 3.5-branching tree each
# step should buy roughly one extra level of depth if nothing else is limiting.
BUDGETS="${BUDGETS:-1 4 15 60 240 960}"

OUT="workspace/depth_wall"
mkdir -p "$OUT"
CSV="$OUT/depth_wall.csv"
echo "budget_s,sample_id,status,depth,reference,expanded,generated,seconds" > "$CSV"

for s in $BUDGETS; do
  echo "=== budget ${s}s ===" >&2
  json="$OUT/budget-${s}s.json"
  node workspace/search_baseline.mjs --json --seconds "$s" --max-states 5000000 $SAMPLES > "$json"
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
