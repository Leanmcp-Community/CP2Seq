# Re-making discarded folds: model vs chance

Backtracks removing >= 2 folds. Observed = the next accepted folds reach the discarded states in order (compared by state). Chance = uniform choice among distinct legal folds at each state; expected count = sum of probabilities.

| condition | backtracks (jump>=2) | re-made all, observed | expected by chance | ratio | re-made first fold, observed |
| --- | --- | --- | --- | --- | --- |
| claude-sonnet-5-5 | L+A | text-only | 58 | 0 (0%) | 8.7 (15%) | 0.0 | 3 |
| gpt-5.6-luna | B | text-only | 6 | 4 (67%) | 0.9 (15%) | 4.4 | 5 |
| gpt-5.6-luna | B+A | text+images | 14 | 8 (57%) | 3.7 (26%) | 2.2 | 11 |
| gpt-5.6-luna | L | text-only | 32 | 7 (22%) | 8.3 (26%) | 0.8 | 14 |
| gpt-5.6-luna | L+A | text+images | 24 | 2 (8%) | 7.6 (31%) | 0.3 | 7 |
| gpt-5.6-luna | L+A | text-only | 293 | 32 (11%) | 61.0 (21%) | 0.5 | 89 |
