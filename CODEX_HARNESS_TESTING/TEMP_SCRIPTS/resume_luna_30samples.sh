#!/bin/sh
# Continuation of run_luna_30samples.sh: the remaining samples after mid-0008,
# which was the last one to finish before the batch was cancelled.
set -eu
cd /Users/luxian/FoldOriganmi/CODEX_HARNESS_TESTING

bash run_luna_low_legal_autocompare.sh --samples \
mid-0009 mid-0010 \
hard-0001 hard-0002 hard-0003 hard-0004 hard-0005 hard-0006 hard-0007 hard-0008 hard-0009 hard-0010
