#!/usr/bin/env bash
# Generality and exploration experiments. All arms use the L+A condition (legal-fold
# enumeration + automatic tier-3 feedback), TEXT-ONLY (no images: the modality ablation found
# no benefit from images, and text-only is about a third of the tokens), low effort, 80 turns,
# 300 s timeout -- the settings of the existing text-only L+A Luna arm (11/40), so that arm is
# the pass@1 reference.
#
# Instances: easy and some-layers only (mid/hard are 0 for every method, so they cannot
# separate models). easy runs in the all-layers action space, some-layers in any, as before.
#
# ARMS (run in the order given; each prints its commands first):
#   luna-pass5   GPT-5.6 Luna, 5 independent repeats on the 20 instances (H2: is the bottleneck
#                exploration?). Codex CLI on the ChatGPT login: no API charge.
#   sonnet10     Claude Sonnet 5.5 on 10 instances (easy-0001..0005, layers-0001..0005):
#                pilot for the cross-family check. claude -p on the claude.ai login.
#   sonnet20     Claude Sonnet 5.5 on all 20 instances (run after the pilot looks sane;
#                it repeats the pilot's 10, so use it INSTEAD of sonnet10 for the final table).
#   haiku20      Claude Haiku 5.5 on all 20 instances (size contrast within the family).
#
#   bash scripts/rebuttal/8_generality.sh                         # dry run: print commands
#   EXECUTE=1 ARMS=luna-pass5 bash scripts/rebuttal/8_generality.sh
#   EXECUTE=1 ARMS=sonnet10   bash scripts/rebuttal/8_generality.sh
#   REPEATS=5 (luna-pass5 only)
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"
ARMS=${ARMS:-"luna-pass5"}
REPEATS=${REPEATS:-5}
all=$repo/workspace/corpus/out/release/all-layers/samples
some=$repo/workspace/corpus/out/release/some-generated-d5/samples
seq_ids() { for i in $(seq 1 "$2"); do printf '%s-%04d ' "$1" "$i"; done; }
H=CODEX_HARNESS_TESTING
common=(REASONING_EFFORT=low EFFORT=low MAX_TURNS=80 TIMEOUT=300 IMAGE_HISTORY=none)

run() {  # run <runner> <extra env...> -- <easy ids> -- <layers ids>
  local runner=$1; shift
  local envs=(); while [[ $1 != -- ]]; do envs+=("$1"); shift; done; shift
  local easy=$1 layers=$3
  local a=(env "${common[@]}" ${envs[@]+"${envs[@]}"} SAMPLES="$easy" sh $H/$runner --corpus "$all" --action-space all-layers)
  local b=(env "${common[@]}" ${envs[@]+"${envs[@]}"} SAMPLES="$layers" sh $H/$runner --corpus "$some" --action-space any)
  echo "${a[*]}"; [[ "${EXECUTE:-0}" == 1 ]] && "${a[@]}"
  echo "${b[*]}"; [[ "${EXECUTE:-0}" == 1 ]] && "${b[@]}"
  return 0
}

for arm in $ARMS; do
  echo "== $arm"
  case $arm in
    luna-pass5)
      for r in $(seq 1 "$REPEATS"); do
        echo "-- repeat $r/$REPEATS"
        run run_luna_low_legal_autocompare.sh -- "$(seq_ids easy 10)" -- "$(seq_ids layers 10)"
      done ;;
    sonnet10) run run_claude_low_legal_autocompare.sh CLAUDE_MODEL=claude-sonnet-5-5 -- "$(seq_ids easy 5)" -- "$(seq_ids layers 5)" ;;
    # Resume of the sonnet10 pilot paused on 2026-11-07 (claude.ai extra-usage billing, ~$0.36/turn):
    # run claude-20261107T175727765597Z finished easy-0001..0004 (3/4 solved); easy-0005 was
    # interrupted at turn ~40 and is rerun from scratch here. Fix prompt caching before running.
    sonnet10-rest) run run_claude_low_legal_autocompare.sh CLAUDE_MODEL=claude-sonnet-5-5 -- "easy-0005" -- "$(seq_ids layers 5)" ;;
    sonnet20)run run_claude_low_legal_autocompare.sh CLAUDE_MODEL=claude-sonnet-5-5 -- "$(seq_ids easy 10)" -- "$(seq_ids layers 10)" ;;
    haiku20)  run run_claude_low_legal_autocompare.sh CLAUDE_MODEL=claude-haiku-5-5  -- "$(seq_ids easy 10)" -- "$(seq_ids layers 10)" ;;
    *) echo "unknown arm $arm" >&2; exit 1 ;;
  esac
done
