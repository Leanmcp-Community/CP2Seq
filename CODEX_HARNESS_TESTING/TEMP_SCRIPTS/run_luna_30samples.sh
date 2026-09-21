#!/bin/sh
# 10 easy + 10 mid + 10 hard samples through the legal-fold autocompare arm (luna, low effort).
set -eu
cd /Users/luxian/FoldOriganmi/CODEX_HARNESS_TESTING

bash run_luna_low_legal_autocompare.sh --samples \
easy-0001 easy-0002 easy-0003 easy-0004 easy-0005 easy-0006 easy-0007 easy-0008 easy-0009 easy-0010 \
mid-0001 mid-0002 mid-0003 mid-0004 mid-0005 mid-0006 mid-0007 mid-0008 mid-0009 mid-0010 \
hard-0001 hard-0002 hard-0003 hard-0004 hard-0005 hard-0006 hard-0007 hard-0008 hard-0009 hard-0010
