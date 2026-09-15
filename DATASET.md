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

## 0. Synthesized Pureland corpus — **the main data, not yet generated**

- **Link**: none — we generate it. Design in `notes/plan/corpus-plan.md` (a).
- **Method**: start from a square, apply random simple folds forward, record the sequence, unfold
  at the end to obtain the CP. **Generation is trivial; the inverse problem (CP → Seq) is the
  hard one** — which is exactly the structure a benchmark should have.
- **Ground truth**: **bucket A by construction.** The (CP, sequence) pair is built, not labelled,
  so there is nothing to annotate and nothing to trust.
- **Difficulty control**: step count, the same axis and unit as PurelandFold's `step` — so the
  synthetic corpus and the real anchor are directly comparable.
- **Why this exists**: the two real bucket-A candidates are 27 sequences (PurelandFold) and a
  handful of classic models (Creasy). Neither can carry a headline number — and after Probe C,
  neither can instagram: at most 39 of its 366 CPs are even solvable in our action space.
  Synthesis is not one option among several any more, it is the only one. **Synthesis is also
  the field's normal practice, not a shortcut** — Learn2Fold's own OrigamiCode is 5,760
  sequences / 75,000 verified transitions, the bulk of it produced by their own symbolic
  simulator (`notes/plan/corpus-plan.md`).
- **Status**: not generated. Open question, deliberately not pre-designed: what distribution to
  draw random folds from so the corpus isn't all degenerate cases (e.g. repeated halving).
  Decide after looking at the first batch.

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
- **Role: reality anchor, not the main data — 27 sequences.** Measured 2026-09-15
  (`notes/plan/corpus-plan.md`): its non-local-dependency spread is p50 = 0.7 against
  instagram's p50 = 12.8, **a ~20× gap, with almost no spread inside PurelandFold at all**.
  That is not a data defect — it is what "simple folds only" means. So the non-local-dependency
  difficulty axis is unusable here, leaving `step` (5–21) as the only axis, and 27 sequences
  cannot carry a headline number. It anchors the synthetic corpus (§0) to reality; it does not
  replace it.
- **Caveat**: restricted to Pureland origami (simple folds only, per the name) — same scope
  restriction flagged for FoldingAgent in `BASELINE_REPRODUCTION.md`. Good for validating the
  loop and for bucket-A sequence metrics; not representative of harder, compound-fold CPs.
- **Status**: partially audited. Frame-format conversion to the simulator's per-step `.fold`
  shape is still unconfirmed. Open: **74 rows are skipped (`variables=0`)** — 27 of them are the
  step-1 rows, the remaining ~47 are unexplained (`notes/plan/corpus-plan.md`).

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

---

## 5. OrigamiSpace dataset

- **Link**: paper at https://arxiv.org/abs/2511.18450 (NeurIPS'25) — **no public repo** as of
  the last check (`papers.md` #5)
- **Status**: **not accessible.** Can't audit format or extract data. Revisit if a repo is
  published.

---

## 6. FOLD-format example repositories (generic CP sources, unaudited)

- **FOLD format spec + examples**: https://github.com/edemaine/fold
- **Origami Simulator's model gallery**: https://origamisimulator.org/
- These are candidate sources of *more* CPs (bucket C, mostly) beyond Flat-Folder's 366, useful
  for expanding coverage if the audited sources above turn out too small. Not yet checked for
  size, license, or whether any ship intermediate sequences — treat as TBD, lowest priority.

---

## Closed: Learn2Fold is not a data source

Previously listed here as the single highest-priority audit target ("the most likely source of
real bucket-A scale"). **Checked — the data does not exist for us.** Its OrigamiCode corpus
(5,760 sequences / 75,000 verified transitions) is mostly generated by their own symbolic
simulator, and **it was never publicly released**. There is nothing to audit, download, or
convert. Learn2Fold stays in the paper as an architectural precedent only
(`BASELINE_REPRODUCTION.md` §1); it is not a dataset entry.

---

## Action items

- [ ] **Generate the first batch of the synthetic Pureland corpus (§0)** and look at the step /
      degeneracy distribution before fixing the sampling design. Highest priority — it is now
      the main data path.
- [ ] Run the audit script from `EXPERIMENTS_SETUP.md` §1.4 over sources 1–4 once each is
      confirmed accessible; report bucket sizes (A/B/C) per source.
- [ ] Attach Probe C's three-way stratum label (foldable / proven-not-foldable / timeout,
      `EXPERIMENTS_SETUP.md` §1.2) to every instagram CP, so no score can accidentally be
      pooled over all 366.
- [ ] Confirm PurelandFold's frame format is convertible to the simulator's expected per-step
      `.fold` input, and explain the 74 skipped rows (source 2).
- [ ] Audit GamiBench's HF dataset shape — QA-style items vs. raw CP/sequence pairs (source 3).
- [ ] Periodically recheck OrigamiSpace for a public repo (source 5).
