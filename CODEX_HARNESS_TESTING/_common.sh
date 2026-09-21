# Shared body of the Codex fold-harness run scripts. Sourced by run_<model>_<effort>.sh and
# run_<model>_<effort>_legal.sh; not meant to be executed on its own.
#
# THE ABLATION CONTRACT
# ---------------------
# The point of this file is that the two arms cannot drift apart. Every flag below is shared,
# and a run script sets only MODEL and, for the enumerator arm, TOOLS. So the sole difference
# between run_luna_low.sh and run_luna_low_legal.sh is `--tools legal-folds`, and a results
# table can attribute a difference to the tool rather than to a stray flag in one script.
#
# TOOLS defaults to base. The list_legal_folds action is never exposed unless a script or a
# caller asks for it by name, so every pre-existing run command behaves exactly as it did
# before the enumerator was written.
#
# A run script sets, before sourcing:
#   MODEL   required. The Codex model id.
#   TOOLS   optional. base (default) or legal-folds.
#
# SAMPLE SELECTION
#   --all    every sample in the release corpus
#   --easy   every easy-* sample          --mid   every mid-* sample
#   --hard   every hard-* sample
# These are consumed here and never reach codex_fold_loop.py. The last one given wins. With
# none of them, SAMPLES is used: a ten-sample smoke set by default, or whatever you export.
#
# Any of these may be overridden from the environment for a one-off run:
#   SAMPLES MAX_TURNS TIMEOUT REASONING_EFFORT IMAGE_HISTORY CORPUS_DIR ACTION_SPACE
#   FOLD_PYTHON OBS_ECHO
#
# Extra arguments to the run script are forwarded to codex_fold_loop.py after the shared
# flags, and argparse takes the last occurrence, so any of them can be overridden inline:
#   bash CODEX_HARNESS_TESTING/run_luna_low.sh --tools legal-folds
#   bash CODEX_HARNESS_TESTING/run_luna_low_legal.sh --easy
#   MAX_TURNS=120 bash CODEX_HARNESS_TESTING/run_luna_low_legal.sh --all
#
# MAX_TURNS is 80 for BOTH arms. The enumerator arm spends one turn listing and one folding,
# so at a tight budget it would be handicapped rather than measured; a budget generous enough
# for both arms keeps the comparison about the tool. Changing it for one arm only reintroduces
# that confound. See TODO.md.

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(dirname -- "$script_dir")

: "${MODEL:?a run script must set MODEL before sourcing _common.sh}"
: "${TOOLS:=base}"
: "${SAMPLES:=easy-0001 easy-0002 easy-0003 easy-0004 easy-0005 easy-0006 easy-0007 easy-0008 mid-0001 hard-0001}"
: "${MAX_TURNS:=80}"
: "${TIMEOUT:=300}"
: "${REASONING_EFFORT:=low}"
: "${IMAGE_HISTORY:=all}"
: "${CORPUS_DIR:=$repo_dir/workspace/corpus/out/release/all-layers/samples}"

# ACTION SPACE -- follows the corpus, not a preference.
#
# Not one of the 4180 reference folds in release/all-layers is a partial top/bottom run, so
# on that corpus those actions cannot appear in a solution while they multiply the
# enumerator's candidate count by the layer count. Measured on five mid samples: restricting
# to whole-stack folds raises search throughput 1.7-3.5x, lowers the branching factor by
# 0.2-1.3, reaches 1-3 levels deeper, and solves one more sample.
#
# The some-verified-* and some-generated-* corpora are the opposite: about a third of their
# reference folds are partial, and 14% of samples at depth 3 and 34% at depth 6 cannot be
# solved without them. So the default is chosen from CORPUS_DIR rather than fixed, and a run
# on one of those corpora keeps the wide space automatically.
#
# THE SEARCH ARM MUST MATCH. Restricting only the model, or only the search, tells one of
# them something about the solution the other has not been told, and the comparison then
# measures the setting instead of the solver. The deterministic arm takes --selection all.
case "$CORPUS_DIR" in
  *some-*) : "${ACTION_SPACE:=any}" ;;
  *)       : "${ACTION_SPACE:=all-layers}" ;;
esac

# Pull the sample-selection flags out of the forwarded arguments. Rotating the argument list
# one element at a time is the POSIX way to filter "$@" in place: shift the head off, and
# either consume it or push it back on the tail. After $argc turns the kept arguments are back
# in their original order.
sample_filter=
argc=$#
seen=0
while [ "$seen" -lt "$argc" ]; do
  arg=$1
  shift
  seen=$((seen + 1))
  case "$arg" in
    --all|--easy|--mid|--hard) sample_filter=${arg#--} ;;
    *) set -- "$@" "$arg" ;;
  esac
done

if [ -n "$sample_filter" ]; then
  if [ ! -d "$CORPUS_DIR" ]; then
    printf '%s\n' "Corpus not found: $CORPUS_DIR. Set CORPUS_DIR to your samples folder." >&2
    exit 1
  fi
  if [ "$sample_filter" = all ]; then pattern='*'; else pattern="$sample_filter-*"; fi
  # sed rather than -printf or -exec basename: portable to BSD find, and one process.
  SAMPLES=$(find "$CORPUS_DIR" -mindepth 1 -maxdepth 1 -type d -name "$pattern" | sed 's|.*/||' | sort | tr '\n' ' ')
  if [ -z "$SAMPLES" ]; then
    printf '%s\n' "No samples matched '$pattern' in $CORPUS_DIR" >&2
    exit 1
  fi
  printf '%s\n' "--$sample_filter: $(printf '%s\n' $SAMPLES | wc -l | tr -d ' ') samples from $CORPUS_DIR" >&2
fi

fold_python=${FOLD_PYTHON:-"$repo_dir/.venv/bin/python"}
export OBS_ECHO="${OBS_ECHO:-full}"
if [ ! -x "$fold_python" ]; then
  printf '%s\n' "Python environment not found: $fold_python. Set FOLD_PYTHON to your experiment interpreter." >&2
  exit 1
fi
cd "$repo_dir"
# SAMPLES is deliberately unquoted: --samples takes a whitespace-separated list.
exec "$fold_python" "$script_dir/codex_fold_loop.py" \
  --samples $SAMPLES \
  --max-turns "$MAX_TURNS" \
  --timeout "$TIMEOUT" \
  --model "$MODEL" \
  --reasoning-effort "$REASONING_EFFORT" \
  --image-history "$IMAGE_HISTORY" \
  --tools "$TOOLS" \
  --action-space "$ACTION_SPACE" \
  "$@"
