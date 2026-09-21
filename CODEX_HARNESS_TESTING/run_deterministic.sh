#!/bin/sh
# Deterministic search arm. BFS over the same enumerated folds the models are offered, then
# the winning sequence replayed through the real add_fold so the episode lands in the viewer
# next to the model runs.
#
# No model, no quota, no randomness: the same command gives the same answer every time. This
# is the control every model arm should be reported against.
#
#   bash CODEX_HARNESS_TESTING/run_deterministic.sh --easy
#   SECONDS_PER_SAMPLE=120 bash CODEX_HARNESS_TESTING/run_deterministic.sh --samples easy-0001
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(dirname -- "$script_dir")
fold_python=${FOLD_PYTHON:-"$repo_dir/.venv/bin/python"}
: "${SAMPLES:=easy-0001 easy-0002 easy-0003 easy-0004 easy-0005 easy-0006 easy-0007 easy-0008}"
: "${SECONDS_PER_SAMPLE:=60}"
: "${CORPUS_DIR:=$repo_dir/workspace/corpus/out/release/all-layers/samples}"
if [ ! -x "$fold_python" ]; then
  printf '%s\n' "Python environment not found: $fold_python. Set FOLD_PYTHON." >&2
  exit 1
fi

sample_filter=
argc=$#
seen=0
while [ "$seen" -lt "$argc" ]; do
  arg=$1; shift; seen=$((seen + 1))
  case "$arg" in
    --all|--easy|--mid|--hard) sample_filter=${arg#--} ;;
    *) set -- "$@" "$arg" ;;
  esac
done
if [ -n "$sample_filter" ]; then
  if [ "$sample_filter" = all ]; then pattern='*'; else pattern="$sample_filter-*"; fi
  SAMPLES=$(find "$CORPUS_DIR" -mindepth 1 -maxdepth 1 -type d -name "$pattern" | sed 's|.*/||' | sort | tr '\n' ' ')
  [ -n "$SAMPLES" ] || { printf '%s\n' "No samples matched '$pattern'" >&2; exit 1; }
  printf '%s\n' "--$sample_filter: $(printf '%s\n' $SAMPLES | wc -l | tr -d ' ') samples" >&2
fi

cd "$repo_dir"
# SAMPLES is deliberately unquoted: --samples takes a whitespace-separated list.
exec "$fold_python" "$script_dir/deterministic_fold_loop.py" \
  --samples $SAMPLES \
  --seconds "$SECONDS_PER_SAMPLE" \
  "$@"
