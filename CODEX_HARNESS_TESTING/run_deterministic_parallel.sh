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
# Defaults are tuned for the full easy tier in half an hour: 120s of search per sample, 8
# workers, and a 30 minute deadline after which no new sample is started. The deadline can
# overshoot by up to one --seconds, because searches already running are allowed to finish
# rather than be thrown away part-completed.
#
#   bash CODEX_HARNESS_TESTING/run_deterministic_parallel.sh --easy
#   SECONDS_PER_SAMPLE=30 DEADLINE_MINUTES=10 bash CODEX_HARNESS_TESTING/run_deterministic_parallel.sh --mid
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
: "${WORKERS:=8}"
# 120s per sample with a 30 minute cap fits the full 200-sample easy tier: roughly half the
# samples solve in seconds and the rest exhaust their budget, so the wall time is about
# (timeouts x seconds / workers) plus the serial replay, which overlaps the search pool.
: "${SECONDS_PER_SAMPLE:=120}"
: "${DEADLINE_MINUTES:=30}"
export SECONDS_PER_SAMPLE DEADLINE_MINUTES
export WORKERS
printf '%s\n' "searching with $WORKERS workers (cores: $(sysctl -n hw.ncpu 2>/dev/null || echo '?'))" >&2
printf '%s\n' "budget ${SECONDS_PER_SAMPLE}s per sample, deadline ${DEADLINE_MINUTES} min" >&2
exec sh "$script_dir/run_deterministic.sh" "$@" --workers "$WORKERS" --deadline-minutes "$DEADLINE_MINUTES"
