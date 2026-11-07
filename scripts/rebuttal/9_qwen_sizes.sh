#!/usr/bin/env bash
# H3 size contrast: Qwen at several sizes, same instances and condition as 8_generality.sh
# (L+A, text only, 80 turns, 300 s timeout; easy-0001..0010 all-layers + layers-0001..0010 any).
#
# STEP 0 (once): put a key in .env, e.g.  OPENROUTER_API_KEY=...   (never commit .env)
# FIREWORKS instead of OpenRouter (official price $0.22 in / $0.11 cached / $0.88 out per 1M,
# checked 2026-11-07): FIREWORKS_API_KEY=... in .env, then prefix every command below with
#   QWEN_BASE_URL=https://api.fireworks.ai/inference/v1 MODELS=accounts/fireworks/models/qwen3-235b-a22b-thinking-2507
# STEP 1 smoke test, 1 instance x 3 turns on the smallest model, to check the endpoint accepts
#        the json_schema response format and that cost per turn is sane:
#   SMOKE=1 EXECUTE=1 bash scripts/rebuttal/9_qwen_sizes.sh
#   -> look at CODEX_HARNESS_TESTING/runs/qwen-*/easy-0001/turn-00*/process.json (total_cost_usd)
#   If it fails with a response_format error, rerun with JSON_MODE=object.
# STEP 2 full run:
#   caffeinate -i env EXECUTE=1 bash scripts/rebuttal/9_qwen_sizes.sh
#
# MODELS: exact OpenRouter ids. CHECK THEM before running (https://openrouter.ai/models?q=qwen3)
# and pin what you used in the paper. Override with MODELS="a b c".
# Prompts are 30k-110k tokens and grow with history, so every model needs >= 128k context.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
# Default: ONE model, the largest Qwen3 reasoning model (user decision 2026-11-07). Smaller sizes
# can be added later for a size contrast, e.g. MODELS="qwen/qwen3-32b qwen/qwen3-235b-a22b-thinking-2507".
MODELS=${MODELS:-"qwen/qwen3-235b-a22b-thinking-2507"}
all=$repo/workspace/corpus/out/release/all-layers/samples
some=$repo/workspace/corpus/out/release/some-generated-d5/samples
seq_ids() { for i in $(seq 1 "$2"); do printf '%s-%04d ' "$1" "$i"; done; }
R=CODEX_HARNESS_TESTING/run_qwen_low_legal_autocompare.sh
common=(MAX_TURNS=80 TIMEOUT=300 IMAGE_HISTORY=none JSON_MODE=${JSON_MODE:-schema})

go() { echo "$*"; [[ "${EXECUTE:-0}" == 1 ]] && "$@"; return 0; }

if [[ "${SMOKE:-0}" == 1 ]]; then
  m=${MODELS%% *}
  go env "${common[@]}" MAX_TURNS=3 QWEN_MODEL="$m" SAMPLES="easy-0001" \
     sh $R --corpus "$all" --action-space all-layers
  exit 0
fi
for m in $MODELS; do
  echo "== $m"
  go env "${common[@]}" QWEN_MODEL="$m" SAMPLES="$(seq_ids easy 10)" \
     sh $R --corpus "$all" --action-space all-layers
  go env "${common[@]}" QWEN_MODEL="$m" SAMPLES="$(seq_ids layers 10)" \
     sh $R --corpus "$some" --action-space any
done
