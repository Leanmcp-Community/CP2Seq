> **DRAFT IMAGE.** Any version of this figure produced by
> `gen_figures.sh` is a placeholder generated with OpenAI `gpt-image-2`, used only as a
> tracing reference. It will be replaced with a human-authored figure before submission.

# Figure 6 — Main result per stratum

**Appears in:** §10.

**Status: blocked.** Draw only from the output of `python3 workspace/aggregate_results.py`. No point
on this chart comes from anywhere else.

**Argument it carries:** how solve rate moves with difficulty, and where each model sits relative to
search rather than only relative to the other models.

## What it shows

Solve rate on the vertical axis, difficulty stratum on the horizontal (easy, mid, hard, in that
order). One line per model.

**The deterministic baseline is drawn as a distinct reference line**, not as another model: different
line style, no marker from the model palette, labelled directly on the plot rather than only in the
legend. It is the thing the models are being measured against, and a legend entry that looks like a
sixth model invites the reader to average it in.

**Attempt counts printed at every point.** The run coverage is uneven: `gpt-5.6-luna` carries most
of it and several models appear in only a few runs. A point from four attempts and a point from
forty must not look alike. If printing every count is too noisy, vary marker size with attempt count
*and* print the counts in a small table beneath.

**Error bars or a spread band** wherever a model was run more than once on the same stratum. A single
run is not a measurement, and the figure should not imply otherwise.

## What it must not show

- **Do not hide a baseline crossing.** If deterministic search meets or exceeds the models on the
  easy stratum, that crossing is the most informative thing on the chart and must be plainly
  visible. It is not a bad result; it is the benchmark telling you which stratum measures reasoning.
- Do not pool strata into a single overall bar in this figure. Pooling is what the per-stratum
  reporting exists to prevent.
- Do not connect points across models with a shared trend line, and do not extrapolate past hard.

## How to tell it worked

A reader should be able to answer two questions from the figure alone: which stratum separates the
models, and whether any model beats blind search there.

## Caption

> Solve rate per difficulty stratum at the full tool tier. The deterministic breadth-first baseline
> is drawn as a reference line rather than as a model. Attempt counts are printed at each point
> because run coverage is uneven across models.
