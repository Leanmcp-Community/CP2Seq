#!/bin/sh
# Deterministic arm, searching many samples at once.
#
# The BFS is pure CPU in node and single-threaded per process, so it parallelises cleanly
# across samples. Replay stays serial because it drives one browser -- and for a sample that
# solves quickly the five PNG captures per fold cost more than the search does, so there is
# little left to win there.
#
# WORKERS defaults to the core count. Going past it does not help: the workers are CPU-bound
# and simply contend. This machine reports its cores via sysctl below.
#
#   bash CODEX_HARNESS_TESTING/run_deterministic_parallel.sh --easy
#   WORKERS=16 SECONDS_PER_SAMPLE=30 bash CODEX_HARNESS_TESTING/run_deterministic_parallel.sh --mid
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
: "${WORKERS:=$(sysctl -n hw.ncpu 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 8)}"
export WORKERS
printf '%s\n' "searching with $WORKERS workers (cores: $(sysctl -n hw.ncpu 2>/dev/null || echo '?'))" >&2
exec sh "$script_dir/run_deterministic.sh" "$@" --workers "$WORKERS"
