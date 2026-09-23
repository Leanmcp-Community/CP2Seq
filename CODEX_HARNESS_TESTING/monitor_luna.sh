#!/usr/bin/env bash
# Read-only progress monitor. --once prints one snapshot; default repeats every 30 minutes.
set -eo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
command -v jq >/dev/null
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
snapshot() {
  : > "$scratch/results.jsonl"
  : > "$scratch/errors.jsonl"
  for config in CODEX_HARNESS_TESTING/runs/codex-*/config.json; do
    [[ -f "$config" ]] || continue
    meta=$(jq -c 'select((.model=="gpt-5.6-luna" and .reasoning_effort=="low") or
      (.model=="gpt-6-luna" and (.reasoning_effort=="low" or .reasoning_effort=="high"))) |
      select(.max_turns==80 and .timeout==300 and .image_history=="all") |
      select((.action_space=="all-layers" and (.corpus|endswith("/release/all-layers/samples"))) or
        (.action_space=="any" and (.corpus|endswith("/release/some-generated-d5/samples")))) |
      {model,effort:.reasoning_effort,corpus,tools,auto:(.compare_auto//false),tier:(.compare_tier//0)} |
      select((.tools=="base" and .tier==0 and .auto==false) or
        (.tools=="legal-folds" and ((.tier==0 and .auto==false) or (.tier==3 and .auto==true))))' "$config")
    [[ -n "$meta" ]] || continue
    dir=${config%/config.json}
    for result in "$dir"/*/result.json; do
      [[ -f "$result" ]] || continue
      jq -c --argjson meta "$meta" '$meta + {sample:.sample_id,solved,termination} |
        select(.sample|test("^(easy|mid|hard|layers)-00(0[1-9]|10)$")) |
        select(.solved|type=="boolean")' "$result" >> "$scratch/results.jsonl"
    done
    # Recent errors only; do not mix old aborted launches into current health counts.
    if [[ "$dir" > CODEX_HARNESS_TESTING/runs/codex-20260923T034343 ]]; then
      [[ ! -f "$dir/events.jsonl" ]] || jq -Rc 'fromjson? |
        select(.event=="codex_retry" or .event=="episode_error") |
        {event,reason,error,ts}' "$dir/events.jsonl" >> "$scratch/errors.jsonl"
    fi
  done
  date
  jq -sr '
    unique_by([.model,.effort,.corpus,.tools,.auto,.tier,.sample]) as $rows |
    "MODEL / EFFORT\tEASY /30\tMID /30\tHARD /30\tSOME /30\tTOTAL /120\tSOLVED",
    (["gpt-5.6-luna","low"],["gpt-6-luna","low"],["gpt-6-luna","high"]) as $key |
    [$rows[]|select(.model==$key[0] and .effort==$key[1])] as $r |
    ([$key|join(" / ")] +
      (["easy","mid","hard","layers"] | map(. as $g | [$r[]|select(.sample|startswith($g+"-"))]|length)) +
      [($r|length),([$r[]|select(.solved)]|length)]) | @tsv' "$scratch/results.jsonl"
  printf 'Active harness processes: '
  ps -axo command | awk '/[p]ython .*codex_fold_loop.py/ {n++} END {print n+0}'
  jq -s '{retry_events:length,rate_or_capacity_retries:([.[]|select((.reason//"")|test("rate|capacity|429";"i"))]|length),episode_errors:([.[]|select(.event=="episode_error")]|length)}' "$scratch/errors.jsonl"
}
while :; do
  snapshot
  [[ "${1:-}" != --once ]] || break
  echo 'Next update in 30 minutes. Ctrl-C stops only this monitor.'
  sleep 1800
done
