#!/bin/sh
# One preselected medium sample; same protocol as the paired Sol pilot.
set -eu
MODEL=gpt-6-astra
TOOLS=legal-folds
SAMPLES=${SAMPLES:-mid-0001}
REASONING_EFFORT=low
IMAGE_HISTORY=all
set -- --action-space all-layers --compare-tier 3 --compare-auto \
  --conversation-mode append-only --conversation-transport resume "$@"
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/_common.sh"
