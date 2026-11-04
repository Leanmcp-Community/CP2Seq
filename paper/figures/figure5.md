> **DRAFT IMAGE.** Any version of this figure produced by
> `gen_figures.sh` is a placeholder generated with OpenAI `gpt-image-2`, used only as a
> tracing reference. It will be replaced with a human-authored figure before submission.

# Figure 5 — A refusal as the model receives it

**Appears in:** §8.2, after the tool table.

**Argument it carries:** that a refusal is a diagnosis rather than a dead end, and that legality
here depends on facts about the original sheet that cannot be read off the current picture. This is
the tearing pair of §3.2, which is currently the clearest illustration in the paper and exists only
as prose.

## What it shows

Two states side by side. **They are the same state with the same layer selection.** That identity is
the whole point and should be obvious before the reader reads either label.

Build the state with two folds, exactly as §3.2 describes: fold the right half of a square over to
the left across the vertical midline, giving a two-layer stack joined along the midline. Select the
top layer alone.

**Left, the refusal.** A horizontal fold line through the selected layer. Render it as the harness
returns it:
- the proposed fold line drawn over the current state;
- the named reason, `would-tear`, shown as the literal string the model receives;
- the evidence, which is the crease segment joining the moving face to stationary paper,
  highlighted, and visibly *away from* the fold line and perpendicular to it.

**Right, the legal fold.** A vertical fold line through the same selected layer, accepted, with the
resulting state small beside it. The join to stationary paper lies *on* the fold line, and that
should be visible as the same highlight now coinciding with the line.

Between them, a short annotation: *same state, same layers, opposite verdicts; only the orientation
of the line differs.*

## What it must not show

- Do not invent a refusal reason. Use the strings the environment actually emits: `would-tear`,
  `no-crease`, `nothing-to-move`, `direction-impossible`, `bad-line`.
- Do not draw a self-intersection case. The action space makes that unrepresentable, and §5.3 says
  so explicitly.

## How to tell it worked

The reader should be able to say why the left one tears without consulting the text, and should be
mildly surprised that such a small change flips the verdict. That surprise is the argument.

## Caption

> A refusal is a diagnosis, not a boolean. The same state and the same layer selection give opposite
> verdicts depending only on the orientation of the fold line, because adjacency on the original
> sheet survives folding and cannot be recovered from the current positions of the polygons alone.
