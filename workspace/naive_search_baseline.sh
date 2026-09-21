#!/bin/sh
# What does a dumb complete search get, on the same samples the models are being scored on?
#
#   sh workspace/naive_search_baseline.sh easy-0001 easy-0002 easy-0003
#   sh workspace/naive_search_baseline.sh $(sh workspace/pending_samples.sh easy | head -c 400)
#
# WHY THIS MATTERS MORE THAN ANOTHER MODEL RUN
# list_legal_folds evaluates thousands of candidate actions per state and returns about three
# that are legal AND stay inside the target CP -- measured mean 3.2 over 17180 enumerated
# states. That is a roughly thousand-fold prune, performed by the simulator, not by the model.
# Once the branching factor is 3, an easy sample of five folds is a tree of ~3.2^5, a few
# hundred states, each testable in milliseconds.
#
# So the honest question for the paper is not "can the model do it" but "how much is left for
# the model to do". If exhaustive search over the same enumerated actions solves the easy tier
# outright, then the enumerator arm's 21-26 percent is not a measure of origami reasoning; it
# is a measure of a model failing at a search its own tool already made trivial. That has to be
# known before any of these numbers are reported, and it costs no quota to find out.
#
# CAVEAT: baseline_python/model.py has its own action space -- unions of same-side hinge
# components -- which is broader than the JS engine's contiguous top/bottom runs. So this is
# "a naive search over a comparable action space", not over byte-identical actions. Read it as
# an order-of-magnitude answer, not a like-for-like arm.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/.."

corpus=${CORPUS_DIR:-workspace/corpus/out/release/all-layers/samples}
python=${FOLD_PYTHON:-.venv/bin/python}
seconds=${SECONDS_PER_SAMPLE:-60}
[ $# -gt 0 ] || { printf '%s\n' "usage: $0 <sample-id> [sample-id ...]" >&2; exit 2; }

solved=0; total=0
for s in "$@"; do
  cp="$corpus/$s/cp.fold"
  steps="$corpus/$s/steps.fold"
  [ -f "$cp" ] && [ -f "$steps" ] || { printf '  %-10s no such sample\n' "$s"; continue; }
  total=$((total + 1))
  # The target is the last frame of steps.fold; run.py wants it as its own file.
  target=$(mktemp -t foldtarget).json
  "$python" - "$steps" "$target" <<'PY'
import json, sys
frames = json.load(open(sys.argv[1]))["file_frames"]
json.dump(frames[-1], open(sys.argv[2], "w"))
PY
  out=$(cd DHEERAJ_WORKSPACE/baseline_python && "../../$python" run.py solve \
          --cp "../../$cp" --target "$target" --algorithm bfs \
          --seconds "$seconds" 2>&1 | tail -40)
  rm -f "$target"
  status=$(printf '%s' "$out" | grep -o '"status": "[a-z_]*"' | head -1 | sed 's/.*: "//;s/"//')
  nodes=$(printf '%s' "$out" | grep -o '"expanded": [0-9]*' | head -1 | sed 's/.*: //')
  secs=$(printf '%s' "$out" | grep -o '"elapsed_seconds": [0-9.]*' | head -1 | sed 's/.*: //' | cut -c1-5)
  [ "$status" = "solved" ] && solved=$((solved + 1))
  printf '  %-10s %-12s expanded=%-8s %ss\n' "$s" "${status:-error}" "${nodes:-?}" "${secs:-?}"
done
printf '\nnaive BFS solved %s of %s\n' "$solved" "$total" >&2
