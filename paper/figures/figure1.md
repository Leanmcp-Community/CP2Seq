# Figure 1 — The asymmetry

**Appears in:** §1, Introduction. Should be the first figure a reader meets, ideally on page 1 or 2.

**Argument it carries:** that generating an instance of this task and solving one are not
symmetric operations, and that the gap between them is what makes the domain usable as a benchmark.
This is the paper's foundational claim and it is currently prose only.

## What it shows

Two arrows between the same two objects, drawn so the contrast is immediate.

**Left object:** a flat square sheet.
**Right object:** a crease pattern, the flat sheet covered in creases.

**The downward arrow (generation).** Left to right. Labelled with the cost: one forward pass. Along
it, three or four small thumbnails of the intermediate folded states, showing the stack thickening.
Annotate with `fold, record, fold, record, ... unfold`. This arrow should look calm and mechanical.

**The upward arrow (recovery).** Right to left. Labelled NP hard, with the citation. Instead of a
single path, draw a branching tree fanning out backwards from the crease pattern, most branches
ending in a dead end marker, one path reaching the flat sheet. This arrow should look expensive.

## What it must not show

- **No suggestion that the search is exhaustive or that legal moves are rare.** The branching tree
  illustrates that many paths must be considered, not that few are legal. Drawing mostly-dead
  branches would restate the false claim §3.3 exists to forbid. Dead ends should be a minority of
  the drawn branches.
- No 3D rendering of the folded states. Every intermediate state here is flat; a perspective
  drawing would imply a thickness model the paper does not have.

## How to tell it worked

A reader who looks only at this figure and its caption should be able to say what the task is and
why it is hard, without reading §1. If the figure needs the caption to explain which arrow is the
task, it has failed.

## Caption

> Generating a sample and solving one are not symmetric. Folding forward is a single pass of an
> engine that records what it did. Recovering the sequence from the crease pattern is NP hard. The
> same engine serves as generator and as verifier, so every sample arrives with its own ground truth.
