#!/bin/sh
# Which samples of a tier have NOT yet been run under the legal-folds condition.
#
#   sh workspace/pending_samples.sh easy            # easy-* still to do
#   sh workspace/pending_samples.sh mid
#   sh workspace/pending_samples.sh hard
#   sh workspace/pending_samples.sh all
#   sh workspace/pending_samples.sh easy --strict   # also redo episodes run under old stop rules
#
# Prints the pending sample ids, space separated, on STDOUT so it can be substituted straight
# into a run script. Everything else goes to STDERR so the substitution stays clean:
#
#   bash CODEX_HARNESS_TESTING/run_luna_low_legal.sh \
#     --samples $(sh workspace/pending_samples.sh hard) --max-turns 100
#
# WHAT COUNTS AS DONE
#   A sample is done when some run directory whose config says tools=legal-folds holds a
#   result.json for it. Two deliberate exclusions:
#     * error.json episodes are NOT done -- those died on quota or a CLI failure, not on the task.
#     * turn directories with no result.json are NOT done -- the batch was killed mid-episode.
#
#   --strict additionally ignores episodes run before the stop rules were fixed, i.e. any run
#   whose config lacks cycle_limit=3 and revisit_limit=15. Most of the easy and mid results so
#   far came from the old 5-arrival rule, which ended episodes early for doing legitimate
#   search; if the point of the rerun is to measure the model rather than that threshold, pass
#   --strict and redo them.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/.."

tier=${1:-all}
strict=${2:-}
case "$tier" in
  easy|mid|hard) pattern="$tier-*" ;;
  all) pattern='*' ;;
  *) printf '%s\n' "usage: $0 [easy|mid|hard|all] [--strict]" >&2; exit 2 ;;
esac

corpus=${CORPUS_DIR:-workspace/corpus/out/release/all-layers/samples}
runs=${RUNS_DIR:-CODEX_HARNESS_TESTING/runs}
[ -d "$corpus" ] || { printf '%s\n' "No corpus at $corpus" >&2; exit 1; }

all_samples=$(find "$corpus" -mindepth 1 -maxdepth 1 -type d -name "$pattern" | sed 's|.*/||' | sort)

# Collect the sample ids already completed under a qualifying run.
done_list=$(
  for d in "$runs"/*/; do
    [ -f "$d/config.json" ] || continue
    grep -q '"tools": *"legal-folds"' "$d/config.json" || continue
    if [ "$strict" = "--strict" ]; then
      grep -q '"cycle_limit": *3' "$d/config.json" || continue
      grep -q '"revisit_limit": *15' "$d/config.json" || continue
    fi
    # find, not a glob: a run directory with no results yet makes zsh abort the whole loop.
    find "$d" -mindepth 2 -maxdepth 2 -name result.json 2>/dev/null |
      sed 's|/result.json||; s|.*/||'
  done | sort -u
)

# grep -vxF rather than comm with process substitution: this runs under /bin/sh, which has no
# <(...). An empty done list must not swallow the whole corpus, hence the guard.
if [ -n "${done_list:-}" ]; then
  donefile=$(mktemp -t foldpending)
  trap 'rm -f "$donefile"' EXIT
  printf '%s\n' "$done_list" > "$donefile"
  pending=$(printf '%s\n' $all_samples | grep -vxF -f "$donefile" | tr '\n' ' ')
else
  pending=$(printf '%s\n' $all_samples | tr '\n' ' ')
fi
total=$(printf '%s\n' $all_samples | wc -l | tr -d ' ')
finished=$(printf '%s\n' ${done_list:-} | grep -c . || true)
left=$(printf '%s\n' $pending | wc -w | tr -d ' ')

{
  printf 'tier %s: %s samples, %s already done%s, %s pending\n' \
    "$tier" "$total" "$finished" "$([ "$strict" = "--strict" ] && echo ' under the current stop rules' || echo '')" "$left"
  if [ "$left" -eq 0 ]; then
    printf 'nothing to run\n'
  else
    printf '\nrun them with:\n  bash CODEX_HARNESS_TESTING/run_luna_low_legal.sh --samples $(sh %s %s %s)\n' \
      "workspace/pending_samples.sh" "$tier" "$strict"
  fi
} >&2

printf '%s\n' "$pending"
