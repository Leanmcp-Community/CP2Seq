# Ablation error accounting

Source inventory: workspace/RESULTS/run-inventory/report.md, generated 2026-09-24T23:13:33.275Z.
The generated inventory counts completed episodes only. The paper additionally counts
observed errors and omissions after blocking errors as unsuccessful evaluations, once
per sample and condition. Retries do not create additional denominator entries.

| Model / effort | Condition | Sample | Classification | Evidence under CODEX_HARNESS_TESTING/runs |
|---|---|---|---|---|
| GPT-5.6 Luna / low | automatic tier-3 | mid-0006 | Input-size error: 1,057,081 characters exceeds 1,048,576 | codex-20260924T020218313447Z/mid-0006/turn-051/failed-attempt-01/stderr.log |
| GPT-6 Luna / low | legal | mid-0006 | Input-size error: 1,067,015 characters exceeds 1,048,576 | codex-20260924T020230525444Z/mid-0006/turn-044/failed-attempt-01/stderr.log |
| GPT-6 Luna / low | legal | mid-0010 | Service prompt rejection | codex-20260924T022359978389Z/mid-0010/turn-009/failed-attempt-01/events.jsonl |
| GPT-6 Luna / low | automatic tier-3 | mid-0006 | Omissions after blocking errors; counted unsuccessful | codex-20260924T030502446068Z/config.json omits this sample; inventory has no attempt for this condition/sample |
| GPT-6 Luna / low | automatic tier-3 | mid-0010 | Omissions after blocking errors; counted unsuccessful | same configuration and inventory evidence |

Totals: 355 completed episodes + 3 error cases + 2 omissions after blocking errors = 360 planned
sample-condition pairs in the denominator. All five cases without a completed episode
count as unsuccessful evaluations. The two omissions are not direct observations of
input-size errors in that condition. Input-size rejection is a character limit of the Codex request interface;
these logs do not establish exhaustion of the model's token context window.
