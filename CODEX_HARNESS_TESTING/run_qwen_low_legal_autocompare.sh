#!/bin/sh
# Qwen arm, L+A condition (legal-fold enumeration + automatic tier-3 comparison), the same
# condition as run_luna_low_legal_autocompare.sh and run_claude_low_legal_autocompare.sh.
# OpenAI-compatible endpoint; see qwen_fold_loop.py for OpenRouter / DashScope / vLLM.
#
#   QWEN_MODEL=qwen/qwen3-32b SAMPLES="easy-0001" sh CODEX_HARNESS_TESTING/run_qwen_low_legal_autocompare.sh \
#     --corpus <samples dir> --action-space all-layers
#
# Overridable: QWEN_MODEL (required) QWEN_BASE_URL SAMPLES MAX_TURNS EFFORT TIMEOUT
#              IMAGE_HISTORY JSON_MODE FOLD_PYTHON
# The API key is loaded from the repo's .env (QWEN_API_KEY / FIREWORKS_API_KEY / OPENROUTER_API_KEY /
# DASHSCOPE_API_KEY) and never echoed.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(dirname -- "$script_dir")
MODEL=${QWEN_MODEL:?set QWEN_MODEL to the exact model id on the endpoint, e.g. qwen/qwen3-32b}
: "${SAMPLES:=easy-0001}"
: "${MAX_TURNS:=80}"
: "${TIMEOUT:=300}"
: "${IMAGE_HISTORY:=none}"
: "${JSON_MODE:=schema}"
if [ -f "$repo_dir/.env" ]; then set -a; . "$repo_dir/.env"; set +a; fi
fold_python=${FOLD_PYTHON:-"$repo_dir/.venv/bin/python"}
export OBS_ECHO="${OBS_ECHO:-full}"
effort_flag=
if [ -n "${EFFORT:-}" ]; then effort_flag="--reasoning-effort $EFFORT"; fi
cd "$repo_dir"
# SAMPLES and effort_flag are deliberately unquoted (word lists).
exec "$fold_python" "$script_dir/qwen_fold_loop.py" \
  --samples $SAMPLES \
  --model "$MODEL" \
  --max-turns "$MAX_TURNS" \
  --timeout "$TIMEOUT" \
  --image-history "$IMAGE_HISTORY" \
  --json-mode "$JSON_MODE" \
  --tools legal-folds \
  --compare-tier "${COMPARE_TIER:-3}" --compare-auto \
  $effort_flag \
  "$@"
