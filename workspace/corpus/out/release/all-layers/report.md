# Synthetic Pureland corpus -- pilot batch

400 samples, seed0 20260918, generated 2026-09-17.
coupling cap: none   coupling frac: none   reject filters: none

> Read this before fixing any cut point. Both the coupling strata and the degeneracy
> filters are deliberately unset in this batch -- the numbers below are what they are
> supposed to be chosen from.

## Distribution

| metric | min | p10 | p50 | p90 | max |
| --- | --- | --- | --- | --- | --- |
| steps | 4 | 5 | 11 | 17 | 19 |
| crease edges | 4 | 15 | 83 | 736 | 24448 |
| distinct crease lines | 4 | 7 | 22 | 60 | 380 |
| **coupling max** | 1 | 4 | 16 | 240 | 8192 |
| **coupling mean** | 1 | 2.2 | 5.625 | 31.938 | 910.167 |
| coupling total | 4 | 11 | 58 | 511 | 16383 |
| layers final | 5 | 12 | 59 | 512 | 16384 |
| vertices | 11 | 17 | 44 | 289 | 8321 |
| bbox area final | 0.000122 | 0.005859 | 0.0625 | 0.375 | 0.875 |

## Per stratum

| stratum | cap | n | steps p50 | coupling max p50 | crease edges p50 | degenerate |
| --- | --- | --- | --- | --- | --- | --- |
| easy | none | 200 | 7 | 6 | 31 | 13 |
| mid | none | 100 | 12 | 36 | 152 | 65 |
| hard | none | 100 | 16 | 128 | 589 | 96 |

## Degeneracy flags (recorded, not filtered)

| flag | n | share |
| --- | --- | --- |
| repeated_halving | 0 | 0.0% |
| no_coupling | 2 | 0.5% |
| collapsed | 172 | 43.0% |
| single_angle | 0 | 0.0% |

## Rejected during sampling

| reason | n |
| --- | --- |
| stalled at step 13 | 28 |
| stalled at step 11 | 25 |
| stalled at step 12 | 24 |
| stalled at step 10 | 19 |
| stalled at step 14 | 17 |
| stalled at step 9 | 13 |
| stalled at step 15 | 11 |
| stalled at step 16 | 8 |
| stalled at step 8 | 7 |
| stalled at step 17 | 5 |
| stalled at step 5 | 1 |
| stalled at step 18 | 1 |
