#!/bin/sh
# Claude arm, claude-fable-5-1, legal-fold enumeration condition.
# Every shared flag lives in _claude_common.sh so the model scripts cannot drift apart.
set -eu
MODEL=claude-fable-5-1
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/_claude_common.sh"
