#!/bin/sh
# L+A plus ORACLE STOP: legal-fold enumeration, automatic tier-3 target comparison, and the
# program (not the model) decides success. After every accepted move the state is checked
# with CP match + E_id, and the first match ends the episode as solved. This gives the model
# the same automatic goal test the random-legal and BFS baselines get.
set -eu
MODEL=gpt-5.6-luna
TOOLS=legal-folds
set -- --compare-tier "${COMPARE_TIER:-3}" --compare-auto --oracle-stop "$@"
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/_common.sh"
