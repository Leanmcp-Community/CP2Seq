#!/usr/bin/env bash
# One slice of the text-only BASIC arm, so the slow basic arm can run as several processes.
#
#   bash CODEX_HARNESS_TESTING/run_textonly_basic_part.sh easy-mid   # easy-0010 + mid-0001..0010
#   bash CODEX_HARNESS_TESTING/run_textonly_basic_part.sh layers     # layers-0001..0010
#   bash CODEX_HARNESS_TESTING/run_textonly_basic_part.sh hard       # hard-0001..0010
#   bash CODEX_HARNESS_TESTING/run_textonly_basic_part.sh easy       # easy-0001..0010
#
# Same settings as run_textonly_matched40.sh (GPT-5.6 Luna, low effort, basic tools, no images,
# 80 turns, 300 s timeout, default stop limits), so each episode pairs with the text+image run
# on the same sample. Samples already completed under exactly these settings are skipped, so
# slices never redo finished work. Changes no existing script. Requires jq.
set -eo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(dirname -- "$here")
cd "$repo_dir"
command -v jq >/dev/null || { echo 'jq is required' >&2; exit 1; }

all_corpus="$repo_dir/workspace/corpus/out/release/all-layers/samples"
some_corpus="$repo_dir/workspace/corpus/out/release/some-generated-d5/samples"
seq10() { for i in $(seq 1 10); do printf '%s-%04d ' "$1" "$i"; done; }

case "${1:-}" in
  easy-mid) samples="easy-0010 $(seq10 mid)"; corpus=$all_corpus; action=all-layers ;;
  easy)     samples=$(seq10 easy);  corpus=$all_corpus;  action=all-layers ;;
  mid)      samples=$(seq10 mid);   corpus=$all_corpus;  action=all-layers ;;
  hard)     samples=$(seq10 hard);  corpus=$all_corpus;  action=all-layers ;;
  layers)   samples=$(seq10 layers); corpus=$some_corpus; action=any ;;
  *) echo "usage: $0 easy|easy-mid|mid|hard|layers" >&2; exit 2 ;;
esac

# Skip samples already completed with these exact settings (same test as run_luna_matched40.sh).
pending=()
for sample in $samples; do
  done_here=false
  for config in "$here"/runs/codex-*/config.json; do
    [[ -f "$config" ]] || continue
    jq -e --arg corpus "$corpus" --arg action "$action" '
      .model == "gpt-5.6-luna" and .reasoning_effort == "low" and .tools == "base" and
      .image_history == "none" and .corpus == $corpus and .action_space == $action and
      (.compare_tier // 0) == 0 and .max_turns == 80 and .timeout == 300 and
      .cycle_limit == 3 and .revisit_limit == 15 and .stuck_limit == 5' "$config" >/dev/null || continue
    result="${config%/config.json}/$sample/result.json"
    if [[ -f "$result" ]] && jq -e '.solved | type == "boolean"' "$result" >/dev/null; then
      done_here=true; break
    fi
  done
  if $done_here; then echo "SKIP $sample (completed)"; else pending+=("$sample"); fi
done
[[ ${#pending[@]} -gt 0 ]] || { echo "Nothing to run for '$1'."; exit 0; }

echo "RUN basic text-only: ${pending[*]}"
IMAGE_HISTORY=none REASONING_EFFORT=low MAX_TURNS=80 TIMEOUT=300 SAMPLES="${pending[*]}" \
  exec bash "$here/run_luna_low.sh" --corpus "$corpus" --action-space "$action" --model gpt-5.6-luna
