#!/bin/sh
# Legal-fold enumeration PLUS terminal-state comparison. A third arm: same prompt, same tools,
# same stop conditions as run_sol_low_legal.sh, with compare_to_target added.
#
# COMPARE_TIER picks how much of the reasoning the tool does (1 counts, 2 which layers disagree
# and how, 3 what each should be). Default 3, the most detailed: it names what each differing
# layer should be, so it does most of the reasoning. Say so when reporting its numbers. Drop to
# COMPARE_TIER=2 or 1 for the conditions that only locate the disagreement.
#
#   COMPARE_TIER=1 bash CODEX_HARNESS_TESTING/run_sol_low_legal_compare.sh --easy
set -eu
MODEL=gpt-5.6-sol
TOOLS=legal-folds
set -- --compare-tier "${COMPARE_TIER:-3}" "$@"
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/_common.sh"
