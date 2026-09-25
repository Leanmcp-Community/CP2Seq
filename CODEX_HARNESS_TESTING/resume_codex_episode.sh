#!/usr/bin/env bash
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ $# != 1 ]]; then
  echo "Usage: bash $0 CODEX_HARNESS_TESTING/runs/codex-TIMESTAMP/easy-0003" >&2
  exit 2
fi
exec "${FOLD_PYTHON:-$script_dir/../.venv/bin/python}" "$script_dir/resume_codex_episode.py" "$1"
