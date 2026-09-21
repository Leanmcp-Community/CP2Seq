#!/usr/bin/env bash
# Wait for the model batch that is currently running, then start the mid experiment.
#
# The mid experiment reports time-to-solve, so it cannot share the machine with a live
# codex_fold_loop batch without measuring the contention instead. This blocks until nothing
# that spends wall clock is running, then hands over.
#
# It polls rather than waiting on a PID, so it does not care which process started first or
# whether the batch is restarted in between.
#
#   bash workspace/run_when_idle.sh
#   SECONDS_BUDGET=1800 bash workspace/run_when_idle.sh
#   TARGET="bash workspace/compare_action_space.sh" bash workspace/run_when_idle.sh
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="${TARGET:-bash workspace/mid_all_layers_experiment.sh}"
BUSY='profile_enum_cost|search_baseline|codex_fold_loop'
POLL="${POLL:-60}"

if pgrep -f "$BUSY" > /dev/null; then
  echo "waiting for:"
  pgrep -fl "$BUSY" | cut -c1-100 | sed 's/^/  /'
  echo
  started=$(date +%s)
  while pgrep -f "$BUSY" > /dev/null; do
    sleep "$POLL"
    mins=$(( ($(date +%s) - started) / 60 ))
    # One line every ten minutes, so a long wait leaves a trace without flooding the log.
    [ $(( mins % 10 )) -eq 0 ] && [ "$mins" -gt 0 ] && echo "  still waiting, ${mins} min" || true
  done
  echo "machine idle after $(( ($(date +%s) - started) / 60 )) min"
  # The batch's last sample may still be flushing artifacts.
  sleep 10
else
  echo "machine already idle"
fi

echo
echo "starting: $TARGET"
echo
exec $TARGET
