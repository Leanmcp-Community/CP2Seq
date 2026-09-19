# Dataset — the synthesised fold corpus

2026-09-14, rewritten 2026-09-17 when the outside sources were removed.

**The project generates its own data and takes none from outside.** Fold forward from a square
with random simple folds, record the sequence, unfold to get the crease pattern. Everything below
describes that corpus.

Earlier revisions of this file inventoried outside sources — patterns scraped from the wild, the
PurelandFold sequence set, published CP/QA benchmarks. All of them are gone, along with every
script that fetched, converted or measured them. Generation is cheap and exactly controllable, so
difficulty can be stratified rather than sampled and hoped for, and every sample carries its
sequence instead of a pattern and a guess.

**Owns: where the data comes from.** How the experiment runs is `EXPERIMENTS_SETUP.md`; which
decisions are frozen is `notes/plan/experiment-spec-checklist.md`. Nothing is restated across
them.

Bucket reminder:

| Bucket | Has |
| --- | --- |
| A | CP + full step-by-step sequence |
| B | CP + final result only, no intermediate steps |
| C | CP only, no ground truth |

---

## 0. Synthesized Pureland corpus — **the main data, generated**

- **Link**: none — we generate it. `workspace/corpus/`, design in `notes/plan/corpus-plan.md` (a).
- **Method**: start from a square, apply random simple folds forward, record the sequence, unfold
  at the end to obtain the CP. **Generation is trivial; the inverse problem (CP → Seq) is the
  hard one** — which is exactly the structure a benchmark should have.
- **Ground truth**: **bucket A by construction.** The (CP, sequence) pair is built, not labelled,
  so there is nothing to annotate and nothing to trust.
- **Size**: run `v2`<!--fact:corpus.synth.run--> — **322**<!--fact:corpus.synth.samples--> samples across **8**<!--fact:corpus.synth.cellsFilled--> of 9<!--fact:corpus.synth.cellsTotal--> difficulty cells,
  322<!--fact:corpus.synth.uniqueCPs--> distinct CPs after deduplicating the square's 8 symmetries. Steps 4<!--fact:corpus.synth.stepMin-->–19<!--fact:corpus.synth.stepMax-->,
  median 61<!--fact:corpus.synth.creaseP50--> creases. **Not committed** — 95 MB that rebuilds byte-identically from its
  seed; `workspace/corpus/corpus-summary.json` carries the numbers this file cites.
- **Difficulty control**: two axes, both set by the sampler rather than measured afterwards.
  **Steps** is the frozen main axis. **Coupling** — creases made per fold, i.e. how many layers
  one fold cuts — is capped per stratum, and is simultaneously Learn2Fold's non-local dependency
  and the closest measurable proxy for by-hand difficulty.
- **The step cut points** are ours: range 4–19 folds with tertiles ≤10 / 11–13 / >13. They were
  once calibrated against an outside corpus; that dependency is gone, so the span is now simply
  what the generator covers, split in three.
- **The coupling axis spans 0–64, median 4.2.** Span was chosen deliberately: a narrow coupling
  range is not a difficulty axis at all. Report it beside the circularity risk in
  `notes/plan/corpus-plan.md`, not buried.
- ⚠️ **One cell is empty by measurement**: long sequences at low coupling yield 2<!--fact:corpus.synth.lLocalHits--> hits in
  16,000 attempts. Every all-layers simple fold thickens the stack, so a long sequence cannot
  keep cutting few layers. Real folders reach that corner by **pre-creasing** — F-edge counts
  across four reference CPs run 0 / 6 / 8 / 18 as the models lengthen — which is exactly the
  operation we excluded. The longer a real Pureland model runs, the more of it sits outside the
  action space.
- **Degeneracy**: 33.2%<!--fact:corpus.synth.degeneratePct--> of samples carry a flag, almost all `collapsed`. **Recorded, never
  filtered**: the flag rate tracks the coupling cap monotonically, so filtering on it would
  delete the high end of the axis we deliberately vary.
- **Why this exists**: an inverse problem whose forward direction is trivial gives difficulty that
  is controllable and ground truth that is free. Synthesis is also the field's normal practice,
  not a shortcut — the comparable published corpora are largely produced by their authors' own
  symbolic simulators (`notes/plan/corpus-plan.md`).

### The release corpus (2026-09-17)

