# Exploration analysis (H2)

Model: per saved episode with history.json. Random: 20 episodes x 80 uniformly random legal folds per sample (same enumerator and reset rule as the matched baselines). Distinct states exclude the flat sheet; state key = layer geometry + parity.

## By condition and group (model)

| condition | group | episodes | solved | mean turns | rejection rate | mean accepted | mean distinct states | median distinct | revisit rate | mean max depth | reasoning tok/turn |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.6-luna | low | base | images-only | easy | 12 | 2 | 36.2 | 81% | 5.5 | 4.3 | 4.0 | 22% | 4.3 | 543.3 |
| gpt-5.6-luna | low | base | images-only | mid | 10 | 0 | 35.5 | 91% | 3.8 | 2.9 | 1.0 | 16% | 2.9 | 538.7 |
| gpt-5.6-luna | low | base | images-only | hard | 10 | 0 | 47.7 | 88% | 4.3 | 1.9 | 1.5 | 44% | 1.8 | 579.2 |
| gpt-5.6-luna | low | base | images-only | layers | 11 | 0 | 55.4 | 95% | 2.7 | 1.8 | 2.0 | 24% | 1.8 | 810.1 |
| gpt-5.6-luna | low | base | text-only | easy | 10 | 3 | 34.7 | 74% | 7.2 | 4.8 | 5.0 | 28% | 4.7 | 626.3 |
| gpt-5.6-luna | low | base | text-only | mid | 10 | 0 | 39.3 | 79% | 6.5 | 3.5 | 3.0 | 44% | 3.5 | 557.6 |
| gpt-5.6-luna | low | base | text-only | hard | 9 | 0 | 41.0 | 80% | 6.6 | 3.6 | 3.0 | 37% | 3.4 | 480.7 |
| gpt-5.6-luna | low | base | text-only | layers | 10 | 0 | 45.2 | 81% | 7.0 | 3.3 | 3.5 | 49% | 3.2 | 799.0 |
| gpt-5.6-luna | low | base+auto | text+images | easy | 12 | 4 | 34.6 | 72% | 9.3 | 5.3 | 5.0 | 37% | 4.4 | 441.4 |
| gpt-5.6-luna | low | base+auto | text+images | mid | 10 | 0 | 47.4 | 80% | 7.4 | 4.1 | 4.0 | 42% | 3.7 | 404.9 |
| gpt-5.6-luna | low | base+auto | text+images | hard | 10 | 0 | 46.8 | 86% | 6.6 | 3.1 | 3.0 | 48% | 2.8 | 429.3 |
| gpt-5.6-luna | low | base+auto | text+images | layers | 11 | 2 | 52.5 | 83% | 6.6 | 3.5 | 4.0 | 45% | 3.5 | 630.1 |
| gpt-5.6-luna | low | legal-folds | text-only | easy | 10 | 3 | 21.0 | 7% | 19.4 | 8.0 | 7.0 | 58% | 6.0 | 135.5 |
| gpt-5.6-luna | low | legal-folds | text-only | mid | 9 | 0 | 31.9 | 7% | 29.7 | 11.3 | 10.0 | 62% | 6.3 | 131.5 |
| gpt-5.6-luna | low | legal-folds | text-only | hard | 10 | 0 | 33.8 | 8% | 31.0 | 10.5 | 10.5 | 67% | 5.8 | 129.5 |
| gpt-5.6-luna | low | legal-folds | text-only | layers | 10 | 4 | 21.2 | 7% | 19.6 | 7.0 | 6.5 | 63% | 4.9 | 109.9 |
| gpt-5.6-luna | low | legal-folds+auto | text+images | easy | 10 | 4 | 28.1 | 6% | 26.0 | 10.8 | 10.5 | 57% | 6.5 | - |
| gpt-5.6-luna | low | legal-folds+auto | text+images | mid | 10 | 0 | 42.8 | 7% | 39.3 | 15.5 | 12.0 | 61% | 8.2 | - |
| gpt-5.6-luna | low | legal-folds+auto | text-only | easy | 10 | 5 | 32.4 | 8% | 29.8 | 12.8 | 10.5 | 57% | 6.2 | 115.7 |
| gpt-5.6-luna | low | legal-folds+auto | text-only | mid | 9 | 0 | 39.3 | 8% | 36.3 | 14.1 | 14.0 | 61% | 7.1 | 106.8 |
| gpt-5.6-luna | low | legal-folds+auto | text-only | hard | 10 | 0 | 41.6 | 7% | 38.2 | 13.9 | 12.0 | 65% | 5.7 | 116.4 |
| gpt-5.6-luna | low | legal-folds+auto | text-only | layers | 10 | 6 | 20.4 | 6% | 19.0 | 7.6 | 6.5 | 56% | 5.2 | 89.5 |

## Random baseline (distinct states per 80-fold episode)

| group | samples | mean distinct | min over samples | max over samples |
| --- | --- | --- | --- | --- |
| easy | 10 | 43.7 | 13.9 | 73.7 |
| layers | 10 | 32.7 | 15.3 | 70.7 |

## Model vs random, paired by sample (ratio = model distinct / random mean distinct)

| condition | group | paired episodes | mean model distinct | mean random distinct | median ratio |
| --- | --- | --- | --- | --- | --- |
| gpt-5.6-luna | low | base | images-only | easy | 12 | 4.3 | 43.9 | 0.117 |
| gpt-5.6-luna | low | base | images-only | layers | 11 | 1.8 | 31.1 | 0.065 |
| gpt-5.6-luna | low | base | text-only | easy | 10 | 4.8 | 43.7 | 0.112 |
| gpt-5.6-luna | low | base | text-only | layers | 10 | 3.3 | 32.7 | 0.119 |
| gpt-5.6-luna | low | base+auto | text+images | easy | 12 | 5.3 | 43.9 | 0.122 |
| gpt-5.6-luna | low | base+auto | text+images | layers | 11 | 3.5 | 31.1 | 0.112 |
| gpt-5.6-luna | low | legal-folds | text-only | easy | 10 | 8.0 | 43.7 | 0.163 |
| gpt-5.6-luna | low | legal-folds | text-only | layers | 10 | 7.0 | 32.7 | 0.236 |
| gpt-5.6-luna | low | legal-folds+auto | text+images | easy | 10 | 10.8 | 43.7 | 0.262 |
| gpt-5.6-luna | low | legal-folds+auto | text-only | easy | 10 | 12.8 | 43.7 | 0.252 |
| gpt-5.6-luna | low | legal-folds+auto | text-only | layers | 10 | 7.6 | 32.7 | 0.184 |

## Solved vs unsolved episodes (all model conditions pooled, easy + layers)

| outcome | episodes | mean distinct | revisit rate | rejection rate | reasoning tok/turn |
| --- | --- | --- | --- | --- | --- |
| solved | 33 | 7.6 | 43% | 28% | 262.0 |
| unsolved | 83 | 5.6 | 45% | 57% | 504.2 |
