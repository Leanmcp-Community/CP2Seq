#!/usr/bin/env bash
# Five mid samples, whole-stack folds only, both arms -- against a recorded baseline that
# used the wide action space.
#
# WHY
# Every one of the 4180 reference folds in release/all-layers is whole-stack, so on that
# corpus the partial-fold half of the action space cannot appear in a solution while it
# multiplies the enumerator's candidate count by the layer count and raises the branching
# factor. On some-verified-d3 and some-generated-d6 the opposite holds: 14% and 34% of samples
# cannot be solved without it. So the action space belongs to the corpus, and this run applies
# the setting that matches this one -- to BOTH arms, because giving it to only one would tell
# that arm something about the solution the other has not been told.
#
# THE BASELINE
# CODEX_HARNESS_TESTING/runs/codex-20260921T085459155281Z already ran these five samples with
# the wide action space and solved none of them: four ended in state_cycling and mid-0004
# reached finish with cp_match true and the wrong layer order. Every other setting below is
# copied from that run's config.json so --action-space is the only thing that differs.
#
# WHAT IT COSTS
# The search arm is free and runs by default. The MODEL arm spends real quota and hours, so it
# is opt-in: MODEL=1. Nothing here modifies an existing script or an existing run.
#
#   bash workspace/mid_all_layers_experiment.sh                  # search arms + preflight
#   SECONDS_BUDGET=1800 bash workspace/mid_all_layers_experiment.sh
#   MODEL=1 bash workspace/mid_all_layers_experiment.sh          # adds the model arm
set -euo pipefail

cd "$(dirname "$0")/.."

SAMPLES="${SAMPLES:-mid-0001 mid-0002 mid-0003 mid-0004 mid-0005}"
BASELINE="${BASELINE:-CODEX_HARNESS_TESTING/runs/codex-20260921T085459155281Z}"
OUT="${OUT:-workspace/mid_all_layers}"
# Per sample, per arm. The projection for mid-0001 under whole-stack folds is about half an
# hour, so a 900 s default will reach some samples and not others; raise it to see the rest.
SECONDS_BUDGET="${SECONDS_BUDGET:-900}"
mkdir -p "$OUT"

echo "samples:  $SAMPLES"
echo "baseline: $BASELINE"
echo

# ---------------------------------------------------------------- preflight (free, no model)
echo "=== preflight: what the model is offered in each action space ==="
python3 - <<'PY'
import sys
sys.path.insert(0, "DHEERAJ_WORKSPACE/EXPERIMENT_SETUP")
from tool_schemas import tools_for
for space in ("any", "all-layers"):
    specs = {t["function"]["name"]: sorted(t["function"]["parameters"]["properties"])
             for t in tools_for("legal-folds", 3, space)}
    print(f"  {space:11} add_fold         {specs['add_fold']}")
    print(f"  {'':11} list_legal_folds {specs['list_legal_folds']}")
PY
echo

# ------------------------------------------------------------------------------- search arms
if pgrep -f 'profile_enum_cost|search_baseline|codex_fold_loop' > /dev/null; then
  echo "Another measurement is running; time-to-solve is what this reports, so stop it first:" >&2
  pgrep -fl 'profile_enum_cost|search_baseline|codex_fold_loop' >&2
  exit 1
fi

for sel in any all; do
  echo "=== search, selection=$sel, ${SECONDS_BUDGET}s per sample ==="
  node workspace/search_baseline_stateful.mjs --json --selection "$sel" \
    --seconds "$SECONDS_BUDGET" --max-states 5000000 $SAMPLES > "$OUT/search-$sel.json"
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const x of r) {
      const t = x.status === "solved" ? `${x.seconds.toFixed(1)}s at depth ${x.depth}/${x.reference}`
                                      : `${x.status} at depth ${x.depth ?? "-"}/${x.reference}`;
      console.log(`  ${x.sample_id.padEnd(10)}${t}`);
    }
  ' "$OUT/search-$sel.json"
  echo
done