`workspace/corpus/out/release/`, 600 samples in five batches under one merged manifest, 40MB over
2,410 files. Rebuild end to end — clear, generate, merge, verify, index — with
`bash workspace/corpus/run-regenerate.sh`.

| | n | with a SOLVED verdict | folds |
| --- | --- | --- | --- |
| all-layers / generated | 400 | 0 | 4–19 |
| some-layers / **verified** | 100 | 100 | 3–4 |
| some-layers / generated | 100 | 0 | 5–6 |

The all-layers 400 are stratified easy 200 / mid 100 / hard 100 on PurelandFold's action-space
tertiles (4–10 / 11–13 / 14–19), with the quotas carried per stratum in `strata-release.json` so
that one invocation covers all three — the isomorphic-duplicate table is per-invocation, and
splitting the run would stop duplicates across strata being caught.

⚠️ **The deep some-layers end (7–9 folds) is not in this corpus, and its absence is a loss rather
than a tidy-up.** Earlier releases ran that tier to nine folds precisely because the difficulty
the benchmark is about lives past the depth the solver reaches. It is also where nearly all the
generation time went — hours, against minutes for everything else. Restoring it is four lines in
`run-regenerate.sh` and a long wall-clock, not a redesign.
`workspace/corpus/out/release/`, ~1,050 samples in nine batches under one merged manifest.

Rebuild: `bash workspace/corpus/run-release.sh` then `node workspace/corpus/merge-release.mjs`.


- **Every sample is correct by construction** — produced by folding, and the pattern is what the
  folding left behind. There is no verified/generated split. The previous one recorded whether a
  search could re-derive the sequence inside a budget, which capped the "verified" half at about
  five folds and made it, by measurement, entirely easy. **The difficulty this corpus is about
  lives past that depth**, so splitting on it was splitting on the wrong thing.
- The check that runs is `verify-replay.mjs`: replay each recorded sequence, confirm it reproduces
  the pattern beside it. O(folds), so it covers every sample at every depth.
- Scale ~1,000 was chosen against the published comparables (GamiBench 372, OrigamiSpace 350).

### 🛑 HOW TO SCORE THIS CORPUS — the recorded sequence is **a** solution, not **the** solution

**Measured on the release batch: 2<!--fact:shorter.release.n--> of the 100<!--fact:shorter.release.outOf--> verified samples have a sequence one fold SHORTER
than the one that built them** — `some-verified-d3/layers-0028` (3 folds → 2) and
`some-verified-d4/layers-0005` (4 folds → 3), both carried in `manifest.json` as
`counts.shorter_sequence_known`. The generator does not search; it folds, so nothing makes its
sequence minimal.

⚠️ **Two is a floor set by how little of this corpus is verified, not a rate.** The check needs the
solver, so it can only run on the 100 verified samples; the other 500 have never been looked at.

> **The paper cites 2 of 100 and nothing else.** An earlier, larger release verified 700 and found
> 30, with the share apparently rising steeply with depth (1/100 at three folds, 11/100 at five,
> 10/99 at six). ⚠️ **That release has been regenerated away and the solver that produced those
> verdicts was removed, so nothing in this repo can recompute them.** They are recorded under
> `shorter.retired` in `notes/facts.json`, marked `not reproducible`, and are to be cited — if at
> all — as a prior observation that motivated the rule below, never as a measured rate of this
> corpus. Restoring the number means restoring the deep tier and a search, which is
> `run-regenerate.sh` plus hours of wall-clock, not a citation fix.

The rule below is written for the behaviour that observation suggested, and it holds regardless:
even one shorter sequence is enough to break step-wise scoring.

Three rules follow, and the first is the one that silently corrupts results:

1. **Never compare a proposed sequence step-by-step against the recorded one.** A model that
   finds a shorter correct sequence would be marked WRONG. Judge by **replaying** the proposed
   sequence through the engine and comparing **crease sets** — the standard PR #13 set, equal
   rather than overlapping.
2. **Step count is not a correctness signal.** A shorter correct sequence is a better answer, not
   a wrong one. Nothing in the corpus claims the recorded sequence is minimal — the generator
   folds, it does not search — and no minimal-length label is shipped, because producing one
   would mean running a search the project no longer has.
