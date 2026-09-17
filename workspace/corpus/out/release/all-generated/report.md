# Synthetic Pureland corpus -- pilot batch

150 samples, seed0 20260918, generated 2026-09-16.
coupling cap: none   coupling frac: none   reject filters: none

> Read this before fixing any cut point. Both the coupling strata and the degeneracy
> filters are deliberately unset in this batch -- the numbers below are what they are
> supposed to be chosen from.

## Distribution

| metric | min | p10 | p50 | p90 | max |
| --- | --- | --- | --- | --- | --- |
| steps | 4 | 6 | 12 | 18 | 19 |
| crease edges | 6 | 20 | 143 | 670 | 3008 |
| distinct crease lines | 5 | 10 | 27 | 60 | 124 |
| **coupling max** | 2 | 5 | 31 | 152 | 1024 |
| **coupling mean** | 1.25 | 2.429 | 7.875 | 28.389 | 127.938 |
| coupling total | 5 | 15 | 93 | 447 | 2047 |
| layers final | 6 | 16 | 94 | 448 | 2048 |
| vertices | 11 | 20 | 71 | 289 | 1089 |
| bbox area final | 0.000977 | 0.007813 | 0.03125 | 0.3125 | 0.875 |

## Per stratum

| stratum | cap | n | steps p50 | coupling max p50 | crease edges p50 | degenerate |
| --- | --- | --- | --- | --- | --- | --- |
| easy | none | 50 | 7 | 6 | 32 | 3 |
| mid | none | 50 | 12 | 38 | 148 | 39 |
| hard | none | 50 | 16 | 104 | 407 | 50 |

## Degeneracy flags (recorded, not filtered)

| flag | n | share |
| --- | --- | --- |
| repeated_halving | 0 | 0.0% |
| no_coupling | 0 | 0.0% |
| collapsed | 92 | 61.3% |
| single_angle | 0 | 0.0% |

## Rejected during sampling

| reason | n |
| --- | --- |
| stalled at step 14 | 9 |
| stalled at step 10 | 8 |
| stalled at step 15 | 6 |
| stalled at step 13 | 6 |
| stalled at step 12 | 5 |
| stalled at step 11 | 4 |
| stalled at step 6 | 1 |
| stalled at step 7 | 1 |
| stalled at step 9 | 1 |
| stalled at step 16 | 1 |
| stalled at step 17 | 1 |
| stalled at step 8 | 1 |
