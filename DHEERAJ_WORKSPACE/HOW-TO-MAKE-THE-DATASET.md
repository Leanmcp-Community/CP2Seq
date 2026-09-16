# How to build the dataset yourself

2026-09-15. Design + working generator for the synthetic Pureland corpus (`DATASET.md` §0 /
checklist §I.0). Code: `corpus/gen.mjs`. **Nothing generated yet — run it when you're ready.**

## The idea

Don't try to label CPs with sequences. **Fold forward and write down what you did.**

```
square → random simple fold → ... → folded state → unfold → CP
         └──────── record the sequence ────────┘
```

Generation is trivial; the inverse (CP → Seq) is the hard one. That asymmetry is exactly what a
benchmark should have. Ground truth is **built, not annotated** — nothing to label, nothing to trust.

## Representation (the part that makes it work)

The paper is a **list of layers, bottom → top**. Each layer carries:
- `poly` — its polygon in the *current folded* plane
- `X` — the isometry mapping **original square coords → current coords**

An all-layers simple fold along line `L`, folding side `s` over:
1. split every layer's polygon by `L`
2. reflect the pieces on side `s` across `L`; their `X` becomes `Reflect∘X`
3. **reverse the moved pile and stack it on top of the kept pile** ← the only subtle line
4. any layer cut into two pieces got creased: pull the cut segment back through `X⁻¹` to get the
   crease in **original paper coordinates**; M/V from whether that layer is currently face-down

Two things fall out for free:
- **The CP's faces are the final layers' preimages.** No planar-arrangement code needed — unfolding
  is just applying `X⁻¹` to each layer.
- **The terminal state with layer ordering** is the layer list itself. So you get bucket A *plus*
  the layer-order ground truth PurelandFold has.

## Exact arithmetic, deliberately

All coordinates are BigInt fractions. Fold lines are only ever a **perpendicular bisector of two
existing vertices** ("bring point to point" — the classic fold) or a **line through two existing
vertices**. Reflection across such a line maps rationals to rationals, so the whole pipeline is
exact: no epsilon, no snapping, and none of the `precision: no stable graph` failures that bite
Flat-Folder's importer.

## Built-in correctness check

`preimage_area == 1`: the final layers' preimages must tile the original square exactly. If a fold,
a reflection or a transform inverse is wrong, this breaks immediately. It passed 5/5 on the smoke
test. Second check: `unassigned_edges == 0` — every interior edge of the CP must trace back to a
recorded crease.

## Output per sample

| File | Contents |
| --- | --- |
| `cp.fold` | the crease pattern — vertices / edges / M-V-B assignment / faces |
| `sequence.json` | per step: crease segments (float + exact rational), M/V, `moved_fraction`, `layers_after` |
| `terminal.json` | final stacking order + each layer's polygon in original coords |

## Running it

```sh
cd DHEERAJ_WORKSPACE/corpus
N=300 MINS=3 MAXS=10 OUT=../corpus-batch1 node gen.mjs
```

`N` samples, step count drawn from `[MINS, MAXS]`, seeded (`SEED`) so it's reproducible. Omit `OUT`
to print stats without writing files.

## ⚠️ The open question — and the smoke test already shows it

`DATASET.md` §0 says to decide the sampling distribution *after* looking at batch 1, specifically to
avoid a corpus of degenerate cases like repeated halving. On a 5-sample smoke test:

**52.4% of folds were exact halvings** (`moved_fraction ≈ 0.5`).

That's the predicted failure mode, showing up immediately. Cause: uniform sampling over candidate
lines, and perpendicular bisectors of the square's own corners are halving folds. Three fixes worth
trying before committing to a distribution:

1. **Down-weight** lines whose `moved_fraction` is near 0.5
2. **Weight toward lines that cut more layers** — those create the non-local dependencies that make
   CP → Seq hard, and it's the axis where PurelandFold is ~20× narrower than instagram
3. **Reject folds whose crease set duplicates an earlier step's**, which is what repeated halving
   really is

Don't pick one from the armchair — generate a batch under each and compare the step /
non-local-dependency distributions against instagram's, which is the spread you're trying to cover.

## Then

- Difficulty axis = step count, same unit as PurelandFold's `step` (5–21), so the synthetic corpus
  and the real anchor stay directly comparable.
- Validate by round-tripping `cp.fold` through Flat-Folder: every generated CP is flat-foldable by
  construction, so a solver failure means a generator bug. ⚠️ **Flat-Folder's source is no longer on
  this machine** (`~/Downloads/flat-folder-main` is gone), so `workspace/probe-b` won't run either
  until it's cloned again.
