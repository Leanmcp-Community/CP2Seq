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
# Any of these may be overridden from the environment for a one-off run:
#   SAMPLES MAX_TURNS TIMEOUT REASONING_EFFORT IMAGE_HISTORY FOLD_PYTHON OBS_ECHO
#
# Extra arguments to the run script are forwarded to codex_fold_loop.py after the shared
# flags, and argparse takes the last occurrence, so any of them can be overridden inline:
#   bash CODEX_HARNESS_TESTING/run_luna_low.sh --tools legal-folds --max-turns 40
#   MAX_TURNS=40 bash CODEX_HARNESS_TESTING/run_luna_low_legal.sh
#
# The enumerator arm spends one turn listing and one turn folding, so it needs a larger turn
# budget than the baseline to reach the same number of folds. Raising MAX_TURNS for one arm
# only is itself a confound: decide it deliberately and record it. See TODO.md.

: "${MODEL:?a run script must set MODEL before sourcing _common.sh}"
: "${TOOLS:=base}"
: "${SAMPLES:=easy-0001 easy-0002 easy-0003 easy-0004 easy-0005 easy-0006 easy-0007 easy-0008 mid-0001 hard-0001}"
: "${MAX_TURNS:=20}"
: "${TIMEOUT:=300}"
: "${REASONING_EFFORT:=low}"
: "${IMAGE_HISTORY:=all}"

common_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(dirname -- "$common_dir")
fold_python=${FOLD_PYTHON:-"$repo_dir/.venv/bin/python"}
export OBS_ECHO="${OBS_ECHO:-full}"
if [ ! -x "$fold_python" ]; then
  printf '%s\n' "Python environment not found: $fold_python. Set FOLD_PYTHON to your experiment interpreter." >&2
  exit 1
fi
cd "$repo_dir"
# SAMPLES is deliberately unquoted: --samples takes a whitespace-separated list.
exec "$fold_python" "$common_dir/codex_fold_loop.py" \
  --samples $SAMPLES \
  --max-turns "$MAX_TURNS" \
  --timeout "$TIMEOUT" \
  --model "$MODEL" \
  --reasoning-effort "$REASONING_EFFORT" \
  --image-history "$IMAGE_HISTORY" \
  --tools "$TOOLS" \
  "$@"
