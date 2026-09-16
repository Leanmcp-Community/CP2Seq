# Datasets — CP / fold-state / fold-sequence sources

2026-09-14. Every known source of origami data relevant to Track 1 (CP → Seq), what ground
truth each one actually contains, and which bucket (per `EXPERIMENTS_SETUP.md` §1.3) it falls
into. This is an inventory, not a merged dataset.

> **Read §0 first.** The audit below concluded that no accessible source carries bucket A at
> scale, so the main corpus has to be **synthesized**. The real sources are anchors and CP
> supply, not the primary data.

**Owns: where the data comes from.** How the experiment runs is `EXPERIMENTS_SETUP.md`; who we
compare against is `BASELINE_REPRODUCTION.md`; which decisions are frozen is
`notes/plan/experiment-spec-checklist.md`. Nothing is restated across them.

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
- **The step cut points** are PurelandFold's, counted in action-space steps: 47<!--fact:purelandfold.precreaseFrames--> of its
  337<!--fact:purelandfold.frames--> frames are pre-crease steps, and merged into the step they precede its range is
  4<!--fact:purelandfold.effStepMin-->–19<!--fact:purelandfold.effStepMax--> with tertiles ≤10<!--fact:purelandfold.effTertileLo--> / 11–13<!--fact:purelandfold.effTertileHi--> / >13.
- ⚠️ **That calibration is drawn from a partly-overlapping set.** 44.4%<!--fact:anchor.exhaustedPct--> of PurelandFold's
  models are proven *not* expressible in the all-layers action space, while 7<!--fact:anchor.solved--> are (§2). So the
  strata are a self-consistent stratification of this corpus, and comparable to the part of
  PurelandFold that shares our action space — not to all of it. Say which when it matters.
- ⚠️ **The coupling axis deliberately overshoots real Pureland** — median 4.2<!--fact:corpus.synth.couplingP50--> against
  PurelandFold's 0.7, up to 64<!--fact:corpus.synth.couplingMax-->. Real Pureland's coupling spans 0.0–3.4, too narrow to
  be a difficulty axis at all, so **span was chosen over distribution match** (2026-09-16).
  Report it beside the circularity risk in `notes/plan/corpus-plan.md`, not buried.
- ⚠️ **One cell is empty by measurement**: long sequences at low coupling yield 2<!--fact:corpus.synth.lLocalHits--> hits in
  16,000 attempts. Every all-layers simple fold thickens the stack, so a long sequence cannot
  keep cutting few layers. Real folders reach that corner by **pre-creasing** — F-edge counts
  across four reference CPs run 0 / 6 / 8 / 18 as the models lengthen — which is exactly the
  operation we excluded. The longer a real Pureland model runs, the more of it sits outside the
  action space.
- **Degeneracy**: 33.2%<!--fact:corpus.synth.degeneratePct--> of samples carry a flag, almost all `collapsed`. **Recorded, never
  filtered**: the flag rate tracks the coupling cap monotonically, so filtering on it would
  delete the high end of the axis we deliberately vary.
- **Why this exists**: the only real bucket-A source is 27<!--fact:purelandfold.sequences--> sequences (PurelandFold), which
  cannot carry a headline number — and after Probe C, neither can instagram: at most 39 of its
  366<!--fact:corpus.instagram.total--> CPs are even solvable in our action space. Synthesis is not one option among several
  any more, it is the only one. **Synthesis is also the field's normal practice, not a
  shortcut** — Learn2Fold's own OrigamiCode is 5,760 sequences / 75,000 verified transitions,
  the bulk of it produced by their own symbolic simulator (`notes/plan/corpus-plan.md`).

---

## 1. Flat-Folder `examples/instagram/`

- **Link**: https://github.com/origamimagiro/flat-folder (repo) · `examples/instagram/` (data)
- **License**: MIT
- **Size / format**: 366 `.fold` crease patterns
- **Ground truth**: CP only. Flat-Folder itself can *solve* each one into a terminal flat-folded
  state on demand, but that's a computed output, not a stored label, and there can be
  many valid terminal states per CP (see `notes/tools/flat-folder-capabilities.md` — states ≠
  sequences, and a CP can have zero, one, or many folding sequences reaching a given state).
- **Bucket**: C by default (CP only); can be promoted to a synthetic B by running Flat-Folder's
  solver and picking one terminal state as `FINAL RESULT` — but that pick is an experimental
  choice we make, not a ground-truth label from the source.
