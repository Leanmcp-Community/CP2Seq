#!/bin/sh
# Basic tools PLUS automatic target comparison, WITHOUT legal-fold enumeration (B+A).
# Completes the 2x2 of {legal enumeration} x {target feedback}: the existing arms are
# B (run_luna_low.sh), L (run_luna_low_legal.sh) and L+A (run_luna_low_legal_autocompare.sh).
set -eu
MODEL=gpt-5.6-luna
TOOLS=base
set -- --compare-tier "${COMPARE_TIER:-3}" --compare-auto "$@"
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/_common.sh"
