# Matched baselines on the 40 ablation samples

Seed 1. Random: 100 episodes x 80 folds per sample, oracle success check after every fold. BFS: identity-keyed dedup, depth cap reference+4, wall clock 600s, budgets 80, 1000, 10000, 100000 expansions.

| group | samples | random: samples with >=1 solve | random: mean per-episode solve rate | BFS solved <=80 | BFS solved <=1000 | BFS solved <=10000 | BFS solved <=100000 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| easy | 10 | 9 | 0.572 | 7 | 9 | 10 | 10 |
| mid | 10 | 3 | 0.005 | 0 | 0 | 3 | 5 |
| hard | 10 | 0 | 0.000 | 0 | 0 | 0 | 0 |
| layers | 10 | 10 | 0.959 | 9 | 10 | 10 | 10 |
