#!/bin/sh
# Legal-fold-enumeration arm. Run from any directory; uses the existing experiment environment and CLI login.
# Every shared flag lives in _common.sh so the two arms cannot drift apart.
set -eu
MODEL=gpt-5.6-terra
TOOLS=legal-folds
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/_common.sh"
