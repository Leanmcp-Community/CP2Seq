#!/bin/sh
# Legal-fold enumeration PLUS terminal-state comparison. A third arm: same prompt, same tools,
# same stop conditions as run_luna_low_legal.sh, with compare_to_target added.
#
# COMPARE_TIER picks how much of the reasoning the tool does (1 counts, 2 which layers disagree
# and how, 3 what each should be). Default 2. Tier 3 does most of the work, so say so when its
# numbers are reported.
#
#   COMPARE_TIER=1 bash CODEX_HARNESS_TESTING/run_luna_low_legal_compare.sh --easy
set -eu
MODEL=gpt-5.6-luna
TOOLS=legal-folds
set -- --compare-tier "${COMPARE_TIER:-2}" "$@"
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/_common.sh"
