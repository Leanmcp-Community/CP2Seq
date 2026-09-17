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

`workspace/corpus/out/release/`, ~1,050 samples in nine batches under one merged manifest.
Rebuild: `bash workspace/corpus/run-release.sh` then `node workspace/corpus/merge-release.mjs`.

| tier | n | folds |
| --- | --- | --- |
| all-layers | 550 | 3–19 |
| some-layers | 500 | 3–9 |

- **Every sample is correct by construction** — produced by folding, and the pattern is what the
  folding left behind. There is no verified/generated split. The previous one recorded whether a
  search could re-derive the sequence inside a budget, which capped the "verified" half at about
  five folds and made it, by measurement, entirely easy. **The difficulty this corpus is about
  lives past that depth**, so splitting on it was splitting on the wrong thing.
- The check that runs is `verify-replay.mjs`: replay each recorded sequence, confirm it reproduces
  the pattern beside it. O(folds), so it covers every sample at every depth.
- Scale ~1,000 was chosen against the published comparables (GamiBench 372, OrigamiSpace 350).

### 🛑 HOW TO SCORE THIS CORPUS — the recorded sequence is **a** solution, not **the** solution

**Measured on the release batch: 30 samples have a sequence one fold SHORTER than the one that
built them**, and the share rises with depth — 1/100 at three folds, 4/100 at four, **11/100 at
five, 10/99 at six**. The generator does not search; it folds, so nothing makes its sequence
minimal.

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

### On the corpus's scale, one prediction that was wrong

Deduplicating the square's eight symmetries was expected to exhaust the shallow end — there are
only so many distinct three-fold patterns. It does not: **100 distinct patterns in 100 attempts
at depth three, and zero isomorphic duplicates across all eight batches.** Recorded because it
was asserted as a constraint on corpus design and the data refused it.

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