# -------------------------------------------------------------------------------- model arm
if [ "${MODEL:-0}" = "1" ]; then
  echo "=== model, --action-space all-layers ==="
  echo "    Every other setting matches the baseline run's config.json."
  # One sample per invocation so a wall clock can be attributed to each, and so one sample
  # failing does not take the rest with it.
  for s in $SAMPLES; do
    start=$(date +%s)
    python3 CODEX_HARNESS_TESTING/codex_fold_loop.py \
      --samples "$s" \
      --action-space all-layers \
      --tools legal-folds --compare-tier 3 --compare-auto \
      --model gpt-5.6-luna --reasoning-effort low --image-history all \
      --max-turns 80 --timeout 300 \
      --out "$OUT/model-runs" > "$OUT/model-$s.log" 2>&1 || true
    echo "$s $(( $(date +%s) - start ))" >> "$OUT/model-seconds.txt"
    echo "  $s done in $(( $(date +%s) - start ))s"
  done
  echo
else
  echo "=== model arm skipped (MODEL=1 to include it; it spends quota and takes hours) ==="
  echo
fi

# -------------------------------------------------------------------------------- comparison
node -e '
const fs = require("fs"), path = require("path");
const [out, baselineDir] = process.argv.slice(1);
const read = p => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const pad = (v, n) => String(v).padEnd(n);

const any = read(`${out}/search-any.json`) ?? [];
const all = read(`${out}/search-all.json`) ?? [];
const base = (read(`${baselineDir}/results.json`) ?? []).filter(r => r.sample_id?.startsWith("mid"));
const byId = rows => Object.fromEntries(rows.map(r => [r.sample_id, r]));
const A = byId(any), B = byId(all), Z = byId(base);

// The model arm writes one run directory per sample; collect whatever exists.
const modelRuns = [];
try {
  for (const d of fs.readdirSync(`${out}/model-runs`)) {
    const r = read(path.join(out, "model-runs", d, "results.json"));
    if (r) modelRuns.push(...r);
  }
} catch {}
const M = byId(modelRuns);
const secs = {};
try {
  for (const line of fs.readFileSync(`${out}/model-seconds.txt`, "utf8").trim().split("\n")) {
    const [id, s] = line.split(" ");
    secs[id] = Number(s);
  }
} catch {}

const cell = r => !r ? "-" : r.status === "solved" ? `solved ${r.seconds.toFixed(0)}s` : r.status;

console.log("\n=== SEARCH: time to reach the reference depth ===");
console.log(`  ${pad("sample", 11)}${pad("ref", 5)}${pad("any (wide)", 20)}all (whole-stack only)`);
for (const id of Object.keys(A).length ? Object.keys(A) : Object.keys(B)) {
  console.log(`  ${pad(id, 11)}${pad(A[id]?.reference ?? B[id]?.reference ?? "-", 5)}` +
              `${pad(cell(A[id]), 20)}${cell(B[id])}`);
}

if (base.length) {
  console.log("\n=== MODEL: this run against the recorded wide-action-space baseline ===");
  console.log(`  ${pad("sample", 11)}${pad("baseline (any)", 34)}this run (all-layers)`);
  const show = r => !r ? "not run" :
    `${r.termination}, ${r.sample_calls} turns, cp=${r.cp_match}, solved=${r.solved}`;
  for (const id of base.map(r => r.sample_id)) {
    const mine = M[id] ? show(M[id]) + (secs[id] ? ` (${(secs[id] / 60).toFixed(0)} min)` : "") : "not run";
    console.log(`  ${pad(id, 11)}${pad(show(Z[id]), 34)}${mine}`);
  }
  const solvedBase = base.filter(r => r.solved).length;
  const solvedMine = Object.values(M).filter(r => r.solved).length;
  if (Object.keys(M).length) {
    console.log(`\n  solved: baseline ${solvedBase}/${base.length}, this run ${solvedMine}/${Object.keys(M).length}`);
  }
}
console.log(`\nartifacts in ${out}`);
' "$OUT" "$BASELINE"
