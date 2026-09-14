# Datasets — CP / fold-state / fold-sequence sources

2026-09-14. Every known source of origami data relevant to Track 1 (CP → Seq), what ground
truth each one actually contains, and which bucket (per `EXPERIMENTS_SETUP.md` §1.2) it falls
into. Nothing here is synthesized yet — this is an inventory, not a merged dataset.

Bucket reminder:

| Bucket | Has |
| --- | --- |
| A | CP + full step-by-step sequence |
| B | CP + final result only, no intermediate steps |
| C | CP only, no ground truth |

---

## 1. Flat-Folder `examples/instagram/`

- **Link**: https://github.com/origamimagiro/flat-folder (repo) · `examples/instagram/` (data)
- **License**: MIT
- **Size / format**: 366 `.fold` crease patterns
- **Ground truth**: CP only. Flat-Folder itself can *solve* each one into a terminal flat-folded
  state on demand, but that's a computed output, not a stored label, and there can be
  many valid terminal states per CP (see `notes/flat-folder-capabilities.md` — states ≠
  sequences, and a CP can have zero, one, or many folding sequences reaching a given state).
- **Bucket**: C by default (CP only); can be promoted to a synthetic B by running Flat-Folder's
  solver and picking one terminal state as `FINAL RESULT` — but that pick is an experimental
  choice we make, not a ground-truth label from the source.
- **Also note**: this is the same 366-CP set OrigamiBench uses as its dataset (`papers.md`).

---

## 2. PurelandFold

- **Link**: https://huggingface.co/datasets/mayaweiz/PurelandFold
- **License**: CC-BY-4.0
- **Size / format**: 27 sequences / 337 frames. `cp.fold` contains **layer-order ground truth**.
- **Ground truth**: this is the strongest candidate for **bucket A** we've found — it's
  explicitly a set of *sequences* (337 frames across 27 sequences), not just endpoints.
- **Caveat**: restricted to Pureland origami (simple folds only, per the name) — same scope
  restriction flagged for FoldingAgent in `BASELINE_REPRODUCTION.md`. Good for validating the
  loop and for bucket-A sequence metrics; not representative of harder, compound-fold CPs.
- **Status**: not yet audited — need to confirm exact frame format matches (or can be converted
  to) the `.fold`-per-step shape `EXPERIMENTS_SETUP.md`'s simulator expects.

---

## 3. GamiBench

- **Link**: https://github.com/stvngo/GamiBench · https://huggingface.co/datasets/stvngo/GamiBench
- **License**: MIT
- **Size / format**: TBD — full repo + HF dataset, the only benchmark in this list that's
  "completely runnable" out of the box (`papers.md`).
- **Ground truth**: unknown until audited. GamiBench's reported metrics (Accuracy, Viewpoint
  Consistency, Impossible Fold Selection Rate — `notes/related-work-metrics-EN.md`) suggest a
  QA/classification task shape, which may mean its items are not raw `(CP, sequence)` pairs.
- **Bucket**: TBD, pending audit (see `BASELINE_REPRODUCTION.md` action items).

---

## 4. Learn2Fold's dataset

- **Link**: paper at https://arxiv.org/html/2603.29585v1 · https://www.alphaxiv.org/pdf/2603.29585
  (repo/data link TBD)
- **License**: TBD
- **Size / format**: expert demonstration trajectories (procedural, step-by-step) —
  see `notes/2026-09-11-states-and-simulator.md` Q3: because it's built from expert demos, each
  CP effectively has exactly one recorded sequence/state, not multiple.
- **Ground truth**: likely bucket A (full sequences) for the CPs it covers, since it's built
  around expert trajectories — but solves a different input problem (prompt → sequence, not
  CP → sequence — see `BASELINE_REPRODUCTION.md` §0), so even if usable as data, the *task
  framing* has to be adapted (drop the language prompt, keep the CP-to-sequence pair, if the
  underlying CP is recoverable from their data).
- **Status**: not yet audited. This is the single highest-priority item to check, since it's the
  most likely source of real bucket-A pairs at any scale.

---

## 5. Creasy-generated step-graphs

- **Link**: https://github.com/xkevio/Creasy (generator, not a static dataset)
- **License**: GPL-3 (we run it, we don't vendor its code or outputs into anything we ship —
  see `notes/creasy-cp-to-seq.md`)
- **Size / format**: not fixed — Creasy *computes* a full step-graph for any CP its 4-maneuver
  dictionary can handle (inside/outside reverse fold, swivel ×2). For classic models it already
  covers (crane, traditional frog base), this gives genuine bucket-A sequences, sometimes tens
  of thousands of step-graph nodes deep.
- **Ground truth**: bucket A, but only for the small set of models expressible in its 4 rules —
  most real-world CPs are outside its coverage, and it can also fail expensively (the frog base
  case took ~30 minutes and 22,665 nodes — see `notes/creasy-cp-to-seq.md`).
- **Use**: source of a handful of high-quality bucket-A reference sequences, not a bulk data
  source. Also doubles as the Creasy baseline in `BASELINE_REPRODUCTION.md`.

---

## 6. OrigamiSpace dataset

- **Link**: paper at https://arxiv.org/abs/2511.18450 (NeurIPS'25) — **no public repo** as of
  the last check (`papers.md` #5)
- **Status**: **not accessible.** Can't audit format or extract data. Revisit if a repo is
  published.

---

## 7. FOLD-format example repositories (generic CP sources, unaudited)

- **FOLD format spec + examples**: https://github.com/edemaine/fold
- **Origami Simulator's model gallery**: https://origamisimulator.org/
- These are candidate sources of *more* CPs (bucket C, mostly) beyond Flat-Folder's 366, useful
  for expanding coverage if the audited sources above turn out too small. Not yet checked for
  size, license, or whether any ship intermediate sequences — treat as TBD, lowest priority.

---

## Action items

- [ ] Run the audit script from `EXPERIMENTS_SETUP.md` §1.3 over sources 1–5 above once each is
      confirmed accessible; report bucket sizes (A/B/C) per source.
- [ ] Confirm Learn2Fold's actual data release format and license (source 4) — highest priority,
      since it's the most likely source of real bucket-A scale.
- [ ] Confirm PurelandFold's frame format is convertible to the simulator's expected per-step
      `.fold` input (source 2).
- [ ] Audit GamiBench's HF dataset shape — QA-style items vs. raw CP/sequence pairs (source 3).
- [ ] Periodically recheck OrigamiSpace for a public repo (source 6).
