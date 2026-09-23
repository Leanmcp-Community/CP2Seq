#!/usr/bin/env bash
# Ten medium samples, all three conditions; completed attempts are skipped.
set -e
runner_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
export MATCHED_GROUP=mid
exec bash "$runner_dir/run_luna_matched40.sh"
