#!/usr/bin/env bash
# Ten some-layers samples, all three conditions; completed attempts are skipped.
set -e
runner_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
export MATCHED_GROUP=some
exec bash "$runner_dir/run_luna_matched40.sh"
