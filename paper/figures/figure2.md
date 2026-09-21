> **DRAFT IMAGE.** Any version of this figure produced by
> `gen_figures.sh` is a placeholder generated with OpenAI `gpt-image-2`, used only as a
> tracing reference. It will be replaced with a human-authored figure before submission.

# Figure 2 — One dataset sample, end to end

**Appears in:** §4.6, after the table of what a sample carries.

**Argument it carries:** what the model is given and what is withheld. The distinction between
`cp.fold` plus the final frame (input) and `seq.json` (ground truth) is the single most important
thing a reader must get right about the task, and one glance should settle it.

## What it shows

Three panels, left to right, on one easy sample. Pick a sample with four or five folds so every
step fits.

**Left panel, the crease pattern.** `cp.fold` rendered flat. Mountain and valley creases visually
distinguished, using line style rather than colour alone so the figure survives greyscale printing.
Label it **input**.

**Centre panel, the final folded state.** The last frame of `steps.fold`, drawn twice, exactly as the
harness renders it for the model: the top-down X-ray of the stack, and the exploded layer view
beneath or beside it. Label it **input**. This panel is important because it shows that the model's
visual channel is layer structure, not a photograph.

**Right panel, the recorded sequence.** `seq.json` as a strip of small diagrams, one per fold, in
order. Each shows the state before the fold, the fold line, and the layers that moved, with the
coupling of that fold printed beneath. Label it **withheld: ground truth**.

A visible boundary between the centre and right panels, dashed or shaded, carrying the word
*withheld*.

## What it must not show

- No intermediate frames in the input panels. Only the final frame is given, and drawing the
  intermediates on the input side would misstate the task.
- Do not draw the right panel as if it were a solution the model produced. It is what the generator
  recorded.

## How to tell it worked

Cover the labels. A reader should still be able to point at the boundary and say which side the
model sees.

## Caption

> One CP2Seq sample. The crease pattern and the final folded state are given to the model. The fold
> sequence on the right is what the generator recorded and is never shown; it is used only at
> scoring time, and then only by replaying it.
