#!/bin/sh
# Claude arm, L+A condition: legal-fold enumeration plus automatic tier-3 target comparison,
# the same condition as run_luna_low_legal_autocompare.sh on the Codex side.
# Runs on the claude.ai login through `claude -p` (claude_fold_loop.py strips API keys).
#
#   CLAUDE_MODEL=claude-sonnet-5-5 sh CODEX_HARNESS_TESTING/run_claude_low_legal_autocompare.sh ...
set -eu
MODEL=${CLAUDE_MODEL:?set CLAUDE_MODEL to a pinned Claude model id, e.g. claude-sonnet-5-5}
set -- --compare-tier "${COMPARE_TIER:-3}" --compare-auto "$@"
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/_claude_common.sh"
