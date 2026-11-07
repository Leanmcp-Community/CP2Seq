#!/usr/bin/env bash
# Resume of the sonnet10 pilot: layers-0001..0005 only (easy-0001..0005 are done).
# Run claude-20261107T190225893933Z stopped at layers-0001 turn 15 on the 5-hour quota limit;
# layers-0001 is rerun from scratch here. Same settings as 8_generality.sh (L+A, text only,
# low effort, 80 turns, 300 s timeout, some-generated-d5 corpus, action space "any").
# Kept as a separate file so 8_generality.sh is not edited while luna-pass5 is running from it.
#
#   bash scripts/rebuttal/8b_sonnet_layers_resume.sh                                  # dry run
#   caffeinate -i env EXECUTE=1 bash scripts/rebuttal/8b_sonnet_layers_resume.sh      # run
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
some=$repo/workspace/corpus/out/release/some-generated-d5/samples
cmd=(env REASONING_EFFORT=low EFFORT=low MAX_TURNS=80 TIMEOUT=300 IMAGE_HISTORY=none
     CLAUDE_MODEL=claude-sonnet-5-5
     SAMPLES="layers-0001 layers-0002 layers-0003 layers-0004 layers-0005"
     sh CODEX_HARNESS_TESTING/run_claude_low_legal_autocompare.sh --corpus "$some" --action-space any)
echo "${cmd[*]}"
[[ "${EXECUTE:-0}" == 1 ]] && "${cmd[@]}"
exit 0
