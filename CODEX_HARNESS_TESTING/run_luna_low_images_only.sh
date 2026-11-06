#!/bin/sh
# Images-only: basic tools, every coordinate removed from prompts and tool results; the
# model sees rendered images plus the current stack's bounding box. Compare with
# run_luna_low.sh (images + coordinates) and the text-only runs (coordinates, no images).
set -eu
MODEL=gpt-5.6-luna
TOOLS=base
set -- --geometry images-only "$@"
. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/_common.sh"
