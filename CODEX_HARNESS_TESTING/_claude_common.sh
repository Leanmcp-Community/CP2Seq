# Shared body of the Claude-arm run scripts. Sourced by run_<model>_<effort>_legal.sh,
# never run directly.
#
# The Claude arm exists to be compared with the Codex enumerator arm, so it always runs the
# legal-folds condition and shares that arm's prompt, action schema, tool set and stop
# conditions. There is no baseline Claude script on purpose.
#
# A run script sets, before sourcing:
#   MODEL   required. A pinned Claude model id.
#
# Overridable from the environment:
#   SAMPLES MAX_TURNS EFFORT TIMEOUT IMAGE_HISTORY CORPUS_DIR FOLD_PYTHON OBS_ECHO
#
# Sample selection flags --all / --easy / --mid / --hard work exactly as on the Codex side.
#
# MODELS ARE PINNED, NOT ALIASED. The CLI accepts 'opus' and 'sonnet', but an alias follows
# whatever is newest, so two runs a month apart would silently compare different models. A
# benchmark needs the exact id.

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(dirname -- "$script_dir")

: "${MODEL:?a run script must set MODEL before sourcing _claude_common.sh}"
: "${SAMPLES:=easy-0001 easy-0002 easy-0003 easy-0004 easy-0005 easy-0006 easy-0007 easy-0008 mid-0001 hard-0001}"
: "${MAX_TURNS:=80}"
: "${EFFORT:=low}"
: "${TIMEOUT:=300}"
: "${IMAGE_HISTORY:=all}"
: "${CORPUS_DIR:=$repo_dir/workspace/corpus/out/release/all-layers/samples}"

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
exec "$fold_python" "$script_dir/claude_fold_loop.py" \
  --samples $SAMPLES \
  --max-turns "$MAX_TURNS" \
  --timeout "$TIMEOUT" \
  --model "$MODEL" \
  --reasoning-effort "$EFFORT" \
  --image-history "$IMAGE_HISTORY" \
  --tools legal-folds \
  "$@"
