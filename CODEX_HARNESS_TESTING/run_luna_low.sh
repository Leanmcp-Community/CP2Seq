#!/bin/sh
# Run from any directory. Uses the existing experiment environment and CLI login.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(dirname -- "$script_dir")
fold_python=${FOLD_PYTHON:-"$repo_dir/.venv/bin/python"}
export OBS_ECHO="${OBS_ECHO:-preview}"
if [ ! -x "$fold_python" ]; then
  printf '%s\n' "Python environment not found: $fold_python. Set FOLD_PYTHON to your experiment interpreter." >&2
  exit 1
fi
cd "$repo_dir"
exec "$fold_python" "$script_dir/codex_fold_loop.py" \
  --samples easy-0001 easy-0002 \
  --max-turns 40 \
  --timeout 300 \
  --model gpt-5.6-luna \
  --reasoning-effort low \
  --image-history all \
  "$@"
