#!/bin/sh
# Deterministic arm, searching many samples at once.
#
# The BFS is pure CPU in node and single-threaded per process, so it parallelises cleanly
# across samples. Replay stays serial because it drives one browser -- and for a sample that
# solves quickly the five PNG captures per fold cost more than the search does, so there is
# little left to win there.
#
# WORKERS defaults to 8, the core count. The searcher's timeout is WALL clock, so oversubscribing
# does not just fail to add throughput: with 32 workers on 8 cores each search gets a quarter
# of a core and explores a quarter as many nodes inside the same budget. Keep it near the cores.
#
#   bash CODEX_HARNESS_TESTING/run_deterministic_parallel.sh --easy
#   WORKERS=16 SECONDS_PER_SAMPLE=30 bash CODEX_HARNESS_TESTING/run_deterministic_parallel.sh --mid
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
: "${WORKERS:=8}"
export WORKERS
printf '%s\n' "searching with $WORKERS workers (cores: $(sysctl -n hw.ncpu 2>/dev/null || echo '?'))" >&2
exec sh "$script_dir/run_deterministic.sh" "$@" --workers "$WORKERS" --deadline-minutes "${DEADLINE_MINUTES:-0}"
