# Synthetic Pureland corpus -- pilot batch

400 samples, seed0 20260917, generated 2026-09-16.
coupling cap: none   coupling frac: none   reject filters: none

> Read this before fixing any cut point. Both the coupling strata and the degeneracy
> filters are deliberately unset in this batch -- the numbers below are what they are
> supposed to be chosen from.

## Distribution

| metric | min | p10 | p50 | p90 | max |
| --- | --- | --- | --- | --- | --- |
| steps | 3 | 3 | 5 | 6 | 6 |
| crease edges | 3 | 5 | 14 | 30 | 52 |
| distinct crease lines | 3 | 4 | 7 | 12 | 18 |
| **coupling max** | 1 | 2 | 4 | 8 | 16 |
| **coupling mean** | 1 | 1.333 | 2.25 | 3.75 | 6.2 |
| coupling total | 3 | 4 | 10 | 20 | 35 |
| layers final | 4 | 5 | 11 | 21 | 36 |
| vertices | 7 | 10 | 16 | 24 | 35 |
| bbox area final | 0.0625 | 0.1875 | 0.375 | 0.75 | 1 |

## Per stratum

| stratum | cap | n | steps p50 | coupling max p50 | crease edges p50 | degenerate |
| --- | --- | --- | --- | --- | --- | --- |
| v3 | none | 100 | 3 | 2 | 7 | 9 |
| v4 | none | 100 | 4 | 4 | 12 | 6 |
| v5 | none | 100 | 5 | 4 | 17 | 0 |
| v6 | none | 100 | 6 | 6 | 25 | 0 |

## Degeneracy flags (recorded, not filtered)

| flag | n | share |
| --- | --- | --- |
| repeated_halving | 0 | 0.0% |
| no_coupling | 15 | 3.8% |
| collapsed | 0 | 0.0% |
| single_angle | 0 | 0.0% |

## Rejected during sampling

| reason | n |
| --- | --- |

## Pure search over the corpus (budget 1000000 queries)

The corpus does not depend on this -- every sample is ground truth by construction.
This only labels the subset the pure-search baseline curve can be drawn on.

| stratum | SOLVED | TIMEOUT | EXHAUSTED | other |
| --- | --- | --- | --- | --- |
| v3 | 100 | 0 | 0 | 0 |
| v4 | 100 | 0 | 0 | 0 |
| v5 | 100 | 0 | 0 | 0 |
| v6 | 99 | 1 | 0 | 0 |

queries to solve: p10=88 p50=1642 p90=55434

deepest SOLVED sample: 6 steps -- anything past this is where pure search stops being a usable baseline.

⚠️ EXHAUSTED on a sample we folded ourselves would be a SOLVER BUG, not a finding.
