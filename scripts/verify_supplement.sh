#!/usr/bin/env bash
# User-run checks only. No model calls or dependency installation.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
command -v uv >/dev/null || { echo 'uv is required. Complete README setup first.' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node.js is required for simulator checks.' >&2; exit 1; }
[[ -f uv.lock ]] || { echo 'Run uv sync first to create uv.lock.' >&2; exit 1; }
out="reproduced/check-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$out"
exec > >(tee "$out/verification.log") 2>&1
trap 'echo "FAILED at line $LINENO. See $out/verification.log"' ERR
uv run --locked python scripts/verify_manifest.py
uv --version
node --version
uv run --locked python --version
uv pip freeze --python .venv/bin/python > "$out/python-packages.txt"
cp uv.lock "$out/uv.lock"

node --test DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/test_partial_folds.mjs \
  DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/test_terminal_match.mjs \
  DHEERAJ_WORKSPACE/viewer/test_verification_cases.mjs \
  DHEERAJ_WORKSPACE/viewer/test_verified_motion.mjs
uv run --locked python -m unittest discover \
  -s DHEERAJ_WORKSPACE/EXPERIMENT_SETUP -p 'test_*.py' -v

# Corpus check programs write reports inside their input directory, so use a copy
# and preserve the packaged files and hashes. This needs about 40 MB extra space.
cp -R workspace/corpus/out/release "$out/corpus"
node workspace/corpus/verify-replay.mjs "$out/corpus"
node workspace/corpus/verify-state.mjs "$out/corpus"
node workspace/corpus/verify-state.mjs "$out/corpus" --mutate --out "$out/mutation-check.json"
node workspace/search_baseline_stateful.mjs --seconds 1 --max-states 1000 --selection all easy-0001

if [[ -d CODEX_HARNESS_TESTING/runs ]]; then
  node workspace/report_run_inventory.mjs --runs CODEX_HARNESS_TESTING/runs --out "$out/run-inventory"
  node workspace/score_cp_distance.mjs --runs CODEX_HARNESS_TESTING/runs --out "$out/cp-distance"
  uv run --locked python workspace/aggregate_results.py \
    --runs CODEX_HARNESS_TESTING/runs --out "$out/results"
  echo 'Saved-run summaries regenerated. Review cohorts, missing attempts and unscored states before comparing paper numbers.'
else
  echo 'No-runs package: saved-run reanalysis skipped; included summary files remain available.'
fi
echo "Checks completed. Outputs: $out"
echo 'This validates the selected software/data checks; exact paper-table reproduction still requires cohort reconciliation.'
