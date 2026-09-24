#!/usr/bin/env bash
# Three existing runners, each on the same 40 samples. No new evaluation implementation.
# macOS Bash 3 treats empty arrays as unset with nounset; empty pending lists are valid.
set -eo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
matched_model=${MATCHED_MODEL:-gpt-5.6-luna}
all_corpus="$repo_dir/workspace/corpus/out/release/all-layers/samples"
some_corpus="${SOME_CORPUS:-$repo_dir/workspace/corpus/out/release/some-generated-d5/samples}"
export REASONING_EFFORT=${MATCHED_EFFORT:-low}
export MAX_TURNS="${MAX_TURNS:-80}"
export TIMEOUT="${TIMEOUT:-300}"
export COMPARE_TIER="${COMPARE_TIER:-3}"
all_samples=()
some_samples=()
for tier in easy mid hard; do
  for ((i=1;i<=10;i++)); do
    printf -v sample '%s-%04d' "$tier" "$i"
    all_samples+=("$sample")
  done
done
for ((i=1;i<=10;i++)); do
  printf -v sample 'layers-%04d' "$i"
  some_samples+=("$sample")
done
# Check the entire sample selection before launching any paid run.
for sample in "${all_samples[@]}"; do
  for artifact in cp.fold seq.json steps.fold; do
    [[ -f "$all_corpus/$sample/$artifact" ]] || { echo "Missing $all_corpus/$sample/$artifact" >&2; exit 1; }
  done
done
for sample in "${some_samples[@]}"; do
  for artifact in cp.fold seq.json steps.fold; do
    [[ -f "$some_corpus/$sample/$artifact" ]] || { echo "Missing $some_corpus/$sample/$artifact" >&2; exit 1; }
  done
done
command -v jq >/dev/null || { echo 'jq is required for resume checks.' >&2; exit 1; }
export IMAGE_HISTORY="${IMAGE_HISTORY:-all}"
runs="$repo_dir/CODEX_HARNESS_TESTING/runs"
control="$repo_dir/CODEX_HARNESS_TESTING/matched40-state"
mkdir -p "$control"
# Atomic lock prevents two copies of this wrapper from launching duplicate work.
if [[ -z "${MATCHED_GROUP:-}" ]]; then
if ! mkdir "$control/lock" 2>/dev/null; then
  echo "Another wrapper may be running. Lock: $control/lock" >&2
  echo 'If it was killed, stop any surviving workers before removing this lock directory.' >&2
  exit 1
fi
echo "$$" > "$control/lock/pid"
pids=()
cleanup() { rmdir "$control/lock" 2>/dev/null || { rm -f "$control/lock/pid"; rmdir "$control/lock"; }; }
interrupt() {
  # Keep the lock: grandchildren may still be finishing after an interrupt.
  echo "Interrupted. Stop remaining harness workers before removing $control/lock" >&2
  trap - EXIT
  exit 130
}
trap cleanup EXIT
trap interrupt INT TERM
else
  # Foreground mode: terminal Ctrl-C reaches the harness and its subprocesses.
  # Exit after interruption rather than moving on to the next condition.
  trap 'exit 130' INT
  trap 'exit 143' TERM
fi

