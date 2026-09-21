#!/usr/bin/env bash
# The experiment the all-layers corpus cannot run: is the partial-fold action space
# NECESSARY, or only expensive?
#
# On release/all-layers, restricting the search to whole-stack folds is 3-87x faster and
# loses nothing, because all 4180 reference folds there are whole-stack. That measures what
# partial folds cost and can never measure what they buy -- the answer is fixed by the
# corpus, not by the parameter.
#
# The some-* corpora are the other half. In some-verified-d3, 51 of 150 reference folds are
# partial and 37 of the 50 samples need at least one. So if `all` solves materially fewer
# samples than `any`, the wide action space is necessary rather than wasteful, and the
# harness is right to offer it -- it is only being applied to the wrong corpus.
#
# NOT A FOREGONE CONCLUSION. Every step of every reference sequence has at least one legal
# whole-stack fold available (legal_all is never 0), and the goal test is terminalMatch,
# which accepts any route to the same folded form. So a whole-stack-only search may still
# find an alternative route. That is the question.
#
# Run:  bash workspace/run_some_layers.sh
#       CORPUS=some-verified-d4 SECONDS_BUDGET=60 bash workspace/run_some_layers.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if pgrep -f 'profile_enum_cost|search_baseline' > /dev/null; then
  echo "Another measurement is running; solve counts are robust to load but timings are not:" >&2
  pgrep -fl 'profile_enum_cost|search_baseline' >&2
  exit 1
fi

CORPUS="${CORPUS:-some-verified-d3}"
DIR="workspace/corpus/out/release/$CORPUS/samples"
SECONDS_BUDGET="${SECONDS_BUDGET:-30}"
# All 50 by default. These are depth 3-6, so the budget is per sample and most should be fast.
SAMPLES="${SAMPLES:-$(ls "$DIR" | tr '\n' ' ')}"

OUT="workspace/some_layers/$CORPUS"
mkdir -p "$OUT"

echo "corpus: $CORPUS ($(echo $SAMPLES | wc -w | tr -d ' ') samples), ${SECONDS_BUDGET}s each"
for sel in any all; do
  echo "=== selection=$sel ===" >&2
  CORPUS_DIR="$DIR" node workspace/search_baseline_stateful.mjs --json \
    --selection "$sel" --seconds "$SECONDS_BUDGET" --max-states 2000000 \
    $SAMPLES > "$OUT/$sel.json"
done

echo
node -e '
const fs = require("fs");
const dir = process.argv[1];
const load = s => JSON.parse(fs.readFileSync(`${dir}/${s}.json`, "utf8"));
const A = load("any"), B = load("all");
const by = rows => Object.fromEntries(rows.map(r => [r.sample_id, r]));
const a = by(A), b = by(B);
const ids = A.map(r => r.sample_id);
const solved = rows => rows.filter(r => r.status === "solved").length;

// Which samples the reference itself solves with a partial fold. If `all` fails on exactly
// those, the action space is doing real work rather than padding the candidate count.
const corpusDir = process.argv[2];
const needsPartial = new Set(ids.filter(id => {
  try {
    return JSON.parse(fs.readFileSync(`${corpusDir}/${id}/seq.json`, "utf8")).folds
      .some(f => (f.selection?.mode ?? "all") !== "all");
  } catch { return false; }
}));

console.log(`  any solved ${solved(A)} of ${ids.length}`);
console.log(`  all solved ${solved(B)} of ${ids.length}`);
console.log(`  reference uses a partial fold in ${needsPartial.size} of ${ids.length}\n`);

const cell = (x, y) => ids.filter(id =>
  (a[id]?.status === "solved") === x && (b[id]?.status === "solved") === y).length;
console.log("                 all solved   all failed");
console.log(`  any solved     ${String(cell(true,true)).padEnd(13)}${cell(true,false)}`);
console.log(`  any failed     ${String(cell(false,true)).padEnd(13)}${cell(false,false)}`);

const onlyAny = ids.filter(id => a[id]?.status === "solved" && b[id]?.status !== "solved");
if (onlyAny.length) {
  const withPartial = onlyAny.filter(id => needsPartial.has(id)).length;
  console.log(`\n  ${onlyAny.length} solved only with partial folds available;` +
              ` ${withPartial} of those have a reference that uses one`);
  console.log(`  ${onlyAny.slice(0, 12).join(" ")}${onlyAny.length > 12 ? " ..." : ""}`);
} else {
  console.log("\n  Every sample any solved, all solved too: on this corpus a whole-stack-only");
  console.log("  search finds an alternative route to every target it can reach at all.");
}
' "$OUT" "$DIR"