- ⚠️ **At most 10.7% of it is reachable, and only 0.5% is confirmed.** Probe C is complete
  (`notes/probes/probe-c-screen.md`): **327<!--fact:probeC.provenNot--> / 366<!--fact:corpus.instagram.total--> = 89.3%<!--fact:probeC.provenNotPct-->** of these CPs are **proven** not
  all-layers simple-foldable — 125<!--fact:probeC.screenFail--> by the spanning-line condition, 46<!--fact:probeC.preCrease--> by pre-crease traces,
  156<!--fact:probeC.exhausted--> by a full search that exhausted the space. 37<!--fact:probeC.timeout--> timed out, 2<!--fact:probeC.solved--> solved. The action space is fixed
  to simple folding, so a score over all 366 is capped at 10.7% for reasons that have nothing to
  do with the model — see `EXPERIMENTS_SETUP.md` §1.2 for the four-way stratification this
  forces. **This source is now a scope-boundary measurement, not a corpus for scored runs.**
- **Also note**: this is the same 366-CP set OrigamiBench uses as its dataset (`papers.md`).

---

## 2. PurelandFold

- **Link**: https://huggingface.co/datasets/mayaweiz/PurelandFold
- **License**: CC-BY-4.0
- **Size / format**: 27 sequences / 337 frames. `cp.fold` contains **layer-order ground truth**.
- **Ground truth**: genuine **bucket A** — explicitly a set of *sequences* (337 frames across
  27 sequences), not just endpoints. The only real bucket-A source of any size we found.
- ⚠️ **Partly inside our action space, partly outside — measured, not assumed.** It was called a
  "reality anchor" for a month on no evidence. Running the all-layers solver over each model's
  final CP (`workspace/corpus/check-anchor.mjs`, budget 200k):

  | | |
  | --- | --- |
  | SOLVED — a sequence exists in our action space | **7**<!--fact:anchor.solved--> |
  | EXHAUSTED — *proven* none does | **12**<!--fact:anchor.exhausted--> **/ 27**<!--fact:anchor.total--> = 44.4%<!--fact:anchor.exhaustedPct--> |
  | TIMEOUT — unknown | 8<!--fact:anchor.timeout--> |

  Of the 4<!--fact:anchor.noF--> models with no `F` edge at all — where pre-creasing cannot be the explanation —
  2<!--fact:anchor.noFExhausted--> are EXHAUSTED and 2 SOLVED. **So neither "it anchors us to reality" nor "it is
  entirely out of scope" is true.** SOLVED means *a* sequence exists, not that it is the one the
  person used: a CP generally has many.
- 🛑 **These numbers replace a wrong set, and the reason is worth keeping.** The first run said
  20 EXHAUSTED / 74.1%, and that was **a float bug, not a finding**. Coordinate noise of ~1e-6,
  which is what a video pipeline produces, split one straight crease across two line buckets;
  neither covered the chord a fold would make, so every candidate was rejected and the search
  reported the space closed. **Ten of 27 verdicts moved when it was fixed.** Inputs from outside
  are now repaired **per corpus, at the call site** — `check-anchor.mjs` snaps coordinates onto
  the 3-decimal lattice this source stores them on and passes a tolerant line target
  (`DHEERAJ_WORKSPACE/baseline/tolerant.mjs`); `workspace/corpus/test-noise.mjs` is the
  regression. ⚠️ Two things stated rather than hidden: the snap assumes the source's true values
  are simple fractions (true here), and the repair is deliberately **not** inside the solver —
  instagram is full precision and Probe C's EXHAUSTED verdicts depend on exact matching there.
- ⚠️ **Consequence for §0's step cut points.** They are calibrated to these sequences' step
  counts, and 12<!--fact:anchor.exhausted--> of the sequences are not expressible in our action space. So the
  calibration is drawn from a set that only partly overlaps ours. The cut points stand as a
  *self-consistent* stratification of the synthetic corpus; treat "comparable to real Pureland"
  as holding for the part that overlaps, and say which part when it matters.
- **Measured 2026-09-15**: its non-local-dependency spread is p50 = 0.7 against instagram's
  p50 = 12.8, **a ~20× gap, with almost no spread inside PurelandFold at all**. That is not a
  data defect — it is what "simple folds only" means. So the non-local-dependency difficulty
  axis is unusable here, and 27<!--fact:purelandfold.sequences--> sequences cannot carry a headline number either way.
- **27 named, recognisable models, with video frames of a person folding them** — bird, cat,
  penguin, horse_head, snake, girl, yacht, tulip, and so on. This is the corpus's only
  recognisable anchor: synthetic samples are unnamed random patterns, so nothing else here
  answers "does any of this look like origami". Export with
  `workspace/data/export_purelandfold_models.py` (output gitignored, it is a re-export).
  ⚠️ It is also where the ceiling of the action space becomes visible: **21 steps of simple
  folding produces a blocky flat shape, not a crane.** Cranes and frogs need reverse and petal
  folds, which is the same fact Probe C measured as 89.3%<!--fact:probeC.provenNotPct--> from the other direction.
