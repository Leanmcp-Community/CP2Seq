> **DRAFT IMAGE.** Any version of this figure produced by
> `gen_figures.sh` is a placeholder generated with OpenAI `gpt-image-2`, used only as a
> tracing reference. It will be replaced with a human-authored figure before submission.

# Figure 3 — The difficulty grid

**Appears in:** §4.7, beside the two limits.

**Argument it carries:** that difficulty is stratified deliberately along two axes, and that one
corner of that grid is unreachable by this action space. The second half is the honest half and is
the reason to draw it: the figure shows what the benchmark *cannot* express.

## What it shows

A two-dimensional grid. **Fold depth** on one axis, **coupling** on the other, binned into the
strata the generator actually uses. Each cell shaded by how many samples landed in it, with the
count printed in the cell.

The long-sequence low-coupling corner must read as **empty**, visibly different from a cell that is
merely sparse. Give it a distinct treatment, hatching or an outline rather than the lightest shade
on the same scale, so it cannot be mistaken for a low count.

Annotate that corner directly on the figure with a short label: *unreachable without pre-creasing*.

## What it must not show

- Do not interpolate or smooth between cells. This is a count of a discrete stratification, not a
  density estimate.
- Do not draw the empty corner as a failure of the corpus. It is a property of the action space, and
  the annotation should say so.

## How to tell it worked

A reviewer looking for the benchmark's scope limits should find this figure before they find the
limitations section, and should come away with the right sentence: every all-layers fold thickens
the stack, so a long sequence cannot keep cutting few layers, and real folders reach that corner by
pre-creasing, which this action space excludes.

## Caption

> The difficulty grid. Depth and coupling are set by the sampler rather than measured after the
> fact. The empty corner is long sequences at low coupling, which this action space cannot reach:
> every all-layers fold thickens the stack, and pre-creasing, the operation real folders use to
> reach that corner, is excluded.