3. **Compare crease sets, not steps.** Equal, not overlapping.
4. **Both sides get replayed. Never score against `steps.fold`.** Decided 2026-09-18. Scoring
   replays the model's sequence AND the recorded one through the engine, and compares the two
   live states. `steps.fold` is for viewing and for Fold Studio playback, not for judging.

   ⚠️ **The reason is a gap in the file format, not a preference.** `steps.fold` frames carry each
   face's position in the CURRENT plane and nothing about which piece of the original sheet that
   face is, because `planarize.foldedState()` emits current coordinates only. Deep in a stack many
   layers are congruent triangles, so two states that differ by swapping two of them are
   indistinguishable from the stored frames alone, and swapping them is a real difference between
   two folded states. Measured: `verify-state.mjs --mutate` accepted 23 of 600 deliberately
   corrupted stacks while comparing against stored frames, and rejects 600 of 600 comparing
   replayed state against replayed state. A replayed state carries original-sheet coordinates for
   free, because the engine needs them to decide tearing at all.

   Fold Studio's format keeps a `vertices_flat` field for exactly this purpose; ours does not, and
   adding it would mean regenerating the corpus for a path that scoring does not use. The
   comparator reports `identifiesFaces` on every verdict, so a weakened comparison is visible in
   the output rather than assumed away.

### On the corpus's scale, one prediction that was wrong

Deduplicating the square's eight symmetries was expected to exhaust the shallow end — there are
only so many distinct three-fold patterns. It does not: the shallow strata fill essentially on
first attempt, and there are **zero isomorphic duplicates across the five batches**. Recorded
because it was asserted as a constraint on corpus design and the data refused it.

The one duplicate the sampler now rejects is at depth three (50 samples in 51 attempts), and it
appeared only after `planarize` stopped snapping coordinates to a 1e-9 lattice: the dedup key
rounds coordinates to 1e-6, so two patterns that used to hash apart now hash together. Which is
the correct behaviour — they were always the same pattern.

### How a sample is checked

`node workspace/corpus/verify-exact.mjs out/release` replays every recorded sequence and compares
what it creases against the stored pattern. **600 of 600 reproduce it.**

What it compares is the set of **maximal creased intervals per line**, not the subdivided edge
list. Subdivision is unstable under floating point — a vertex a few ULP away can fall on the other
side of another crease's endpoint, so one side gets a cut the other does not and the two edge
lists have different *lengths*. That is a count mismatch, not a distance, so no tolerance of any
size reaches it: raising the budget from 8 ULP per fold to 100,000 changed almost nothing.
Merging each line's pieces first makes the question "does this line carry a crease from here to
here", which does not depend on how many pieces it was recorded in.

⚠️ **The comparison's floor is 1e-9, and that number is the corpus's own, not a tuned tolerance.**
`planarize` treats two points within 1e-9 as one vertex and keeps the first one's coordinates, so
a stored vertex can sit that far from the point the fold produced. **No verifier can resolve this
corpus more finely than the generator recorded it.** Actual agreement is far tighter — most
samples match to within a handful of ULP — and the per-sample figure is reported so the margin
used is visible rather than assumed.

The older `verify-replay.mjs` still exists and applies a looser comparison through
`crease-compare.mjs`. Where the two disagree, `verify-exact` is the one the numbers above are
stated in.

---

## Closed: Learn2Fold is not a data source

Previously listed here as the single highest-priority audit target ("the most likely source of
real bucket-A scale"). **Checked — the data does not exist for us.** Its OrigamiCode corpus
(5,760 sequences / 75,000 verified transitions) is mostly generated by their own symbolic
simulator, and **it was never publicly released**. There is nothing to audit, download, or
convert. Learn2Fold stays in the paper as an architectural precedent only; it is not a dataset
entry.

---

## Action items

- [x] **Generate the first batch and look at the step / degeneracy distribution** before fixing
      the sampling design. Done — the pilot batch, not a prior design, chose the anti-degeneracy
      knob (absolute per-stratum coupling cap), ruled `collapsed` out as a filter, and set the
      step cut points.
- [x] **Remove every outside data source** and the scripts that fetched them. Done 2026-09-17.
- [ ] Re-check the step strata now that they answer to nothing external — the range is ours to
      choose and 4–19 is inherited, not justified.
- [ ] Decide whether the `collapsed` flag should become a filter at fixed depth, given it
      measures depth rather than degeneracy (`workspace/corpus/release.mjs` header).
