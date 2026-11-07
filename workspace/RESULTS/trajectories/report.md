# Trajectory-level failure analysis

Categories (failed episodes, first rule that applies): F1 >50% add_fold geometrically illegal; F2 mostly off-pattern rejections and CP never matched; F3 reached target depth with full CP but wrong stack; F4 otherwise.

| condition | episodes | solved | mean rejection rate | mean geometric rejection | mean backtracks | F1 | F2 | F3 | F4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.6-luna low legal-folds +auto | 59 | 15 | 12.0% | 8.3% | 4.6 | 0 | 7 | 8 | 29 |
| gpt-5.6-luna low base | 39 | 3 | 82.0% | 20.5% | 1.2 | 3 | 29 | 0 | 4 |
| gpt-5.6-luna low legal-folds | 39 | 7 | 13.0% | 8.4% | 3.4 | 0 | 5 | 6 | 21 |

## Cycling-threshold sensitivity (offline)

For each limit k: episodes that WOULD have been stopped by the k-repeat rule before their actual end, and how many of those were actually solved (a stricter limit would have cost them). Limits above the one used are censored for cycling stops and need reruns (scripts/rebuttal/run_cycling_sensitivity.sh).

| k | stopped earlier | of which solved | censored (needs rerun) |
| --- | --- | --- | --- |
| 2 | 105 | 9 | 0 |
| 3 | 0 | 0 | 0 |
| 4 | 0 | 0 | 83 |
| 5 | 0 | 0 | 83 |
| 6 | 0 | 0 | 83 |
