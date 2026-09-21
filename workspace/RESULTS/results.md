# Aggregated results

Generated from `CODEX_HARNESS_TESTING/runs`. Every attempt in every run is counted once.
Total attempts: **1211** across **47** runs and **256** distinct samples.

> **24 attempts carry no `solved` field** and are counted as unsolved. Runs affected: claude-20260920T074540935640Z, claude-20260920T083205732300Z, codex-20260917T160831299664Z, codex-20260918T103441129562Z, codex-20260918T125538256389Z, codex-20260918T140452446485Z, codex-20260918T140523584997Z, codex-20260918T150110336414Z, codex-20260918T153948224624Z, codex-20260919T093814305439Z, codex-20260919T093931835650Z, codex-20260919T142435849107Z, codex-20260919T154757551051Z, codex-20260919T161926149584Z, codex-20260919T170104532200Z, codex-20260920T044938216244Z, codex-20260920T083214634888Z, codex-20260920T154647355949Z, codex-20260920T154715715618Z, codex-20260920T161346893032Z, codex-20260920T161505311490Z, codex-20260921T011635694755Z, codex-20260921T033426818617Z, codex-20260921T054730842162Z


### By model

| Arm | easy solved/n | mid solved/n | hard solved/n | overall | median tool calls |
|---|---|---|---|---|---|
| claude-sonnet-5 | 0/5 | -- | -- | 0/5 (0.0%) | 10 |
| codex-cli-chatgpt | 0/1 | -- | -- | 0/1 (0.0%) | 2 |
| deterministic-bfs | 366/669 | 1/40 | 0/16 | 367/725 (50.6%) | 5 |
| gpt-5.6-luna | 63/354 | 0/67 | 0/26 | 63/447 (14.1%) | 24 |
| gpt-5.6-sol | 0/7 | -- | -- | 0/7 (0.0%) | 20 |
| gpt-5.6-terra | 0/1 | -- | -- | 0/1 (0.0%) | 35 |
| gpt-6-astra | 1/1 | -- | -- | 1/1 (100.0%) | 5 |
| unknown | 0/20 | 0/3 | 0/1 | 0/24 (0.0%) | None |

### By model and tool tier

| Arm | easy solved/n | mid solved/n | hard solved/n | overall | median tool calls |
|---|---|---|---|---|---|
| claude-sonnet-5 / tools=legal-folds | 0/5 | -- | -- | 0/5 (0.0%) | 10 |
| codex-cli-chatgpt / tools=none | 0/1 | -- | -- | 0/1 (0.0%) | 2 |
| deterministic-bfs / tools=legal-folds | 366/669 | 1/40 | 0/16 | 367/725 (50.6%) | 5 |
| gpt-5.6-luna / tools=legal-folds | 59/289 | 0/66 | 0/25 | 59/380 (15.5%) | 23.5 |
| gpt-5.6-luna / tools=none | 4/65 | 0/1 | 0/1 | 4/67 (6.0%) | 29 |
| gpt-5.6-sol / tools=none | 0/7 | -- | -- | 0/7 (0.0%) | 20 |
| gpt-5.6-terra / tools=none | 0/1 | -- | -- | 0/1 (0.0%) | 35 |
| gpt-6-astra / tools=none | 1/1 | -- | -- | 1/1 (100.0%) | 5 |
| unknown / tools=none | 0/20 | 0/3 | 0/1 | 0/24 (0.0%) | None |

### By model, tier, effort and image history

| Arm | easy solved/n | mid solved/n | hard solved/n | overall | median tool calls |
|---|---|---|---|---|---|
| claude-sonnet-5 / legal-folds / eff=low / img=all | 0/5 | -- | -- | 0/5 (0.0%) | 10 |
| codex-cli-chatgpt / none / eff=- / img=- | 0/1 | -- | -- | 0/1 (0.0%) | 2 |
| deterministic-bfs / legal-folds / eff=- / img=- | 366/669 | 1/40 | 0/16 | 367/725 (50.6%) | 5 |
| gpt-5.6-luna / legal-folds / eff=low / img=all | 59/289 | 0/66 | 0/25 | 59/380 (15.5%) | 23.5 |
| gpt-5.6-luna / none / eff=low / img=all | 4/65 | 0/1 | 0/1 | 4/67 (6.0%) | 29 |
| gpt-5.6-sol / none / eff=low / img=all | 0/7 | -- | -- | 0/7 (0.0%) | 20 |
| gpt-5.6-terra / none / eff=low / img=all | 0/1 | -- | -- | 0/1 (0.0%) | 35 |
| gpt-6-astra / none / eff=low / img=all | 1/1 | -- | -- | 1/1 (100.0%) | 5 |
| unknown / none / eff=- / img=- | 0/20 | 0/3 | 0/1 | 0/24 (0.0%) | None |

### Termination reasons

| Model | error | finished | repetition_detected | state_cycling | timeout | turn_budget |
|---|---|---|---|---|---|---|
| claude-sonnet-5 | 0 | 5 | 0 | 0 | 0 | 0 |
| codex-cli-chatgpt | 0 | 0 | 0 | 0 | 0 | 1 |
| deterministic-bfs | 0 | 367 | 0 | 0 | 358 | 0 |
| gpt-5.6-luna | 0 | 167 | 18 | 215 | 0 | 47 |
| gpt-5.6-sol | 0 | 2 | 0 | 0 | 0 | 5 |
| gpt-5.6-terra | 0 | 1 | 0 | 0 | 0 | 0 |
| gpt-6-astra | 0 | 1 | 0 | 0 | 0 | 0 |
| unknown | 24 | 0 | 0 | 0 | 0 | 0 |

### Deterministic search baseline

- attempts: 725, solved: 367 (50.6%)
- median states expanded: 73
- easy: 366/669 solved, median expanded 65
- mid: 1/40 solved, median expanded 1051.5
- hard: 0/16 solved, median expanded 532.0
