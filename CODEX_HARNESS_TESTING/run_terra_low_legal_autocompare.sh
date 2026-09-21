#!/bin/sh
# Legal-fold enumeration PLUS a target comparison attached to every accepted fold.
#
# A fourth arm. The tier-3 arm gave the model compare_to_target and it barely used it:
# easy-0094 spent 73 turns and 49 folds calling it once, easy-0097 never called it at all.
# Here the comparison arrives unasked in every add_fold result, costing no turn -- the same
# change that took easy-0003 from 80 turns unsolved to 19 turns solved when it was applied to
# the fold enumeration.
#
# COMPARE_TIER sets the detail (1 counts, 2 which layers disagree, 3 what each should be).
set -eu
MODEL=gpt-5.6-terra
TOOLS=legal-folds
set -- --compare-tier "${COMPARE_TIER:-3}" --compare-auto "$@"
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/_common.sh"
