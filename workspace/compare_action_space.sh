#!/usr/bin/env bash
# Does restricting the search to the action space the corpus actually uses make mid
# searchable? Runs both arms and prints the comparison.
#
# THE QUESTION. All 4180 reference folds in release/all-layers are whole-stack folds, yet the
# enumerator offers contiguous top/bottom runs as well, which multiplies the candidate count
# by the layer count and appears to raise the branching factor. If restricting to `all` brings
# mid's search time from days down to hours, then mid stops being a tier where a model can be
# fairly compared against search, and FINDINGS_search_cost.md section 6.2 is wrong.
#
# WHY THIS SCRIPT RUNS BOTH ARMS RATHER THAN REUSING THE EXISTING DATA
# The quantity being compared is throughput, in node expansions per second, so it is only
# meaningful if both arms saw the same machine. The existing workspace/depth_wall data does
# not qualify: its 60s and 240s budgets were collected while two enumeration profiles were
# running. Both arms are therefore measured here, back to back, in one process at a time.
#
# NOTHING ELSE MAY RUN. Check first:
#   pgrep -fl 'profile_enum_cost|search_baseline'
#
# Run:  bash workspace/compare_action_space.sh
#       BUDGETS="1 4 15 60" bash workspace/compare_action_space.sh     # quick look
set -euo pipefail

cd "$(dirname "$0")/.."

if pgrep -f 'profile_enum_cost|search_baseline' > /dev/null; then
  echo "A measurement is already running. Throughput is what this compares, so wait for it:" >&2
  pgrep -fl 'profile_enum_cost|search_baseline' >&2
  exit 1
fi

SAMPLES="${SAMPLES:-easy-0001 easy-0003 easy-0007 mid-0001 mid-0002 mid-0003 hard-0001}"
BUDGETS="${BUDGETS:-1 4 15 60 240}"

for sel in any all; do
  OUT="workspace/depth_wall_$sel"
  mkdir -p "$OUT"
  CSV="$OUT/depth_wall.csv"
  echo "budget_s,sample_id,status,depth,reference,expanded,generated,seconds" > "$CSV"
  echo "=== selection=$sel ===" >&2
  for s in $BUDGETS; do
    echo "  budget ${s}s" >&2
    json="$OUT/budget-${s}s.json"
    node workspace/search_baseline_stateful.mjs --json --selection "$sel" \
      --seconds "$s" --max-states 5000000 $SAMPLES > "$json"
    node -e '
      const rows = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      for (const r of rows) console.log([process.argv[2], r.sample_id, r.status, r.depth ?? "",
        r.reference ?? "", r.expanded ?? "", r.generated ?? "", r.seconds ?? ""].join(","));
    ' "$json" "$s" >> "$CSV"
  done
done

echo
node -e '
const fs = require("fs");
const read = sel => fs.readFileSync(`workspace/depth_wall_${sel}/depth_wall.csv`, "utf8")
  .trim().split("\n").slice(1).map(l => l.split(","))
  .map(c => ({budget:+c[0], id:c[1], status:c[2], depth:+c[3], ref:+c[4],
              expanded:+c[5], generated:+c[6], seconds: c[7] === "" ? null : +c[7]}));
const A = read("any"), B = read("all");
const h = s => s < 60 ? s.toFixed(1)+"s" : s < 3600 ? (s/60).toFixed(1)+"min"
  : s < 86400 ? (s/3600).toFixed(1)+"h" : s < 31557600 ? (s/86400).toFixed(1)+"d"
  : (s/31557600).toExponential(2)+" y";
const pad = (v,n) => String(v).padEnd(n);

// b and throughput from budget-exhausted runs only: a solved run stops early, so its
// expansion count measures the problem, not the machine.
function fit(rows, id) {
  const t = rows.filter(r => r.id === id && r.status === "timeout" && r.budget >= 4 && r.expanded > 0);
  if (!t.length) return null;
  return {b: t.reduce((s,r) => s + r.generated/r.expanded, 0)/t.length,
          rate: t.reduce((s,r) => s + r.expanded/r.budget, 0)/t.length,
          ref: t[0].ref, deepest: Math.max(...rows.filter(r => r.id === id).map(r => r.depth))};
}

console.log("  sample      ref   any: b / nodes-s / to-ref        all: b / nodes-s / to-ref        ratio");
for (const id of [...new Set(A.map(r => r.id))]) {
  const a = fit(A, id), b = fit(B, id);
  const solvedA = A.find(r => r.id === id && r.status === "solved");
  const solvedB = B.find(r => r.id === id && r.status === "solved");
  const show = (f, solved) => solved ? `solved d${solved.depth} in ${solved.seconds.toFixed(1)}s`
    : f ? `${f.b.toFixed(2)} / ${f.rate.toFixed(1)} / ${h(Math.pow(f.b, f.ref)/f.rate)}` : "-";
  const tA = a && !solvedA ? Math.pow(a.b, a.ref)/a.rate : null;
  const tB = b && !solvedB ? Math.pow(b.b, b.ref)/b.rate : null;
  console.log(`  ${pad(id,12)}${pad(a?.ref ?? b?.ref ?? "-",6)}${pad(show(a,solvedA),34)}${pad(show(b,solvedB),34)}` +
              (tA && tB ? (tA/tB).toFixed(1)+"x" : ""));
}
console.log("\n  to-ref is b^(reference depth) / throughput: the constant-throughput LOWER bound,");
console.log("  used here only because both arms are computed the same way and the ratio is the point.");
'
