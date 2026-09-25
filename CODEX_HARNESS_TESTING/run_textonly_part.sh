#!/usr/bin/env bash
# One slice of one arm of the text-only ablation, so arms can be resumed or split into several
# processes. Every setting is fixed inside this script, so nothing depends on environment
# variables typed on the command line.
#
#   bash CODEX_HARNESS_TESTING/run_textonly_part.sh <arm> <slice>
#     arm:   basic | legal | autocompare
#     slice: easy | mid | hard | layers | easy-mid (easy-0010 + mid-0001..0010)
#            or explicit IDs from one group, e.g. hard-0009 hard-0010
#   e.g. bash CODEX_HARNESS_TESTING/run_textonly_part.sh autocompare hard
#
# Same settings as run_textonly_matched40.sh (GPT-5.6 Luna, low effort, no images, 80 turns,
# 300 s timeout, default stop limits; autocompare uses tier-3 automatic feedback), so each episode pairs with the text+image run
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

arm=${1:-}
case "$arm" in
  basic)       runner=run_luna_low.sh;                   tools=base;        tier=0; auto=false ;;
  legal)       runner=run_luna_low_legal.sh;             tools=legal-folds; tier=0; auto=false ;;
  autocompare) runner=run_luna_low_legal_autocompare.sh; tools=legal-folds; tier=3; auto=true ;;
  *) echo "usage: $0 basic|legal|autocompare easy|easy-mid|mid|hard|layers" >&2; exit 2 ;;
esac

case "${2:-}" in
  easy-[0-9]*|mid-[0-9]*|hard-[0-9]*|layers-[0-9]*)
    # Explicit sample IDs, e.g. `basic hard-0009 hard-0010`; all must share one corpus.
    samples="${*:2}"; first=${2%%-*}
    for s in $samples; do [[ "${s%%-*}" == "$first" && "$s" =~ ^[a-z]+-[0-9]{4}$ ]] || { echo "bad or mixed sample list: $samples" >&2; exit 2; }; done
    if [[ "$first" == layers ]]; then corpus=$some_corpus; action=any; else corpus=$all_corpus; action=all-layers; fi ;;
  easy-mid) samples="easy-0010 $(seq10 mid)"; corpus=$all_corpus; action=all-layers ;;
  easy)     samples=$(seq10 easy);  corpus=$all_corpus;  action=all-layers ;;
  mid)      samples=$(seq10 mid);   corpus=$all_corpus;  action=all-layers ;;
  hard)     samples=$(seq10 hard);  corpus=$all_corpus;  action=all-layers ;;
  layers)   samples=$(seq10 layers); corpus=$some_corpus; action=any ;;
  *) echo "usage: $0 basic|legal|autocompare easy|easy-mid|mid|hard|layers" >&2; exit 2 ;;
esac

# Skip samples already completed with these exact settings (same test as run_luna_matched40.sh).
pending=()
for sample in $samples; do
  done_here=
  for config in "$here"/runs/codex-*/config.json; do
    [[ -f "$config" ]] || continue
    jq -e --arg corpus "$corpus" --arg action "$action" --arg tools "$tools" \
      --argjson tier "$tier" --argjson auto "$auto" '
      .model == "gpt-5.6-luna" and .reasoning_effort == "low" and .tools == $tools and
      .image_history == "none" and .corpus == $corpus and .action_space == $action and
      (.compare_tier // 0) == $tier and (.compare_auto // false) == $auto and .max_turns == 80 and .timeout == 300 and
      .cycle_limit == 3 and .revisit_limit == 15 and .stuck_limit == 5' "$config" >/dev/null || continue
    result="${config%/config.json}/$sample/result.json"
    if [[ -f "$result" ]] && jq -e '.solved | type == "boolean"' "$result" >/dev/null; then
      done_here=completed; break
    fi
    # A sample that already failed on the Codex input-size limit under these settings is a
    # protocol failure (counted as unsolved, as in the text+image ablation); retrying would hit
    # the same limit and stop this whole process.
    error="${config%/config.json}/$sample/error.json"
    if [[ -f "$error" ]] && grep -q "input_too_large" "$error" "${config%/config.json}/$sample"/turn-*/failed-attempt-*/stderr.log 2>/dev/null; then
      done_here="input-size protocol failure"; break
    fi
  done
  if [[ -n "$done_here" ]]; then echo "SKIP $sample ($done_here)"; else pending+=("$sample"); fi
done
[[ ${#pending[@]} -gt 0 ]] || { echo "Nothing to run for '$arm $2'."; exit 0; }

echo "RUN $arm text-only: ${pending[*]}"
IMAGE_HISTORY=none REASONING_EFFORT=low MAX_TURNS=80 TIMEOUT=300 COMPARE_TIER=3 SAMPLES="${pending[*]}" \
  exec bash "$here/$runner" --corpus "$corpus" --action-space "$action" --model gpt-5.6-luna
