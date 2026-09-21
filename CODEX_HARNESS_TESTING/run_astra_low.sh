#!/bin/sh
# Baseline arm. Run from any directory; uses the existing experiment environment and CLI login.
# Every shared flag lives in _common.sh so the two arms cannot drift apart.
set -eu
MODEL=gpt-6-astra
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/_common.sh"
