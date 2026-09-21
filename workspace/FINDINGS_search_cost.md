# What breadth-first search over the legal-fold enumerator actually costs

Measured on the release corpus (200 easy / 100 mid / 100 hard) against the enumerator merged
in PR #35. Every number below is measured or fitted from measurement; extrapolations are
marked as such.

Reproduce with:

```sh
bash workspace/measure_depth_wall.sh      # search depth reached per time budget
bash workspace/profile_enum_cost.sh       # cost of one list_legal_folds call, per depth
node workspace/check_prefilter.mjs easy-0003 mid-0001   # the shortcut's equivalence and speedup
node workspace/figures/make_depth_wall_figure.mjs \
  --data workspace/depth_wall/depth_wall.csv --enum workspace/enum_cost/enum_cost.json
```

## 1. The cost is a product of two exponentials, not one

PR #35 reasons about the frontier growing as `b^d` with `b ≈ 3.5`, which assumes every node
costs about the same to expand. It does not.

```
t(d) = b^d  ×  c0·g^d  =  c0·(b·g)^d
       nodes    cost of expanding one node
```

`b` is the deduplicated branching factor, measured as `generated / expanded` over searches
that exhausted their budget. `g` is the per-fold growth in enumeration cost, fitted by least
squares on `log(ms)` against depth along each sample's reference sequence.

| tier | b | g | **b·g** | mean reference depth |
| --- | --- | --- | --- | --- |
| easy | 2.72 | 1.5–2.0 | **4.1–5.4** | 6.8 |
| mid | 3.15 | 1.6–1.7 | **5.0–5.3** | 12.0 |
| hard | 7.05 | 1.58 | **11.1** | 19.0 |

Fitted over the 1s, 4s, 15s, 60s and 240s budgets. Adding the 240s budget moved `b` by less
than 0.3 on every tier (easy 2.71 → 2.72, mid 3.34 → 3.15, hard 7.33 → 7.05), so the fit has
converged and the two longest budgets the batch never reached would not change it.

The published figure of 3.51 legal folds per state matches **mid** and only mid. Easy is
lower (2.72) and hard is more than double it (7.05; hard-0001 alone is 12.8).

Throughput collapses in step: easy averages 48.5 node expansions per second, hard 2.9. At
depth 10 one `list_legal_folds` call on hard-0001 takes **140 seconds**.

## 2. Why per-node cost is exponential

The enumerator evaluates exactly

```
evaluated = 4 × lines × stack_size
```

candidates per call. This is an identity, not a fit: it held to the digit at all 13 sampled
states. The 4 is two `move_positive` values times the two-per-layer selection count.

The two factors behave completely differently:

- **`lines`** is set by the crease pattern and barely grows with depth — hard-0001 goes from
  188 to 356 over nine folds. The double deduplication does its job: 5340 M/V edges collapse
  to 188 distinct lines, and hard-0043's 24448 edges collapse to 380. **CP size is not the
  problem.**
- **`stack_size`** grows geometrically, ×1.6–2.0 per fold, because folding all layers doubles
  them. Measured: easy-0108 goes 1, 2, 4, 8, 12, 19, 32, 64, 128, 256, 512 over ten folds.

So the layer count, not the crease pattern, is what makes deep states expensive.

## 3. Projected time to reach each sample's reference depth

No extrapolation is needed for the layer count: the corpus states each sample's final folded
form, so `stack_size` at the reference depth is a measured quantity. The cost of the last
level is then `4 · lines · final_layers · µs_per_candidate`, and the total is `b^d` times it.

| sample | b | final layers | one enumeration there | BFS to reference depth |
| --- | --- | --- | --- | --- |
| easy-0003 | 2.72 | 48 | 0.2 s | 1.5 hours |
| easy-0108 | 2.72 | 512 | 36 s | 9.1 days |
| mid-0001 | 3.15 | 128 | 1.9 s | 6.5 days |
| mid-0030 | 3.15 | 512 | 59 s | 5.7 years |
| hard-0001 | 7.05 | 3504 | 47 minutes | 1.2 × 10¹² years |

**The saturation question is settled, and the answer is "somewhat".** For every sample
profiled to its full depth, the geometric fit reproduced the corpus's final layer count
exactly (48, 512, 128, 512). Only hard-0001 was truncated, at depth 10, and there the fit
overshoots: extrapolating its measured 1.67× per fold to depth 19 predicts 16151 layers where
the corpus has **3504**, a 4.6× overestimate. Its true growth over the whole sequence is
1.537× per fold, so the stack does decelerate once the paper is thick.

Correcting for it roughly halves the projection — 2.8 × 10¹² years becomes 1.2 × 10¹² — and
changes nothing else. The figures in §7 should be read as the measured-stack column above.

hard-0001 also has 188 lines against a hard-tier median of 59, so it sits near the tier's 90th
percentile; a typical hard sample is perhaps 3× cheaper per node, which again changes nothing
that matters.

## 4. Tier label does not predict cost

Distinct CP lines per tier:

