# Baseline Reproduction — CP → Seq / CP → (.fold + sequence)

2026-09-14. Catalog of existing methods and papers that already attempt the problem this
project is scoped to (Track 1: CP → Seq, per `notes/track1-surface-simulator.md`), a decision
per method on whether to reproduce it, run it as-is, or only cite its numbers, and what that
turns into as an actual row in our results table.

This file is about **published prior work**. The from-scratch search baselines (Random / BFS /
DFS) we build and run ourselves are already specified in
`notes/experiment-spec-checklist.md` (group C) and `EXPERIMENTS_SETUP.md` (§5) — not repeated
here.

---

## 0. First distinction: which of these actually solve *our* problem

Not everything below solves CP → Seq. Some solve a related-but-different problem, and treating
them as directly comparable would be a mistake worth flagging up front (see
`notes/track1-surface-simulator.md`):

| Problem | What goes in | What comes out | Who does this |
| --- | --- | --- | --- |
| **CP → Seq** (ours) | A crease pattern | A folding sequence that produces it | Akitaya 2013 / Creasy, discrete PSO |
| **prompt → Seq** | A natural-language description | A folding sequence | Learn2Fold |
| **semantic → CP** | A natural-language description | A crease pattern (not a sequence) | Learn2Fold (their other framing), OrigamiSpace |
| **CP → terminal state only** | A crease pattern | *One* valid flat-folded state, no path to it | Flat-Folder (it doesn't produce sequences at all — see `notes/flat-folder-capabilities.md`) |

⚠️ Methods in the last three rows are **not drop-in baselines** for a CP → Seq comparison table.
They're either adaptable with a caveat (Flat-Folder), or only usable as an architectural
reference / related-work contrast (Learn2Fold, OrigamiSpace) — see per-method notes below.

---

## 1. Candidate baselines

| Method | Problem it solves | Repro status | Why |
| --- | --- | --- | --- |
| **Akitaya et al. 2013 / Creasy** | CP → Seq | **Run, don't reproduce** | Already decided in `notes/creasy-cp-to-seq.md`: GPL-3, unmaintained since 2022, Java+JavaFX with a hand-installed ORIPA dependency. Reproducing it is rebuilding a 2013 wheel for no benefit. Download the release jar and run it. |
| **Discrete PSO** (minimizes Hausdorff distance to target shape) | CP → Seq | **TBD — locate an implementation** | Referenced in `notes/track1-surface-simulator.md` as an existing approach; no repo identified yet. Find the paper/code before deciding run vs. reproduce. |
| **Flat-Folder** (adapted) | CP → terminal state only | **Run, with an adapter** | Not a sequence method at all (no notion of "step" — `notes/flat-folder-capabilities.md`). To use it as any kind of baseline row, we'd have to bolt on a rule for "which of its N valid states counts as the target" (e.g., first solution, or a specific state matched to our dataset's ground truth). This is a baseline for the *terminal-state* half of the problem only, never for sequence quality. |
| **Learn2Fold (2026)** | prompt → Seq / semantic → CP | **Cite only — different problem** | Solves a different input problem (language, not CP) with a different data assumption (expert demonstration trajectories, so it never has to choose between multiple valid states — see `notes/2026-09-11-states-and-simulator.md` Q3). Its architecture (LLM proposer + learned world model for lookahead) is the closest published analogue to our tool-augmented VLM loop, so it's worth citing as the architectural precedent — just not as a same-metric comparison row. |
| **FoldingAgent** | Restricted-scope folding (Pureland: simple folds only) | **Cite only — restricted scope** | Explicitly avoids the "each fold gets harder" dimension by restricting to Pureland origami (simple folds only) — see `notes/related-work-metrics-EN.md`. Its reported "simultaneous compound actions" failure mode is exactly what leaks through at the boundary of that restriction. Useful as a related-work contrast, not a same-scope baseline. |
| **COrigami** | Flat-foldability check + aesthetic scoring | **Not applicable** | Reports a boolean flat-foldability check and a subjective VLM aesthetic score, not a sequence or a terminal-state match. No comparable metric to reuse. |
| **OrigamiBench** | Benchmark (defines metrics, ships a dataset) | **Reuse dataset + metric definitions** | Not a method — a benchmark. Its dataset **is** Flat-Folder's `examples/instagram/` (366 `.fold` files, see `DATASET.md`), and its Query Efficiency metric is the direct ancestor of the query-efficiency claim this whole project is built around (`notes/track1-surface-simulator.md`). Reuse the metric definition; the underlying agent it benchmarks is not itself a baseline for us. |
| **OrigamiSpace** (NeurIPS'25) | semantic → CP | **Not usable — no repo** | No public repository as of the last check (`papers.md` #5). Can't run it, can't extract numbers beyond what's in the paper. Revisit if a repo appears. |
| **GamiBench** | Benchmark (accuracy / viewpoint consistency / impossible-fold rate) | **TBD — audit format** | Full repo + HF dataset available (`papers.md` #6), unlike the others. Needs an audit to see whether its items are CP → Seq pairs we can reuse, or a different task shape (e.g. multiple-choice QA) that only lends us metric ideas, not data. |

---

## 2. What actually becomes a results-table row

Per `notes/creasy-cp-to-seq.md`, the numbers worth pulling out of Creasy are already scoped:

- Same batch of CPs → Creasy's full step-graph **node count** and **wall-clock seconds** to build
  it, vs. our method's **simulator/tool-call count** to reach a solution. This is a
  published, citable reference point for query efficiency — stronger than an unpublished
  from-scratch baseline.
- **Failure list**: which CPs Creasy cannot produce a sequence for at all (its maneuver
  dictionary only has 4 rules — inside/outside reverse fold, swivel ×2 — vs. the paper's own 4:
  inside/outside reverse, squash, petal; note this fidelity gap when citing it), and which ones
  blow up the step-graph before finishing. This failure list is itself evidence for why the
  problem needs a heuristic (Akitaya's own 2013 future-work paragraph says as much — quoted in
  `notes/creasy-cp-to-seq.md`).

So the actual baseline ladder for the results table (`EXPERIMENTS_SETUP.md` §5–6) ends up being:

```
Random  →  BFS  →  DFS  →  Creasy (run, cited numbers)  →  Ours (full tool belt)  →  Ours (no tools)
```

with Flat-Folder appearing only as the terminal-state ground-truth source (`DATASET.md`), never
as its own row, and Learn2Fold / FoldingAgent / OrigamiBench / OrigamiSpace / GamiBench appearing
in the related-work section of the paper, not in the results table.

---

## 3. Action items

- [ ] Locate an implementation (or the original paper with enough detail to reproduce cheaply)
      of the discrete-PSO baseline.
- [ ] Download the Creasy release jar, run it over the same CP set used elsewhere, and record
      node count / seconds / failure list per `notes/creasy-cp-to-seq.md`.
- [ ] Audit GamiBench's HF dataset to determine whether its items are directly reusable as
      `(CP, final result)` or `(CP, sequence)` pairs, or only reusable as metric definitions.
- [ ] Recheck whether OrigamiSpace has published a repo since the last look.
