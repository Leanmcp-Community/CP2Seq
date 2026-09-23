#!/usr/bin/env bash
# Three existing runners, each on the same 40 samples. No new evaluation implementation.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
all_corpus="$repo_dir/workspace/corpus/out/release/all-layers/samples"
some_corpus="${SOME_CORPUS:-$repo_dir/workspace/corpus/out/release/some-generated-d5/samples}"
export REASONING_EFFORT=low
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
for runner in run_luna_low.sh run_luna_low_legal.sh run_luna_low_legal_autocompare.sh; do
  echo "Running $runner: 30 all-layers, then 10 some-layers samples"
  SAMPLES="${all_samples[*]}" bash "CODEX_HARNESS_TESTING/$runner" \
    --corpus "$all_corpus" --action-space all-layers
  SAMPLES="${some_samples[*]}" bash "CODEX_HARNESS_TESTING/$runner" \
    --corpus "$some_corpus" --action-space any
done
