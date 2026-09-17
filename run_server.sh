#!/usr/bin/env bash
# Start the local origami viewer. Forward --port / --exports to the backend.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to run the viewer server." >&2
  exit 1
fi

# Preserve the caller's working directory for relative --exports paths.
exec python3 "$script_dir/DHEERAJ_WORKSPACE/viewer/server.py" "$@"
