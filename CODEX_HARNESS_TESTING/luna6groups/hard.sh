#!/usr/bin/env bash
# GPT-6 Luna: ten hard samples across the three tool conditions.
set -e
runner_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
export MATCHED_MODEL=gpt-6-luna
export MATCHED_GROUP=hard
exec bash "$runner_dir/run_luna_matched40.sh"
