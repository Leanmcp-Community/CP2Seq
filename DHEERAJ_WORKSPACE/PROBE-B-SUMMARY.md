# Probe B — what it found and what it means

2026-09-15. Summary of `notes/probes/` Probe B + the code in `workspace/probe-b/`.

## One sentence

The cheap feasibility check is perfect at the terminal-state layer — **because that layer isn't
hard, not because the check is clever.** So the paper's difficulty can only live in the sequence layer.

## Setup

Flat-Folder doesn't fold paper. Given a CP with M/V fixed, it asks: **is there a consistent way to
stack the layers?** Each variable in `BA` is a pair of overlapping faces; its value (1 or 2) says
which is on top; `0` = undecided. `BA0` = the orderings the creases themselves force. Constraints
are the four types (`taco-taco`, `taco-tortilla`, `tortilla-tortilla`, `transitivity`) = "paper
can't pass through paper." A valid flat-folded state = a complete assignment satisfying all of them.

This is a question about the **final stack**. It has no notion of how you got there. That is the
whole punchline.

## Two oracles

| | Function | What it does |
| --- | --- | --- |
| **Propagation** (cheap) | `SOLVER.initial_assignment` | unit propagation only — no search |
| **Complete** (expensive) | `get_components` + `SOLVER.solve` | real search with backtracking |

Propagation is **sound but incomplete**:
- **sound** — if it says CONFLICT the state really is dead; it can never false-prune
- **incomplete** — it can *pass* a doomed state whose contradiction is a few inferences deep

So it can only be wrong in one direction. **"Positive" = "still looks feasible."** A false
positive = waved through a corpse. 0% FP therefore means **the incompleteness gap measured as zero.**

Why we wanted this: (1) the cheap one is a free, LLM-free pruning baseline; (2) the complete one is
the pruning ground truth and the `j` in backtrack error `|i − j|`.

## Three experiments

| | Result |
| --- | --- |
| 12 real unsatisfiable CPs (`examples/unsatisfiable/`) | **12/12 caught, 0% FP** |
| 4,520 random partial assignments, 2,158 genuinely unsat (seed 20260914) | **0 FP** |
| 612 CPs, dead ends counted during search (`SOLVER.propagate` → `[]`) | **95.1% reach first solution with zero backtracking**; 120 dead ends total; worst CP 16 |

Experiment 3 is the diagnostic: two clean sweeps are suspicious, so it tested the alternative
explanation — *maybe these instances never need search at all, so nothing can be missed.*
**It wasn't ruled out. It was confirmed.**

## The chain

1. The terminal-state problem barely needs search.
2. A free, sound algorithm already handles it with no measurable gap.
3. → **An LLM can add nothing at the terminal layer.** Any comparison there ties with a function call.
4. → "% solved" (terminal match) scores the easy half. Hence the metric inversion: sequence level
   becomes primary, terminal match becomes an admission gate.

Consistent with T4 (simple foldability is NP-hard) and "states ≠ sequences." The hardness was never
in finding a valid stack — it's in finding an *order of folds* that produces one.

## ⚠️ The line that matters most

Propagation checks **layer-order consistency**, not **simple-fold realizability**:

- layer-order consistency = can these faces be stacked without penetration → what measured 0%
- simple-fold realizability = can this be *reached* by folding along a full line, all layers, one
  fold at a time → our action space, NP-hard, **untouched by Probe B**

**The 0% does not transfer.** It must be re-measured on the sequence layer, and it probably won't
hold — which is the point. The cheap oracle's incompleteness gap is the *only* place LLM pruning
can pay for itself. At the terminal layer that gap was zero. At the sequence layer it should be
real. If the LLM can't close part of it, the query-efficiency claim has nothing to stand on.

## Why the harness section isn't filler

Two of the three traps produce *plausible wrong numbers*, not errors:
- `initial_assignment` and `guess_vars` **mutate `BA` in place** — forget `.slice()` and every trial
  inherits the last one's commitments
- `batch.js`'s conflict test `out[0].length==undefined` misfires at `BF.length===3` (upstream bug;
  worked around with `Array.isArray(out[1])`)

(The third — missing `CON.build()` — throws loudly, so it's harmless.) Validating against the
author's CSV first (grids 14/14, instagram 13/14, the one mismatch traced to `limited=10000`) is
what earns the right to report the rest.

## Limits — and they all point the same way

**Random commitments are not sequence prefixes.** A real prefix fixes a structured, correlated block
of variables; random picks either collide immediately or don't interact. Plus: exp. 1's
counterexamples are unsat under *full* M/V (easier than a prefix dead end), CP size ≤600 / ≤400
faces, first-solution paths only, corpus biased toward CPs Flat-Folder handles well.

Every limit makes the test *friendlier*. Even so the answer is "the terminal layer is easy" — which
makes the conclusion stronger, not weaker.