| tier | min | p25 | median | p75 | max |
| --- | --- | --- | --- | --- | --- |
| easy | 4 | 8 | 12 | 17 | 60 |
| mid | 15 | 23 | 28 | 38 | 60 |
| hard | 19 | 42 | 59 | 86 | 380 |

`easy-0108` has 60 lines and needs 9.2 days — more than `mid-0001`. Two of the 200 easy
samples are in that class.

The twelve easy samples the deterministic arm used average 12.3 lines against an easy-tier
median of 12, so **that 8/12 result is representative and not a cheap-end selection.** An
earlier suspicion to the contrary was checked and is wrong.

## 5. The cheap-rejection shortcut: correct, and worth far less than the counts suggest

85–98% of candidates are rejected as `nothing-to-move` or `no-crease`, rising monotonically
with depth to 100%. Both mean the fold creases nothing, which is decidable from each layer's
projection onto the fold normal without splitting a polygon. That shortcut is implemented in
`legal_folds.mjs` behind the `prefilter` option (default on) and verified by
`check_prefilter.mjs`: **every state returns a byte-identical enumeration with it on and off**,
so the "any listed action is accepted verbatim by add_fold" guarantee is untouched.

It catches 76–87% of those rejections, about 78% of all candidates.

**But it buys only 1.1–1.4× overall.** An earlier estimate of "up to 11×, up to 50×" was
computed as `1 / (1 - cheap_share)`, which silently assumes every candidate costs the same.
They do not: candidates that miss the selection bail out early, while the survivors pay for
the tearing check and the per-crease CP comparison. Skipping 78% of candidates saved 19% of
wall clock, so the counts overstate the achievable speedup by roughly 4×.

Where it does pay is the terminal states, which have no legal fold at all and are therefore
100% cheap: **16.1× on easy-0108 at depth 10, 6.6× on mid-0001 at depth 11.** Those are
exactly the dead ends the `--stuck-limit` guard exists for, so the shortcut is worth keeping
for episode latency even though it does not move the search wall.

Consequently the feasibility boundary does **not** move into mid. mid-0001 goes from 12 days
to about 10 days, not to 15 hours.

What is left is the surviving 22%: the `would-tear` adjacency test, which is pairwise over
moving and stationary faces, and the per-crease CP comparison. Those are where any further
constant-factor work has to go.

## 6. Consequences for the paper

1. **Do not headline the easy tier.** Effective base 4.0–5.5 at depth 6.8 means BFS solves it
   in seconds to minutes. It does not measure origami reasoning.
2. **mid is where the comparison has tension.** BFS needs 12 days to 10 years there against a
   model's 80-turn budget, so every mid sample a model solves is something search cannot do at
   any reasonable cost. This is a stronger claim than the easy comparison, not a weaker one.
3. **The 120s default in `run_deterministic*.sh` is wasted on mid and hard.** Measured, 120s
   reaches depth 8.7 on easy (needs 6.8), 6.7 on mid (needs 12) and 2.9 on hard (needs 19).
   Report the projection instead of burning machine time on guaranteed timeouts.
4. **Tool latency is an uncontrolled variable on hard.** One `list_legal_folds` call at depth
   10 of hard-0001 takes 140 seconds, and `--timeout` governs only the model call, not the
   simulator. Hard episodes' wall-clock is dominated by a cost nobody has recorded.

## 7. Figure caption

> **Figure N. Breadth-first search time against fold depth.** Log-scale vertical axis. Curves
> are t(d) = c0·(b·g)^d, where b is the deduplicated branching factor (measured as
> generated/expanded during search) and g is the per-fold growth in the cost of one legal-fold
> enumeration (least squares on per-depth timings along each sample's reference sequence).
> Both are exponential: the node count grows as b^d while the cost of expanding one node grows
> as g^d, because an all-layers fold doubles the sheet's layers and one enumeration evaluates
> exactly 4·(distinct crease lines)·(layers) candidate actions. Diamonds mark each tier's mean
> reference depth; circles are observed solves. Fitted from 5 time budgets × 12 samples of
> search and 6 samples × full depth of enumeration timing.

**The committed `depth_wall.svg` and `.tex` are the b^d lower bound**, not the curve above:
the enumeration timings exist as `enum_cost.txt` but the machine-readable `enum_cost.json`
was lost when that run was interrupted, and the generator refuses to guess. Re-run
`profile_enum_cost.sh` (now one pass, flushing JSON per sample) and regenerate with `--enum`
to get the published curve. The generator prints which model it used, and the figure files
carry it in their header, so the two cannot be confused.

## 8. Not yet measured

- `hard-0043` (24448 edges, 380 lines) — the extreme point, never profiled to completion.
  It would confirm that CP size stays a constant rather than a driver; §2 already supports
  that from hard-0001 and the line-count distribution, so this is corroboration, not a
  load-bearing gap.
- The 960s search budget. `b` moved by less than 0.3 when 240s was added, so this would not
  change a number.

Resolved since first writing: whether `stack_size` saturates (§3 — it does, mildly, and the
corpus's own final layer counts remove the extrapolation entirely), and the 240s budget.
