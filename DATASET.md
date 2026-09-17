# Datasets — CP / fold-state / fold-sequence sources

2026-09-14. Every known source of origami data relevant to Track 1 (CP → Seq), what ground
truth each one actually contains, and which bucket (per `EXPERIMENTS_SETUP.md` §1.3) it falls
into. This is an inventory, not a merged dataset.

> **Read §0 first.** The audit below concluded that no accessible source carries bucket A at
> scale — the closest, PurelandFold, has the states but not the action labels (§2) — so the
> main corpus has to be **synthesized**. The real sources are anchors and CP
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
- **Why this exists**: the closest real source is 27<!--fact:purelandfold.sequences--> sequences (PurelandFold) — and it carries
  states rather than action labels (§2), which
  cannot carry a headline number — and after Probe C, neither can instagram: at most 39 of its
  366<!--fact:corpus.instagram.total--> CPs are even solvable in our action space. Synthesis is not one option among several
  any more, it is the only one. **Synthesis is also the field's normal practice, not a
  shortcut** — Learn2Fold's own OrigamiCode is 5,760 sequences / 75,000 verified transitions,
  the bulk of it produced by their own symbolic simulator (`notes/plan/corpus-plan.md`).

### The release corpus (2026-09-17) — two splits, and how it must be scored

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

- **verified** — the tier's own solver was run on the pattern and returned a verdict, so an
  independent search reproduced a sequence for it. ⚠️ This checks the **generator**, not the
  physics: both share the fold engine, so it catches a broken sampler and would **not** catch a
  wrong model of paper.
- **generated** — deeper samples, correct **by construction** (they were produced by folding, and
  the pattern is what the folding left behind), with no verdict because the solver cannot close
  those depths in reasonable time. The split is labelled rather than the corpus being stopped at
  the depth the solver reaches — **the difficulty the benchmark is about lives past that depth.**
- A **TIMEOUT stays in the corpus**, marked. Dropping it would bias the verified split toward the
  instances the solver finds easy, which is the one bias a difficulty-graded corpus cannot afford.
- Scale ~1,000 was chosen against the published comparables (GamiBench 372, OrigamiSpace 350),
  not against OrigamiCode's 5,760, which was never released.

### 🛑 HOW TO SCORE THIS CORPUS — the recorded sequence is **a** solution, not **the** solution

**Measured on the release batch: 2 of the 100 verified samples have a sequence one fold SHORTER
than the one that built them** — 1/50 at three folds, 1/50 at four. The generator does not search;
it folds, so nothing makes its sequence minimal.

⚠️ **Two is a floor set by how little of this corpus is verified, not a rate.** The check needs the
solver, so it can only run on the 100 verified samples; the other 500 have never been looked at.
An earlier, larger release verified 700 samples and found 30, with the share rising steeply with
depth — 1/100 at three folds, 11/100 at five, 10/99 at six. The rule below is written for that
behaviour, not for the two instances that happen to be visible here.

Three rules follow, and the first is the one that silently corrupts results:

1. **Never compare a proposed sequence step-by-step against the recorded one.** A model that
   finds a shorter correct sequence would be marked WRONG. Judge by **replaying** the proposed
   sequence through the engine and comparing **crease sets** — the standard PR #13 set, equal
   rather than overlapping.
2. **Step-count metrics belong against the shortest KNOWN sequence**, carried per sample as
   `shorter_known` (null when nothing shorter is known — which is not the same as "none exists",
   since an unverified sample has simply not been looked at).
3. **`shorter_known` is a floor, not the optimum.** It is whatever our iterative-deepening solver
   found within budget. On `generated` samples nobody has looked at all.

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
- ⚠️ **At most 7.7% of it is reachable, and only 1.1% is confirmed.** Probe C is complete
  (`notes/probes/probe-c-screen.md`): **338<!--fact:probeC.provenNot--> / 366<!--fact:corpus.instagram.total--> = 92.3%<!--fact:probeC.provenNotPct-->** of these CPs are **proven** not
  all-layers simple-foldable — 125<!--fact:probeC.screenFail--> by the spanning-line condition, 46<!--fact:probeC.preCrease--> by pre-crease traces,
  167<!--fact:probeC.exhausted--> by a full search that exhausted the space. 24<!--fact:probeC.timeout--> timed out, 4<!--fact:probeC.solved--> solved. The action space is fixed
  to simple folding, so a score over all 366 is capped at 7.7% for reasons that have nothing to
  do with the model — see `EXPERIMENTS_SETUP.md` §1.2 for the four-way stratification this
  forces. **This source is now a scope-boundary measurement, not a corpus for scored runs.**
- **Also note**: this is the same 366-CP set OrigamiBench uses as its dataset (`papers.md`).

---

## 2. PurelandFold

- **Link**: https://huggingface.co/datasets/mayaweiz/PurelandFold
- **License**: CC-BY-4.0
- **Size / format**: 27 sequences / 337 frames. `cp.fold` contains **layer-order ground truth**.
- **Ground truth**: **state trajectory, not action labels — "bucket A" was a shade too strong.**
  Corrected 2026-09-16 from `DHEERAJ_WORKSPACE/pureland/ANALYSIS.md` §1, and it is right: the
  sequence lives *relationally*, in the parquet's `(sequence, step)` columns, and **no `.fold`
  file carries a `step`, `action` or ordering field**. Each row is a *snapshot*, so
  "valley-fold along this line" exists only as the difference between two consecutive frames.
  That is more than bucket B (we have every intermediate state, 337<!--fact:purelandfold.frames--> frames) and less than
  bucket A (the actions are never stated). Sequence-level metrics that compare *states* are
  available; ones that compare *actions* require deriving them first, and that derivation is
  ours, not the source's.
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
  folds, which is the same fact Probe C measured as 92.3%<!--fact:probeC.provenNotPct--> from the other direction.
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
