# Run inventory and ablations

Generated: 2026-09-24T04:35:03.024Z

Recent cohort starts at run timestamp 20260923T034343.

## Inventory

All completed Codex attempts, including repeats and differing budgets. Unique samples use corpus path plus sample ID.

| Model | Effort | Condition | Earlier | Recent | Completed | Unique samples | Solved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| unknown | unknown | basic | 1 | 0 | 1 | 1 | 0 |
| gpt-5.6-luna | low | basic | 67 | 40 | 107 | 47 | 6 |
| gpt-5.6-sol | low | basic | 7 | 0 | 7 | 5 | 0 |
| gpt-5.6-terra | low | basic | 1 | 0 | 1 | 1 | 0 |
| gpt-6-astra | low | basic | 1 | 0 | 1 | 1 | 1 |
| gpt-5.6-luna | low | legal | 272 | 40 | 312 | 197 | 37 |
| gpt-5.6-luna | low | on-demand-tier-3 | 108 | 0 | 108 | 108 | 28 |
| gpt-6-luna | low | basic | 0 | 40 | 40 | 40 | 0 |
| gpt-6-luna | high | basic | 0 | 40 | 40 | 40 | 6 |
| gpt-6-luna | low | legal | 0 | 38 | 38 | 38 | 2 |
| gpt-6-luna | low | auto-tier-3 | 0 | 38 | 38 | 38 | 8 |
| gpt-5.6-luna | low | auto-tier-3 | 0 | 39 | 39 | 39 | 10 |
| gpt-6-luna | high | legal | 0 | 40 | 40 | 40 | 10 |
| gpt-6-luna | high | auto-tier-3 | 0 | 40 | 40 | 40 | 11 |
| gpt-6-sol | low | legal | 0 | 3 | 3 | 3 | 1 |

`basic`: editing/observation tools without legal enumeration. `legal`: legal enumeration without target comparison. `on-demand-tier-3`: model-requested comparison. `auto-tier-3`: automatically attached comparison.

## Recent Luna ablations

First completed attempt per sample and condition, recent runs only, reference IDs 0001–0010, 80 turns, 300s timeout, all image history, matched action spaces and stopping settings. Cells show solved/completed, with 10 intended samples per group.

| Model | Effort | Condition | Easy | Medium | Hard | Some-layers | Solved / completed | Missing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.6-luna | low | basic | 2/10 | 0/10 | 0/10 | 0/10 | 2/40 | 0 |
| gpt-5.6-luna | low | legal | 1/10 | 0/10 | 0/10 | 5/10 | 6/40 | 0 |
| gpt-5.6-luna | low | auto-tier-3 | 4/10 | 0/9 | 0/10 | 6/10 | 10/39 | 1 |
| gpt-6-luna | low | basic | 0/10 | 0/10 | 0/10 | 0/10 | 0/40 | 0 |
| gpt-6-luna | low | legal | 1/10 | 0/8 | 0/10 | 1/10 | 2/38 | 2 |
| gpt-6-luna | low | auto-tier-3 | 3/10 | 0/8 | 0/10 | 5/10 | 8/38 | 2 |
| gpt-6-luna | high | basic | 3/10 | 0/10 | 0/10 | 3/10 | 6/40 | 0 |
| gpt-6-luna | high | legal | 3/10 | 0/10 | 0/10 | 7/10 | 10/40 | 0 |
| gpt-6-luna | high | auto-tier-3 | 3/10 | 0/10 | 0/10 | 8/10 | 11/40 | 0 |

Missing attempts are not failures. Unequal coverage means these are descriptive summaries, not fully matched performance comparisons.

## Missing ablation results

- gpt-5.6-luna, low, auto-tier-3: mid-0006
- gpt-6-luna, low, legal: mid-0006, mid-0010
- gpt-6-luna, low, auto-tier-3: mid-0006, mid-0010

## Audit notes

0 warnings; details and per-attempt provenance are in report.json. Missing results are not assumed to be intentional exclusions.
