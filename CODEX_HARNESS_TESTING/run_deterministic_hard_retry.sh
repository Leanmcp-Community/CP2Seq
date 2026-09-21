#!/bin/sh
# Re-run only the samples the deterministic search has never solved, with a big budget.
#
# At 10s, BFS solved 117 of 200 easy samples and timed out on 83. Those 83 are not failures of
# the algorithm -- BFS is complete, so every one of them is a sample whose solution sits deeper
# than the frontier reached in time. The only question about them is how much clock they need,
# and re-running the 117 that already solved to find that out would waste most of the budget.
#
# So: collect every sample some deterministic run has solved, subtract, and search what is left
# with five minutes each.
#
#   bash CODEX_HARNESS_TESTING/run_deterministic_hard_retry.sh easy
#   SECONDS_PER_SAMPLE=600 DEADLINE_MINUTES=120 bash CODEX_HARNESS_TESTING/run_deterministic_hard_retry.sh mid
#
# WHAT TO EXPECT. The frontier grows about 3.5 per level, so thirty times the budget buys
# roughly three more levels, not thirty. easy-0003 reached depth 6 of 10 at 45s having been no
# further at 10s. If 300s converts a chunk of the 83, depth was simply a budget question; if it
# converts almost none, BFS is the wrong algorithm past depth 6 and the honest next step is a
# best-first search ordered by the compare-to-target distance rather than a longer wait.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(dirname -- "$script_dir")
cd "$repo_dir"

tier=${1:-easy}
case "$tier" in
  easy|mid|hard) : ;;
  *) printf '%s\n' "usage: $0 [easy|mid|hard]" >&2; exit 2 ;;
esac

: "${WORKERS:=8}"
: "${SECONDS_PER_SAMPLE:=300}"
: "${DEADLINE_MINUTES:=90}"
# STRATEGY=astar searches the same actions but orders the frontier by estimated folds
# remaining. Worth it here precisely because these samples defeated breadth-first.
: "${STRATEGY:=bfs}"
: "${CORPUS_DIR:=$repo_dir/workspace/corpus/out/release/all-layers/samples}"
runs=${RUNS_DIR:-CODEX_HARNESS_TESTING/runs}

# Solved by ANY deterministic run, at any budget: a solution found once does not need finding
# again. Model runs are deliberately ignored -- this arm's unsolved set is its own.
solved=$(mktemp -t detsolved)
trap 'rm -f "$solved"' EXIT
for d in $(ls -d "$runs"/deterministic-*/ 2>/dev/null); do
  for r in $(find "$d" -mindepth 2 -maxdepth 2 -name result.json 2>/dev/null); do
    grep -q '"solved": true' "$r" || continue
    basename "$(dirname "$r")"
  done
done | sort -u > "$solved"

all=$(find "$CORPUS_DIR" -mindepth 1 -maxdepth 1 -type d -name "$tier-*" | sed 's|.*/||' | sort)
if [ -s "$solved" ]; then
  todo=$(printf '%s\n' $all | grep -vxF -f "$solved" | tr '\n' ' ')
else
  todo=$(printf '%s\n' $all | tr '\n' ' ')
fi
total=$(printf '%s\n' $all | wc -l | tr -d ' ')
left=$(printf '%s\n' $todo | wc -w | tr -d ' ')

printf '%s: %s samples, %s already solved deterministically, %s to retry\n' \
  "$tier" "$total" "$((total - left))" "$left" >&2
if [ "$left" -eq 0 ]; then
  printf 'nothing left to retry\n' >&2
  exit 0
fi
printf 'strategy %s, budget %ss each, %s workers, deadline %s min\n' \
  "$STRATEGY" "$SECONDS_PER_SAMPLE" "$WORKERS" "$DEADLINE_MINUTES" >&2
# Worst case is left x seconds / workers; say it out loud before burning an hour on it.
printf 'worst case if none solve: about %s min\n' \
  "$(( left * SECONDS_PER_SAMPLE / WORKERS / 60 ))" >&2

exec "${FOLD_PYTHON:-$repo_dir/.venv/bin/python}" "$script_dir/deterministic_fold_loop.py" \
  --samples $todo \
  --seconds "$SECONDS_PER_SAMPLE" \
  --workers "$WORKERS" \
  --deadline-minutes "$DEADLINE_MINUTES" \
  --strategy "$STRATEGY"
