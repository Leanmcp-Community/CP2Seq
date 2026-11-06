#!/usr/bin/env bash
# LLM-guided best-first search vs the same search with random ordering.
# Instances: easy-0003 + mid-0001..0010 (BFS does not solve them within 1,000 expansions).
#
#   bash scripts/rebuttal/6_hybrid_quick_test.sh                 # random control only (free)
#   EXECUTE_LLM=1 bash scripts/rebuttal/6_hybrid_quick_test.sh   # + Claude Haiku 5.5 (paid, est. a few $)
#
# The LLM arm needs the Anthropic SDK (npm install @anthropic-ai/sdk in the repo root) and
# ANTHROPIC_API_KEY in the environment. It prints a running cost estimate per sample.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
BUDGET=${BUDGET:-200}
echo "== random ordering (control), budget $BUDGET expansions"
node workspace/hybrid_search.mjs --ranker random --budget "$BUDGET" --seed 1 --out workspace/RESULTS/hybrid-random
if [[ "${EXECUTE_LLM:-0}" == 1 ]]; then
  [[ -d node_modules/@anthropic-ai/sdk ]] || npm install --no-save @anthropic-ai/sdk
  echo "== Claude Haiku 5.5 ordering, budget $BUDGET expansions"
  node workspace/hybrid_search.mjs --ranker llm --model claude-haiku-5-5 --effort low \
    --budget "$BUDGET" --out workspace/RESULTS/hybrid-llm
fi