run_group() {
  local runner=$1 corpus=$2 action=$3 tools=$4 tier=$5 auto=$6
  shift 6
  local config sample result found
  local pending=() configs=()
  # Read old runs too, including attempts completed by the original sequential wrapper.
  for config in "$runs"/codex-*/config.json; do
    [[ -f "$config" ]] || continue
    if jq -e --arg model "$matched_model" --arg effort "$REASONING_EFFORT" --arg corpus "$corpus" --arg action "$action" --arg tools "$tools" \
      --argjson tier "$tier" --argjson auto "$auto" \
      --argjson turns "$MAX_TURNS" --argjson timeout "$TIMEOUT" --arg history "$IMAGE_HISTORY" '
      .model == $model and .reasoning_effort == $effort and
      .corpus == $corpus and .action_space == $action and .tools == $tools and
      (.compare_tier // 0) == $tier and (.compare_auto // false) == $auto and
      .max_turns == $turns and .timeout == $timeout and .image_history == $history and
      .cycle_limit == 3 and .revisit_limit == 15 and .stuck_limit == 5
      ' "$config" >/dev/null; then configs+=("$config"); fi
  done
  for sample in "$@"; do
    # Space-separated sample IDs; exclusions apply to every tool condition.
    case " ${SKIP_SAMPLES:-} " in
      *" $sample "*) echo "SKIP $runner $sample (explicit exclusion)"; continue ;;
    esac
    found=false
    for config in "${configs[@]}"; do
      result="${config%/config.json}/$sample/result.json"
      # Both solved=true and solved=false are completed. Only missing/error attempts retry.
      if [[ -f "$result" ]] && jq -e --arg sample "$sample" '
        .sample_id == $sample and (.solved | type == "boolean") and
        (.termination | IN("finished", "turn_budget", "repetition_detected", "state_cycling", "backtrack_exhausted", "dead_end_no_recovery"))
        ' "$result" >/dev/null; then found=true; break; fi
    done
    if "$found"; then echo "SKIP $runner $sample (completed)"; else pending+=("$sample"); fi
  done
  if [[ ${#pending[@]} -eq 0 ]]; then return 0; fi
  echo "RUN $runner ${pending[*]}"
  SAMPLES="${pending[*]}" TOOLS="$tools" bash "CODEX_HARNESS_TESTING/$runner" \
    --corpus "$corpus" --action-space "$action" --model "$matched_model"
}
if [[ -n "${MATCHED_GROUP:-}" ]]; then
  selected=()
  case "$MATCHED_GROUP" in
    easy|mid|hard)
      for sample in "${all_samples[@]}"; do
        [[ "$sample" != "$MATCHED_GROUP"-* ]] || selected+=("$sample")
      done
      corpus=$all_corpus; action=all-layers ;;
    some) selected=("${some_samples[@]}"); corpus=$some_corpus; action=any ;;
    *) echo 'MATCHED_GROUP must be easy, mid, hard, or some.' >&2; exit 1 ;;
  esac
  export PYTHONUNBUFFERED=1
  echo "Model: $matched_model. Effort: $REASONING_EFFORT. Foreground group: $MATCHED_GROUP. Ctrl-C stops this terminal's run."
  for arm in basic legal autocompare; do
    case "$arm" in
      basic) runner=run_luna_low.sh; tools=base; tier=0; auto=false ;;
      legal) runner=run_luna_low_legal.sh; tools=legal-folds; tier=0; auto=false ;;
      autocompare) runner=run_luna_low_legal_autocompare.sh; tools=legal-folds; tier=$COMPARE_TIER; auto=true ;;
    esac
    run_group "$runner" "$corpus" "$action" "$tools" "$tier" "$auto" "${selected[@]}"
    if [[ "$arm" != autocompare ]]; then sleep 2; fi
  done
  exit 0
fi

run_arm() {
  local runner=$1 tools=$2 tier=$3 auto=$4
  run_group "$runner" "$all_corpus" all-layers "$tools" "$tier" "$auto" "${all_samples[@]}" || return $?
  run_group "$runner" "$some_corpus" any "$tools" "$tier" "$auto" "${some_samples[@]}"
}
parallel=${PARALLEL:-3}
[[ "$parallel" == 1 || "$parallel" == 3 ]] || { echo 'PARALLEL must be 1 or 3.' >&2; exit 1; }
stamp="$(date +%Y%m%dT%H%M%S)-$$"
for arm in basic legal autocompare; do
  case "$arm" in
    basic) runner=run_luna_low.sh; tools=base; tier=0; auto=false ;;
    legal) runner=run_luna_low_legal.sh; tools=legal-folds; tier=0; auto=false ;;
    autocompare) runner=run_luna_low_legal_autocompare.sh; tools=legal-folds; tier=$COMPARE_TIER; auto=true ;;
  esac
  log="$control/$stamp-$arm.log"
  echo "$arm log: $log"
  if [[ "$parallel" == 3 ]]; then
    run_arm "$runner" "$tools" "$tier" "$auto" >"$log" 2>&1 &
    pids+=("$!")
    # Stagger starts; arm names and invocation IDs already keep log files separate.
    if [[ "$arm" != autocompare ]]; then sleep 2; fi
  else
    run_arm "$runner" "$tools" "$tier" "$auto" >"$log" 2>&1
  fi
done
status=0
for pid in "${pids[@]}"; do wait "$pid" || status=1; done
exit "$status"
