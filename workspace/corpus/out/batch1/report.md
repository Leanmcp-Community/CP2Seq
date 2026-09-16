# Synthetic Pureland corpus -- pilot batch

120 samples, seed0 20260916, generated 2026-09-16.
coupling cap: none   coupling frac: none   reject filters: none

> Read this before fixing any cut point. Both the coupling strata and the degeneracy
> filters are deliberately unset in this batch -- the numbers below are what they are
> supposed to be chosen from.

## Distribution

| metric | min | p10 | p50 | p90 | max |
| --- | --- | --- | --- | --- | --- |
| steps | 4 | 6 | 12 | 18 | 19 |
| crease edges | 6 | 22 | 127 | 736 | 6080 |
| distinct crease lines | 5 | 10 | 27 | 60 | 188 |
| **coupling max** | 2 | 5 | 34 | 184 | 2048 |
| **coupling mean** | 1.25 | 2.429 | 7.909 | 32.538 | 240.882 |
| coupling total | 5 | 15 | 89 | 511 | 4095 |
| layers final | 6 | 16 | 90 | 512 | 4096 |
| vertices | 11 | 21 | 69 | 289 | 2113 |
| bbox area final | 0.000488 | 0.005859 | 0.03125 | 0.3125 | 0.875 |

## Per stratum

| stratum | cap | n | steps p50 | coupling max p50 | crease edges p50 | degenerate |
| --- | --- | --- | --- | --- | --- | --- |
| easy | none | 40 | 7 | 6 | 34 | 3 |
| mid | none | 40 | 12 | 39 | 134 | 29 |
| hard | none | 40 | 16 | 120 | 422 | 40 |

## Degeneracy flags (recorded, not filtered)

| flag | n | share |
| --- | --- | --- |
| repeated_halving | 0 | 0.0% |
| no_coupling | 0 | 0.0% |
| collapsed | 72 | 60.0% |
| single_angle | 0 | 0.0% |

## Rejected during sampling

| reason | n |
| --- | --- |
| stalled at step 14 | 7 |
| stalled at step 15 | 7 |
| stalled at step 10 | 6 |
| stalled at step 11 | 5 |
| stalled at step 12 | 4 |
| stalled at step 13 | 3 |
| stalled at step 17 | 2 |
| stalled at step 6 | 1 |
| stalled at step 7 | 1 |
| stalled at step 9 | 1 |
| stalled at step 16 | 1 |
| stalled at step 8 | 1 |
