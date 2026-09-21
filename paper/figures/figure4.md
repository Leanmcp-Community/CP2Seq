> **DRAFT IMAGE.** Any version of this figure produced by
> `gen_figures.sh` is a placeholder generated with OpenAI `gpt-image-2`, used only as a
> tracing reference. It will be replaced with a human-authored figure before submission.

# Figure 4 — The evaluation pipeline

**Appears in:** §8.1, after the episode pseudocode.

**Argument it carries:** three structural facts that the prose states but that a diagram settles:
the environment and the verifier are one object; a refusal loops back without advancing; and the
reference sequence sits outside the loop entirely.

## What it shows

Left to right.

**Left, the inputs.** Two boxes: the crease pattern, and the final folded state. Both marked as
given to the model.

**Centre, the loop.** A cycle with three stations.
1. *Model proposes a fold.* Annotate with what it has: the inputs, the current observation, the
   history, and whichever tools its tier allows.
2. *Environment steps.* **Drawn as a single box labelled with both names, environment and verifier.**
   Not two boxes, not a box with a second box inside it. This is the point of the figure.
3. The step has two outgoing edges. **Success** carries a new state plus the two rendered views on
   to the next iteration. **Refusal** carries a named reason and loops back to the model *without*
   the state changing. Draw the refusal edge returning to station 1 at the same state, and label it
   so the reader sees it costs a query and buys no progress.

**Right, termination and scoring.** The model's sequence and the reference sequence both enter a
replay box, and the two replayed states are compared at Level 1 and Level 2.

**The withheld boundary.** A dashed enclosure around the intermediate frames and `seq.json`, sitting
outside the loop and connecting only to the replay box on the right. Label it *withheld during the
episode*.

## What it must not show

- The environment must not appear to search, rank, or suggest. No edge from the environment to
  anything except the state or the refusal.
- `seq.json` must have no edge into the loop. If it touches the model at any point the figure
  contradicts the paper.

## How to tell it worked

Ask someone to point at the verifier. If they point at a box that is also the environment, it
worked. If they look for a second box, redraw it.

## Caption

> One episode. The environment and the verifier are the same object, so stepping it is the same act
> as asking for a verdict. A refusal returns a named reason and costs a query without advancing the
> episode. The reference sequence never enters the loop; it is replayed only at scoring time.