- **Caveat**: restricted to Pureland origami (simple folds only, per the name) — same scope
  restriction flagged for FoldingAgent in `BASELINE_REPRODUCTION.md`. Good for validating the
  loop and for bucket-A sequence metrics; not representative of harder, compound-fold CPs.
- **Status**: audited 2026-09-16. Frame format converts: every row carries a per-step `cp.fold`
  with `faceOrders`, i.e. layer-order ground truth, in the same unit square our CPs use.
  **The 74<!--fact:purelandfold.skippedRows--> skipped rows are explained** — 27<!--fact:purelandfold.sequences--> are the step-1 rows (a flat square has no
  layer-ordering problem), and the remaining 47<!--fact:purelandfold.precreaseFrames--> are **pre-crease steps**: fold, unfold,
  leave a crease. Confirmed by their signature (`variables=0` past step 1) and visible directly
  as `F` edges in the CPs — 0 / 6 / 8 / 18 across bird / dog / horse_head / girl.
- ⚠️ **Rule, decided 2026-09-16: pre-crease frames merge into the step they precede** — not
  dropped. Pre-creasing is outside the frozen action space so those frames cannot stand as steps
  of their own, but dropping them leaves the neighbouring states geometrically inconsistent,
  while merging keeps the sequence continuous and charges the preparation to the step it serves.
  Trailing pre-crease frames have no following step and attach to the previous one. Implemented
  in `export_purelandfold_models.py`; this is what makes §0's step cut points comparable.

---

## 3. GamiBench

- **Link**: https://github.com/stvngo/GamiBench · https://huggingface.co/datasets/stvngo/GamiBench
- **License**: MIT
- **Size / format**: TBD — full repo + HF dataset, the only benchmark in this list that's
  "completely runnable" out of the box (`papers.md`).
- **Ground truth**: unknown until audited. GamiBench's reported metrics (Accuracy, Viewpoint
  Consistency, Impossible Fold Selection Rate — `notes/reading/related-work-metrics-EN.md`) suggest a
  QA/classification task shape, which may mean its items are not raw `(CP, sequence)` pairs.
- **Bucket**: TBD, pending audit (see `BASELINE_REPRODUCTION.md` action items).



## Closed: Learn2Fold is not a data source

Previously listed here as the single highest-priority audit target ("the most likely source of
real bucket-A scale"). **Checked — the data does not exist for us.** Its OrigamiCode corpus
(5,760 sequences / 75,000 verified transitions) is mostly generated by their own symbolic
simulator, and **it was never publicly released**. There is nothing to audit, download, or
convert. Learn2Fold stays in the paper as an architectural precedent only
(`BASELINE_REPRODUCTION.md` §1); it is not a dataset entry.

---

## Action items

- [x] **Generate the first batch of the synthetic Pureland corpus (§0)** and look at the step /
      degeneracy distribution before fixing the sampling design. Done — the pilot batch, not a
      prior design, chose the anti-degeneracy knob (absolute per-stratum coupling cap), ruled
      `collapsed` out as a filter, and set the step cut points.
- [x] Confirm PurelandFold's frame format is convertible to the simulator's expected per-step
      `.fold` input, and explain the 74<!--fact:purelandfold.skippedRows--> skipped rows (source 2). Done — pre-crease steps,
      with a stated merge rule.
- [ ] Run the audit script from `EXPERIMENTS_SETUP.md` §1.4 over sources 1–3 once each is
      confirmed accessible; report bucket sizes (A/B/C) per source.
- [ ] Attach Probe C's three-way stratum label (foldable / proven-not-foldable / timeout,
      `EXPERIMENTS_SETUP.md` §1.2) to every instagram CP, so no score can accidentally be
      pooled over all 366<!--fact:corpus.instagram.total-->.
- [ ] Audit GamiBench's HF dataset shape — QA-style items vs. raw CP/sequence pairs (source 3).
- [ ] Verify the pre-crease judgement by eye. `variables=0` past step 1 is the *signature* of a
      pre-crease step, not proof; the totals match the independently recorded 74<!--fact:purelandfold.skippedRows-->/47<!--fact:purelandfold.precreaseFrames--> and the
      F edges corroborate it, but 47 frames is a small enough set to check before publication.
- [ ] Draw the pure-search baseline curve on the controlled corpus (`v2`<!--fact:corpus.synth.run-->). The `--verify` run
      so far used the uncapped pilot strata.
