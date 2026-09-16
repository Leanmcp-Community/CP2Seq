# Experiment Spec Checklist — Track 1 (CP → Seq)

2026-09-15. Single source of truth for the Track 1 experiment: what must be frozen, what data
exists, who we compare against, and how it gets run. Condensed from the former
`BASELINE_REPRODUCTION.md`, `EXPERIMENTS_SETUP.md` and `DATASET.md`.

> **Status: Phase 0** (`research-workflow.md`). Group `A` is frozen once decided — changing it
> means re-running. Any `pending pilot` item must name **which pilot number it waits on**;
> a TBD that names nothing is still TBD in three months.

## The claim

> **On sequential constraint-satisfaction problems with an exact verifier, the LLM's gain lies
> not in proposal quality but in early pruning and targeted backtracking. Therefore query
> efficiency, not success rate, is the right metric.**

If an item can't be traced back to this sentence, it doesn't belong in the main experiment.

⚠️ **VLM, not text-only LLM** — once the visual channel exists, every "LLM" below is a
vision-language model. ⚠️ **Engineering, not training** — off-the-shelf models via API,
prompting and tool-calling only. The contribution is the harness.

Two kinds of TBD: **Frozen** (interfaces, contracts, units — decide **now**, deferring = rework)
vs. **Pending pilot** (thresholds, bins, budgets, distance functions — guessing early is guessing).

---

## A. Interface layer · Frozen

- [ ] **Action space model**: one-layer / some-layers / all-layers simple fold; infinite vs
      finite line (`track1-surface-simulator.md`). **Decide first — everything depends on it.**
- [ ] **State representation** shown to the model → also group D's baseline arm, so keep it switchable
- [ ] **Verifier contract**: in / out
- [ ] ⚠️ **Does the verifier return a failure reason?** A reason = a free pruning signal =
      **contaminates group C**. Decide explicitly; most likely a toggle
- [ ] **Definition of "one query"** — the denominator of every number reported
      - one Flat-Folder call (natural, but cost varies with depth → not comparable across difficulty)
      - one "state advance + legality check"
      - one LLM call
      ⚠️ ① measures **compute** saved, ③ measures **reasoning** saved. **The claim is about
      reasoning; readers will assume compute. Kill this ambiguity in §3 ¶1 of the paper.**
- [ ] Retries allowed after failure · history kept in context
- [ ] CP dataset: source, synthesis, size, difficulty coverage (→ §H)

## B. Difficulty axis

- [ ] Primary axis: branching factor at step k / log state-space size / shortest solution length
      ⚠️ the three give **completely different curve shapes**
- [ ] **Record all three, plot one, rest to appendix.** Recording is free; re-running is not
- [ ] Bin boundaries — *pending pilot*
- [ ] **Monotonicity check**: does pure search's query count rise monotonically with the axis?
      Not monotone → broken axis, replace it
- [ ] Sample **stratified** across strata, not uniformly — Probe A found the explosion lives in
      the tail, not the median (`probes/probe-a-explosion.md`)

> All computable directly from Flat-Folder. "We can precisely control and measure difficulty" is
> itself a contribution for a methods paper.

## C. Pruning / backtracking protocol · **core of the paper**

- [ ] **Make pruning an observable, explicit action** — the model declares "this branch is dead"
      **before** calling the verifier, else its judgment can't be separated from the verifier's
- [ ] **Pruning ground truth** = does a solution still exist from this state = one exhaustive
      search. Expensive → precompute and cache?
- [ ] **Two pruning metrics, reported separately**: correctness (P/R) and query savings.
      ⚠️ Conservative = accurate but saves little; aggressive = saves a lot but may cut the only
      solution. **Trade-off curve or single point?**
- [ ] **Backtrack distance error**: fail at step k, true error at step j (last prefix with a
      solution), model says step i → `|i − j|`. How is `j` computed, and how expensive?
      ⚠️ Meaningless in mazes (back up cell by cell); meaningful in origami, where "each fold
      gets harder" makes backing up to the wrong step very costly
- [ ] ⚠️ **Baselines are not ablations.** Ablations strip parts off the model; baselines are the
      reference frame. Without the pure-search row, "the LLM wins on pruning" has nothing to win against

| | Proposal | Pruning | Backtracking |
| --- | --- | --- | --- |
| **Random** | random legal move | none | restart |
| **Pure search** (DFS/BFS + Flat-Folder) | enumeration | verifier only — you find out at the bottom | back up one step |
| **LLM** | LLM proposes | **rejects early, without calling the verifier** | **names step k to return to** |

- [ ] DFS or BFS for pure search? (different query profiles — decide, don't leave it implicit)
- [ ] Does Random get the same query budget? (yes — see §H.5)
- [ ] Worth a fourth row: an LLM-free heuristic search (greedy on a hand-written score)? Cheapest
      way to pre-empt "your baseline is a straw man"

**Ablations**

| Ablation | How | Expected |
| --- | --- | --- |
| Proposal off | actions enumerated, LLM only filters | **small** drop |
| Pruning off | every proposal goes to the verifier | **large** drop |
| Backtracking off | restart on failure | **large** drop |
| No vision | same tools, drop the rendered-image channel | isolates visual/geometric feedback |
| Verifier only | LLM sees pass/fail, no vision, no filter | isolates the filter step |
| No tools, prompt-only | plain prompting | **memorization control** (§H.5) |

> If the result inverts (proposal turns out to be key), the LLM is a good proposer rather than a
> good critic — **that is also a finding, not a failed experiment.** Same if no-vision or
> no-tools matches the full arm: the gain isn't where we assumed.

## D. Representation ablation (science, not engineering)

- [ ] ❌ Not "try four representations, see which wins" (produces a table)
- [ ] ✅ "**Do two representations differ systematically in the *types* of pruning error they
      make?**" (produces a mechanism)
- [ ] ⚠️ **D depends on E** — no failure taxonomy, no "error types"
- [ ] Statistical test compares **distributions**, not means → which test?
- [ ] This is the group that can engage the Spa3R vs. "I Know About Up!" mental-imagery debate

## E. Failure-mode taxonomy

- [ ] Categories: illegal action proposed · false prune (cut a branch that had a solution) ·
      backtracked too far · not far enough · layer-ordering error · same error repeated on the same CP
- [ ] ⚠️ **How each is decided automatically from the logs** — this fixes what the logs must
      record, so it **must be settled before running**
- [ ] Mutually exclusive? Exhaustive? What is the catch-all called?
- [ ] Simulator rejections already arrive labelled with the violated constraint class
      (`taco-taco` / `taco-tortilla` / `tortilla-tortilla` / `transitivity`) — reuse those, don't
      invent a parallel taxonomy. This is what turns a REJECT into a diagnosis

> A methods paper of pure curves reads thin. A free verifier means failures can be classified
> **exhaustively**. This table may end up cited more than the main experiment.

## F. "Find multiple ways" as a metric

- [ ] Solution-space ground truth: exhaustive on small CPs? sampled on large ones? sampling bias?
- [ ] Sequence distance: **edit distance** (easiest to defend) vs. Hausdorff (a **shape**
      distance — using it on **sequences** needs extra justification; don't conflate them)
- [ ] Coverage / diversity definition — *pending*, depends on the above
- [ ] ⚠️ **F and C are two sides of one story**: over-confident pruning systematically cuts one
      class of solutions. If that holds, the two gaps merge into one paper instead of two
      parallel selling points

## G. Experimental hygiene

- [ ] **dev / test split**; test set **not looked at once** before the main experiment finishes
- [ ] Seeds, model versions, prompt versions **all recorded**; k runs per CP, report median and
      spread — VLM sampling is not deterministic and a single run is not a measurement
- [ ] **Budget gate**: hard token cap per experiment, stop on trigger, human decides to continue
- [ ] Cache on `(prompt, seed, model)` — the second run costs nothing
- [ ] **All intermediates to structured logs; all analysis offline from the logs, never by
      re-running the model** → nearly every "burned the tokens again" is a field that wasn't recorded

---

# H. The run

## H.1 Model and tools

**VLM = an LLM with vision input** — same text context (CP, prompt, history) plus the images the
simulator renders. Candidates: **Gemini Flash** (free credits), **Nemotron**, other off-the-shelf
VLMs opportunistically. Held fixed within a model between arms; running both tells us whether the
effect is model-specific or general.

| Tool | Status | What it does |
| --- | --- | --- |
| **Surface simulator** | **must be built — the engineering deliverable** | in: a `.fold` state, or previous state + one candidate fold. Out on success: a 3D view (three.js scene, or 3–4 static renders from different angles). Out on failure: a **structured error** — the fold is illegal, the paper would penetrate itself. Same constraint classes as Flat-Folder, but on **one candidate step**, not a global terminal state. Flat-Folder has no notion of "step", so this cannot be borrowed |
| **Proposal** | with the simulator | enumerates candidate next folds so the model isn't hallucinating the action space |
| **Filter** | with the simulator | narrows the proposal set before the model commits — group C's explicit "declare this branch dead" |
| **Hamiltonian-path tool** (Prof. Yi) | **not implemented** | search/verify a traversal order on the crease graph so the model proposes an ordering instead of deriving one each step. Needs its own scoping note; must not block the simulator |
| **Image generation** (Nano Banana, GPT Imagen-2 class) | optional, experimental | a picture of the folded state straight from a `.fold`. ⚠️ **Unverified** — an image generator is not a geometry solver and will happily draw an illegal fold. **Ablation arm only**, never a substitute for the simulator's correctness guarantee |

## H.2 The loop

```
   (CP, FINAL RESULT)                 ← dataset pair (§I)
            │ CP
            ▼
      ┌───────────┐
      │  PROMPT   │◄────────────────────┐
      └─────┬─────┘                     │
            ▼                           │
      ┌───────────┐                     │
      │    VLM    │                     │
      └─────┬─────┘                     │
            │ candidate next .fold step │
            ▼                           │
      ┌──────────────────────┐          │
      │  SURFACE SIMULATOR   │          │
      │   (+ optional tools) │          │
      └─────────┬────────────┘          │
           ok   │   illegal fold        │
           ▼    ▼                       │
        IMAGES  ERROR ───────────────────┘
           │   (VLM marks its own step "final")
           ▼
      FINAL .fold  ──►  compare to FINAL RESULT  ──►  ACCEPT / REJECT
```

- **PROMPT** is the running context (CP, instructions, full step → images/error history); the VLM
  box itself is stateless per call.
- ⚠️ **Compare on the equivalence class, not byte equality.** A CP can have many valid terminal
  states, so an exact diff marks correct answers wrong. ACCEPT iff (a) the final `.fold` is a
  valid flat-folded state of the CP and (b) it matches `FINAL RESULT` up to symmetries declared
  **in advance** — rotation/reflection, and the layer-order variants Flat-Folder itself reports
  as equally valid. Picking one terminal state is our experimental choice, not a label from the
  source (§I.1); this is the line where that choice is paid for.

## H.3 Baseline ladder

Run in this order, before touching our method — they are the reference frame group C requires and
the cheapest sanity check that group B's axis and group A's "one query" behave.

```
Random  →  BFS  →  DFS  →  Creasy (run, cited numbers)  →  Ours (full)  →  Ours (no tools)
```

Let `b` = branching factor, `d` = shortest solution length:

- **BFS** — time and space `O(b^d)` (holds a frontier of ~`b^d`). **Error rate zero**: accepts
  only on the exact verifier, abandons only after exhausting a branch, so group E's false-prune
  and backtrack-distance categories don't apply by construction.
- **DFS** — time `O(b^d)` worst case (same tree), space only `O(d)`; that space difference is the
  practical reason to run both. **Error rate also zero**, same argument.
- **Random** — no deterministic bound and **no completeness guarantee within a finite budget**.
  Expected queries scale as the inverse probability of staying on a solution path (~`O(b^d)` in
  expectation if legal moves are near-uniform) — an expectation with variance, not a guarantee.
  It can exhaust its budget with a solution still existing, so it has a genuine **nonzero failure
  rate** at any fixed budget. ⚠️ Therefore same budget *and* enough seeds — a single Random run
  conflates "got unlucky" with "the baseline is weak".

## H.4 Prior work: what is a row, what is a citation

⚠️ Not everything published solves CP → Seq. Treating these as drop-in baselines is the mistake
to flag up front:

| Problem | In → Out | Who |
| --- | --- | --- |
| **CP → Seq** (ours) | crease pattern → sequence producing it | Akitaya 2013 / Creasy, discrete PSO |
| prompt → Seq | language → sequence | Learn2Fold |
| semantic → CP | language → crease pattern | Learn2Fold (other framing), OrigamiSpace |
| CP → terminal state only | crease pattern → *one* valid flat state, no path | Flat-Folder |

| Method | Status | Why |
| --- | --- | --- |
| **Akitaya 2013 / Creasy** | **Run, don't reproduce** | GPL-3, unmaintained since 2022, Java+JavaFX with a hand-installed ORIPA dependency. Reproducing it rebuilds a 2013 wheel. Download the release jar and run it |
| **Discrete PSO** (minimizes Hausdorff to target shape) | **TBD — locate an implementation** | no repo identified yet; find paper/code before deciding run vs. reproduce |
| **Flat-Folder** (adapted) | **Run, with an adapter** | not a sequence method (no "step"). Needs a bolted-on rule for which of its N valid states counts as target. A baseline for the **terminal-state** half only, never for sequence quality |
| **Learn2Fold (2026)** | **Cite only** | different input problem, and expert demonstration trajectories so it never chooses between valid states. ⚠️ Dataset never released (§I.7). Cite the architecture (LLM proposer + learned world model for lookahead) as the closest analogue to our loop; nothing else is reusable |
| **FoldingAgent** | **Cite only — but now *our* scope too** | restricts to Pureland (simple folds only) to dodge "each fold gets harder". ⚠️ We adopted the same restriction, so this is no longer a free contrast: we *measure* the boundary (34.2% of real CPs fall outside it, §I.1) rather than escape it. Its "simultaneous compound actions" failure is exactly what leaks through at that boundary |
| **COrigami** | **Not applicable** | boolean flat-foldability + subjective VLM aesthetic score; no comparable metric |
| **OrigamiBench** | **Reuse dataset + metric definitions** | a benchmark, not a method. Its dataset *is* Flat-Folder's `examples/instagram/` (§I.1); its Query Efficiency metric is the direct ancestor of this project's claim. The agent it benchmarks is not a baseline for us |
| **OrigamiSpace** (NeurIPS'25) | **Not usable — no repo** | revisit if one appears |
| **GamiBench** | **TBD — audit format** | full repo + HF dataset, unlike the others. Audit whether items are CP → Seq pairs or a QA shape that only lends metric ideas |

**What Creasy actually contributes**: on the same CP batch, its full step-graph **node count** and
**wall-clock seconds** vs. our **tool-call count** — a published, citable query-efficiency
reference, stronger than an unpublished from-scratch baseline. Plus a **failure list**: which CPs
it cannot sequence at all (its dictionary has 4 maneuvers — inside/outside reverse fold, swivel ×2
— vs. the paper's own inside/outside reverse, squash, petal; note this fidelity gap when citing),
and which blow up the step-graph before finishing. That failure list is itself evidence the
problem needs a heuristic — Akitaya's own future-work paragraph says as much.

Learn2Fold / FoldingAgent / OrigamiBench / OrigamiSpace / GamiBench appear in related work, not in
the results table. Flat-Folder appears only as the terminal-state ground-truth source.

## H.5 Conditions and protocol

| Condition | Tools | Measures |
| --- | --- | --- |
| **Full tool belt** | simulator + proposal + filter + vision (+ Hamiltonian if ready, + optional image-gen) | upper bound |
| **No tools, prompt-only** | none | **memorization control** — reasoning through the loop, or recalling the fold from pretraining? |

Same VLM, same CP set, same budget across arms. Fixed before the first run:

- **Input anonymization.** CP filenames carry the model's name
  (`009_ku_Unassigned_Triangle_Pleat`). If the no-tools arm can read that name it recalls instead
  of reasoning, **both** arms measure recall, and the A/B measures nothing. Strip filenames and
  all metadata; feed geometry only.
- **Query budget.** One fixed N per CP, identical across arms. Exhausting it is a **Timeout**
  (§I.2), not a REJECT — the two mean different things.
- **Repeats and seeds.** k runs per CP, seeds recorded, median and spread reported.
- **Failure reason parity.** Whether the verifier returns a reason must match group A and be
  identical across arms wherever the no-tools arm could still receive it (e.g. as prompt text).
- Also to fix: retries after failure, history window, image resolution / render style and how
  often images are sent (every step? only on failure/backtrack?).

## H.6 Metrics and output

**Primary — sequence-level** (edit distance / step-count ratio vs. ground-truth sequence, group F).
Probe B measured the terminal-state problem as near search-free — the propagation oracle has 0%
false positives, because reaching *a* valid state is not the hard part
(`probes/probe-b-oracle.md`). **The difficulty lives in the sequence layer**, so that is where the
headline comes from. ⚠️ Computable only on bucket A — which is why the corpus must be synthesized
(§I.0).

**Gate — terminal match (ACCEPT rate).** Retained as an admission criterion ("did it produce a
legal terminal state at all"), per stratum (§I.2), never pooled. No longer the headline.

**Queries to solve** — over **all** attempts, not only solved ones; conditioning on success hides
exactly the long-tail blowup Probe A measured. Report the full within-budget distribution plus the
timeout fraction.

| Arm | Success rate | Queries to solve | Pruning P/R | Backtrack error |
| --- | --- | --- | --- | --- |
| Random | | | — | — |
| BFS | | | — | n/a |
| DFS | | | — | n/a |
| Creasy | | (nodes / seconds) | — | — |
| Ours (full tool belt) | | | | |
| Ours (no vision) | | | | |
| Ours (no tools, prompt-only) | | | — | — |

Expected if the hypothesis holds: Ours (full) beats Random/BFS/DFS mainly on **query count**, not
necessarily on success rate; Ours (no tools) falls back to prompting-only, confirming the gain is
tool-driven; the vision ablation shows whether visual feedback specifically helps pruning
correctness or backtracking accuracy (plausible mechanism: seeing the folded state catches
layer-ordering errors, one of group E's categories). If Ours (no tools) is close to Ours (full),
the honest conclusion is that the model already knows these folds — report that, don't reframe
the metric to hide it.

Output = these numbers + the group E error breakdown, written up as the Track 1 paper.

**Contribution**: (1) a reproducible baseline ladder on one CP set and one query definition,
missing from the current literature; (2) a tool-augmented loop evaluated on query efficiency and
pruning/backtracking quality rather than success rate; (3) a direct memorization control most
LLM-for-planning papers skip; (4) a visual-feedback ablation that speaks to the Spa3R vs. "I Know
About Up!" debate.

---

# I. Data

Inventory, not a merged dataset. **Read §I.0 first**: no accessible source carries bucket A at
scale, so the main corpus is **synthesized**; the real sources are anchors and CP supply.

| Bucket | Has | Usable for |
| --- | --- | --- |
| **A** | CP + full step-by-step sequence | sequence metrics (group F) |
| **B** | CP + final result only | the ACCEPT/REJECT loop (§H.2) |
| **C** | CP only | exploration / pilot only, never scored |

## I.0 Synthesized Pureland corpus — the main data, not yet generated

- **Method**: start from a square, apply random simple folds forward, record the sequence, unfold
  to obtain the CP. **Generation is trivial; the inverse (CP → Seq) is the hard one** — exactly
  the structure a benchmark should have. Design in `corpus-plan.md`.
- **Ground truth**: **bucket A by construction** — the pair is built, not labelled, so there is
  nothing to annotate and nothing to trust.
- **Difficulty control**: step count — same axis and unit as PurelandFold's `step`, so synthetic
  corpus and real anchor are directly comparable.
- **Why**: the two real bucket-A candidates are 27 sequences and a handful of classic models;
  neither carries a headline. **Synthesis is the field's normal practice, not a shortcut** —
  Learn2Fold's OrigamiCode is 5,760 sequences / 75,000 verified transitions, mostly from their own
  symbolic simulator.
- **Status**: not generated. Open, deliberately not pre-designed: what distribution to draw random
  folds from so the corpus isn't all degenerate cases (e.g. repeated halving). Decide after batch 1.

## I.1 Flat-Folder `examples/instagram/` — MIT · 366 `.fold` CPs

github.com/origamimagiro/flat-folder. CP only; Flat-Folder can *solve* each into a terminal state
on demand, but that is a computed output, not a stored label, and there can be many valid states
per CP. **Bucket C**, promotable to a synthetic B by running the solver and picking one terminal
state — that pick is our experimental choice, not a label. Same 366 CPs OrigamiBench uses.

## I.2 The foldability ceiling: a third of this corpus has no solution at all

Probe C stage 1 (`probes/probe-c-screen.md`) screened all 366 against an exact **necessary**
condition for all-layers simple foldability:

| Passes the screen (upper bound on simple-foldable) | 241 / 366 = **65.8%** |
| --- | --- |
| **Provably NOT simple-foldable** | **125 / 366 = 34.2%** |

The action space is fixed to simple folding, so **those 125 have no solution in our action space
at all.** A flat "% solved" over 366 is capped at 65.8% for reasons that have nothing to do with
the model. ⚠️ The screen is necessary, not sufficient — passing does not prove foldable. And T4
proves deciding simple foldability is NP-hard in general, so the full search will time out on some
CPs however it is implemented.

**Therefore every dataset-level number is reported in three strata, never pooled:**

| Stratum | Definition | How to read a run on it |
| --- | --- | --- |
| **Foldable** | full search found a sequence | the only stratum where %solved is a model score |
| **Proven not foldable** | fails Probe C's necessary condition | reported, never scored — a correct model should *refuse* these |
| **Timeout** | search exceeded budget, status unknown | its own fraction; it is a result, not a gap |

**Pooling the three is the single easiest way to make this paper indefensible.** Strata are
**orthogonal** to buckets: a CP can be bucket B *and* proven-not-foldable. Bucket says what ground
truth exists; stratum says whether a solution exists at all.

## I.3 PurelandFold — CC-BY-4.0 · 27 sequences / 337 frames

huggingface.co/datasets/mayaweiz/PurelandFold. `cp.fold` carries **layer-order ground truth**.
Genuine **bucket A** — the only real bucket-A source of any size we found.
**Role: reality anchor, not the main data.** Measured 2026-09-15 (`corpus-plan.md`): non-local
dependency spread p50 = 0.7 vs. instagram's p50 = 12.8, **a ~20× gap with almost no spread inside
PurelandFold at all**. That is not a defect — it is what "simple folds only" means. So that
difficulty axis is unusable here, leaving `step` (5–21) as the only one, and 27 sequences cannot
carry a headline. Same Pureland restriction flagged for FoldingAgent (§H.4): good for validating
the loop and for bucket-A sequence metrics, not representative of compound-fold CPs.
**Open**: frame-format conversion to the simulator's per-step `.fold` shape unconfirmed; **74 rows
skipped (`variables=0`)** — 27 are step-1 rows, the remaining ~47 unexplained.

## I.4 Creasy-generated step-graphs — GPL-3 · generator, not a static dataset

github.com/xkevio/Creasy. Computes a full step-graph for any CP its 4-maneuver dictionary handles.
For models it covers (crane, traditional frog base) this is genuine bucket A, sometimes tens of
thousands of nodes deep — but only for that small set, and it can fail expensively (frog base:
~30 min, 22,665 nodes). A handful of high-quality reference sequences, not a bulk source. We run
it, we don't vendor its code or outputs. Doubles as the Creasy baseline (§H.4).

## I.5 GamiBench — MIT · repo + HF dataset

github.com/stvngo/GamiBench. The only benchmark here runnable out of the box. Its metrics
(Accuracy, Viewpoint Consistency, Impossible Fold Selection Rate) suggest a QA/classification
shape, which may mean its items are not raw `(CP, sequence)` pairs. Bucket TBD pending audit.

## I.6 OrigamiSpace — arxiv.org/abs/2511.18450 (NeurIPS'25) · **no public repo**

Not accessible: can't audit format or extract data. Recheck periodically.

## I.7 Closed: Learn2Fold is not a data source

Previously the highest-priority audit target. **Checked — the data does not exist for us.**
OrigamiCode (5,760 sequences / 75,000 transitions) is mostly generated by their own symbolic
simulator and **was never publicly released**. Nothing to audit, download or convert. Learn2Fold
stays as an architectural precedent only (§H.4).

## I.8 Generic FOLD sources, unaudited, lowest priority

github.com/edemaine/fold (spec + examples) · origamisimulator.org (model gallery). Candidate
sources of *more* CPs (bucket C, mostly) if the audited sources prove too small. Unchecked for
size, license, or intermediate sequences.

---

# Action items

**Data (highest priority — the main path)**
- [ ] **Generate the first batch of the synthetic Pureland corpus (§I.0)**; inspect step and
      degeneracy distribution **before** fixing the sampling design.
- [ ] Write the audit script that buckets every CP A/B/C across sources §I.1–I.5 and records, for
      bucket A, how many intermediate steps exist. Report bucket sizes **before** the dev/test
      split (group G depends on knowing how many samples are scorable).
- [ ] Label every instagram CP with its §I.2 stratum, so no score can be pooled over all 366.
- [ ] Confirm PurelandFold's frame format converts to the simulator's per-step `.fold` shape, and
      explain the 74 skipped rows (§I.3).
- [ ] Audit GamiBench's HF dataset shape — QA items vs. raw CP/sequence pairs (§I.5).
- [ ] Recheck OrigamiSpace for a public repo (§I.6).

**Baselines**
- [ ] Download the Creasy release jar, run it over the same CP set, record node count / seconds /
      failure list (§H.4).
- [ ] Locate a discrete-PSO implementation, or the paper with enough detail to reproduce cheaply.

**Build**
- [ ] Surface simulator (§H.1) — the actual engineering deliverable of Track 1.
- [ ] Scoping note for the Hamiltonian-path tool; must not block the simulator.

---
---

# 实验 Spec 清单 —— Track 1（CP → Seq）

2026-09-15。Track 1 实验的唯一事实来源：什么必须冻结、有哪些数据、跟谁比、怎么跑。
由原 `BASELINE_REPRODUCTION.md`、`EXPERIMENTS_SETUP.md`、`DATASET.md` 三份文件压缩合并而来。

> **当前位置：Phase 0**（`research-workflow.md`）。`A` 组冻结后不许改（改了要重跑）。
> 标 `pending pilot` 的条目必须写明**等的是哪个 pilot 数字**；没写等谁的「待定」，三个月后还是待定。

## 这份清单服务的那句主张

> **在带精确验证器的序贯约束满足问题上，LLM 的增益不在提议质量，而在提前剪枝和定位回溯；
> 因此 query efficiency 而非 success rate 才是正确的度量。**

追溯不到这句话的条目，不属于主实验。

⚠️ **这是 VLM，不是纯文本 LLM** —— 只要视觉通道存在，下文所有「LLM」都读作视觉语言模型。
⚠️ **这是工程，不是训练** —— 全部通过 API 调用现成模型，只用 prompting 和 tool-calling。
贡献是这套 harness。

两种「待定」：**Frozen**（接口、契约、口径 —— **现在就定**，拖着 = 后面全部返工）
vs. **Pending pilot**（阈值、切分点、预算、距离函数 —— 提前拍脑袋就是瞎定）。

---

## A. 接口层 · Frozen

- [ ] **action space 用哪个已命名模型**：one-layer / some-layers / all-layers simple fold；
      infinite vs finite line（`track1-surface-simulator.md`）。**这是第一个要定的，别的都依赖它。**
- [ ] **状态表示**：给模型看什么 → 同时是 D 组消融的 baseline 臂，接口要可切换
- [ ] **验证器契约**：输入什么、返回什么
- [ ] ⚠️ **验证器返不返回失败原因？** 返回理由 = 免费送一个剪枝信号 = **直接污染 C 组**。
      必须明确，而且大概率做成开关
- [ ] **「一次 query」的定义** —— 我全部数字的分母
      - 一次 Flat-Folder 调用（自然，但开销随折叠深度变，跨难度不可比）
      - 一次「状态推进 + 合法性判定」
      - 一次 LLM 调用
      ⚠️ ① 测省了多少**计算**，③ 测省了多少**推理**。**我的主张是关于推理的，读者会默认我在说计算。
      这个歧义必须在论文 §3 第一段消掉。**
- [ ] 失败后允许几次重试 · 上下文里保留多少历史
- [ ] CP 数据集：从哪来、怎么合成、多少个、难度怎么覆盖（见 §H）

## B. 难度轴

- [ ] 主轴选哪个：第 k 步可行动作数（分支因子）/ 状态空间大小的对数 / 最短解长度
      ⚠️ 三个会给出**完全不同的曲线形状**
- [ ] **全都记录，只用一个画主图，其余进附录。** 记录是免费的，重跑不是
- [ ] 分层切点 —— *pending pilot*
- [ ] **验证单调性**：难度越高，纯搜索的 query 数确实单调上升吗？不单调 → 轴是坏的，换掉
- [ ] 按难度**分层采样**，不做均匀采样 —— Probe A 实测爆炸在长尾、不在中位数
      （`probes/probe-a-explosion.md`）

> 这些量全都能从 Flat-Folder 直接算出。「能精确控制并测量任务难度」本身就是方法论文的贡献。

## C. 剪枝 / 回溯的测量协议 · **论文核心**

- [ ] **怎么让「剪枝」成为可观测的显式动作** —— 模型必须在**调用验证器之前**说出「这条死了」，
      否则没法把模型的判断和验证器的判定分开
- [ ] **剪枝 ground truth** = 从某状态出发是否仍有解 = 一次穷尽搜索。可能很贵 → 要不要预计算并缓存？
- [ ] **剪枝的两个指标分开报**：正确性（P/R）和 query 节省。
      ⚠️ 过度保守的模型剪得准但省不了；激进的模型省很多但可能剪掉唯一解。**报 trade-off 曲线还是单点？**
- [ ] **回溯距离误差**：失败在第 k 步，真错误在第 j 步（最后一个仍有解的前缀），模型说退到第 i 步
      → `|i − j|`。`j` 怎么算、贵不贵？
      ⚠️ 这个量在迷宫里没意义（可逐格退），**在折纸里有意义，因为「越折越难」让退错一步代价极高**
- [ ] ⚠️ **基线不是消融。** 消融是从模型身上拆零件，基线是参照系。没有纯搜索那一行，
      「LLM 赢在剪枝」就没有东西可赢

| | 提议 | 剪枝 | 回溯 |
| --- | --- | --- | --- |
| **随机基线** | 随机合法动作 | 无 | 重启 |
| **纯搜索**（DFS/BFS + Flat-Folder） | 枚举 | 只靠验证器 —— 走到底才知道 | 退一步 |
| **LLM** | LLM 提议 | **提前否决，未调用验证器** | **指定退回第 k 步** |

- [ ] 纯搜索用 DFS 还是 BFS？（query 曲线完全不同 —— 要定，不要含糊带过）
- [ ] 随机基线的 query 预算和其他行一样吗？（一样 —— 见 §H.5）
- [ ] 要不要加第四行：不含 LLM 的启发式搜索（按手写打分贪心）？这是抵挡「你的基线是稻草人」最便宜的办法

**消融**

| 消融 | 做法 | 预期 |
| --- | --- | --- |
| 关掉提议 | 动作由枚举给，LLM 只当过滤器 | 掉幅**小** |
| 关掉剪枝 | 提议什么都送进验证器 | 掉幅**大** |
| 关掉回溯 | 失败即重启 | 掉幅**大** |
| 无视觉 | 同样的工具，去掉渲染图像通道 | 隔离视觉/几何反馈的价值 |
| 只有验证器 | 只看 pass/fail，无视觉、无过滤 | 隔离过滤步骤的价值 |
| 无工具，纯 prompting | 普通 prompting | **记忆性对照**（§H.5） |

> 如果结果反过来（提议才是关键），说明 LLM 是好 proposer 而不是好 critic ——
> **这也是个发现，不是失败的实验。** 无视觉 / 无工具臂跟完整臂持平也一样：增益不在我们以为的地方。

## D. 表示消融（science 版，不是 engineering 版）

- [ ] ❌ 不做「试四种表示看哪个好」（那产出一张表）
- [ ] ✅ 做「**两种表示的剪枝错误类型分布是否有系统性差异**」（那产出一个机制）
- [ ] ⚠️ **D 依赖 E** —— 没有失败分类学就没有「错误类型」
- [ ] 统计检验：比的是**分布差异**，不是均值差异 → 用什么检验？
- [ ] 这一组才是能碰 Spa3R vs "I Know About Up!" 那个心理表征之争的地方

## E. 失败模式分类学

- [ ] 类别：提议了非法动作 · 误剪（剪掉了有解的分支）· 回溯过头 · 回溯不足 · 层序推理错 ·
      在同一个 CP 上重复同一个错误
- [ ] ⚠️ **每一类怎么从日志自动判定** —— 这条决定了日志要记什么，**必须在跑之前定**
- [ ] 类别是否互斥？是否穷尽？兜底类叫什么？
- [ ] 模拟器每次拒绝时已经自带违反的约束类别标签（`taco-taco` / `taco-tortilla` /
      `tortilla-tortilla` / `transitivity`）—— 直接复用，不要另起炉灶。这才能把一次 REJECT 变成诊断

> 方法论文只有曲线会显得薄。有免费验证器 = 可以**穷尽地**分类失败。这张表可能比主实验更被引用。

## F. "find multiple ways" 的度量

- [ ] 解空间 ground truth：小 CP 上可穷举？大 CP 上只能采样？采样偏差怎么办？
- [ ] 序列距离：**编辑距离**（最容易辩护）vs. Hausdorff（是**形状**距离，用在**序列**上要额外
      论证 —— 别混用）
- [ ] 覆盖率 / 多样性的定义 —— *pending*，取决于上一条
- [ ] ⚠️ **F 组和 C 组是同一个故事的两面**：过度自信的剪枝会系统性地砍掉某一类解。
      如果成立，两个空白就合并成一篇论文，而不是两个并列卖点

## G. 实验卫生

- [ ] **dev / test 划分**，test 集在主实验跑完前**一次都不看**
- [ ] 随机种子、模型版本、prompt 版本**全部记录**；每个 CP 跑 k 次，报中位数和离散度 ——
      VLM 采样不是确定性的，单次跑不构成一次测量
- [ ] **预算闸门**：每个实验设 token 硬上限，触发即停，人工决定是否继续
- [ ] 缓存：相同 `(prompt, seed, model)` 直接命中，跑第二遍不花钱
- [ ] **所有中间结果落盘成结构化日志，分析全部离线从日志做，不重跑模型** ——
      绝大部分「又烧了一遍 token」都是因为分析时发现没记某个字段

---

# H. 怎么跑

## H.1 模型与工具

**VLM = 带视觉输入的 LLM** —— 跟普通 LLM 吃同样的文本上下文（CP、prompt、历史），
只是额外能消费模拟器渲染出的图片。候选：**Gemini Flash**（有免费额度）、**Nemotron**，
以及其他现成 VLM，视机会而定。同一个模型内两臂固定不变；两个模型都跑能告诉我们效应是
模型特有的还是普遍的。

| 工具 | 状态 | 做什么 |
| --- | --- | --- |
| **曲面模拟器** | **必须自己搭 —— 工程交付物** | 输入：一个 `.fold` 状态，或「上一个状态 + 一个候选折法」。成功输出：该状态的 3D 表示（three.js 场景，或不同摄像机角度的 3–4 张静态图）。失败输出：**结构化错误** —— 折法非法，纸会穿透自己。跟 Flat-Folder 是同一类约束判定，但判的是**单个候选步骤**，不是全局终态。Flat-Folder 压根没有「步骤」概念，所以借不到 |
| **提议工具** | 与模拟器同期 | 从当前状态枚举候选折法，模型不用凭空幻想动作空间 |
| **过滤器** | 与模拟器同期 | 用验证器输出收窄提议集合，再让模型决定 —— 即 C 组要求的显式「宣布这条分支已死」 |
| **哈密顿路径工具**（Yi 教授） | **还没实现** | 在折痕图上搜索/验证遍历顺序，让模型提议一个顺序而不是每步从零推导。需要单独一份 scoping note；不要让它卡住模拟器 |
| **图像生成**（Nano Banana、GPT Imagen-2 级别） | 可选，实验性 | 直接从 `.fold` 生成折叠状态图片。⚠️ **准确性未经验证** —— 图像生成模型不是几何求解器，会照样画出非法折法。**只能当消融分支**，绝不能替代模拟器的正确性保证 |

## H.2 这个循环

```
   (CP, FINAL RESULT)                 ← 数据集配对（§I）
            │ CP
            ▼
      ┌───────────┐
      │  PROMPT   │◄────────────────────┐
      └─────┬─────┘                     │
            ▼                           │
      ┌───────────┐                     │
      │    VLM    │                     │
      └─────┬─────┘                     │
            │ 候选的下一个 .fold 步骤     │
            ▼                           │
      ┌──────────────────────┐          │
      │      曲面模拟器       │          │
      │     (+ 可选工具)      │          │
      └─────────┬────────────┘          │
           成功  │   非法折法            │
           ▼    ▼                       │
        IMAGES  ERROR ───────────────────┘
           │  （VLM 自己标记该步骤为「final」）
           ▼
      FINAL .fold  ──►  与 FINAL RESULT 比对  ──►  ACCEPT / REJECT
```

- **PROMPT** 是持续增长的上下文（CP、任务说明、到目前为止「步骤 → 图片/错误」的完整历史）；
  VLM 这一格本身每次调用都是无状态的。
- ⚠️ **比对在等价类上做，不是逐字节相等。** 一个 CP 可以有多个合法终态，精确 diff 会把正确答案
  判错。ACCEPT 的条件是：(a) 最终 `.fold` 是该 CP 的一个合法平折终态，且 (b) 在我们**事先声明**
  的对称性下与 `FINAL RESULT` 一致 —— 纸张的旋转/翻转，以及 Flat-Folder 自己判定为同样合法的
  层序变体。「挑一个终态」是我们的实验选择、不是来源给的标签（§I.1）；这一行就是为那个选择付账的地方。

## H.3 基线阶梯

按这个顺序先跑 —— 在动我们自己的方法之前。它们是 C 组要求的参照系，也是检验 B 组难度轴和
A 组「一次 query」定义是否真的表现如预期的最便宜方式。

```
Random  →  BFS  →  DFS  →  Creasy（跑它，引用数字）  →  Ours（完整）  →  Ours（无工具）
```

设 `b` = 分支因子，`d` = 最短解长度：

- **BFS** —— 时间和空间都是 `O(b^d)`（第 `d` 层要保留约 `b^d` 的整个前沿）。**错误率：零。**
  只在精确验证器确认后才接受路径，只在分支被彻底穷尽后才放弃，所以 E 组的误剪、回溯距离类别
  从构造上就不适用。
- **DFS** —— 最坏情况时间同样 `O(b^d)`（同一棵树），但空间只要 `O(d)`；这个空间差正是两者都要
  跑的实际理由。**错误率同样为零**，理由相同。
- **随机** —— 没有确定性上界，**在有限预算内没有完备性保证**。期望 query 数取决于每步停留在解
  路径上的概率的倒数（合法动作接近均匀时量级约 `O(b^d)`）—— 这是带方差的期望，不是保证。
  它可能耗尽预算却始终没找到一个实际存在的解，所以在任何固定预算下都有真实的**非零失败率**。
  ⚠️ 因此它既要用相同预算，**又**需要足够多的种子 —— 只跑一次会把「运气不好」和「基线本身弱」混为一谈。

## H.4 已有工作：谁能进结果表，谁只能被引用

⚠️ 不是所有已发表工作都在解 CP → Seq。把它们当作即插即用的基线，是最该一开始就点明的错误：

| 问题 | 输入 → 输出 | 谁 |
| --- | --- | --- |
| **CP → Seq**（我们的） | 折痕图 → 能产生它的折叠序列 | Akitaya 2013 / Creasy、离散 PSO |
| prompt → Seq | 自然语言 → 序列 | Learn2Fold |
| semantic → CP | 自然语言 → 折痕图 | Learn2Fold（另一种框法）、OrigamiSpace |
| CP → 只有终态 | 折痕图 → **一个**合法平折态，没有路径 | Flat-Folder |

| 方法 | 结论 | 理由 |
| --- | --- | --- |
| **Akitaya 2013 / Creasy** | **跑它，不复现** | GPL-3、2022 年后停更、Java+JavaFX 还要手装 ORIPA 依赖。复现 = 重造一个 2013 年的轮子。下载 release jar 直接跑 |
| **离散 PSO**（最小化到目标形状的 Hausdorff 距离） | **待定 —— 先找实现** | 还没找到仓库；先找到论文/代码再决定跑还是复现 |
| **Flat-Folder**（改造） | **跑它，但要加适配层** | 它根本不是序列方法（没有「步骤」）。必须外挂一条规则来决定它的 N 个合法终态里哪个算目标。只能当**终态**那一半的基线，绝不能当序列质量的基线 |
| **Learn2Fold (2026)** | **只引用** | 输入问题不同，而且用专家演示轨迹，所以它从不需要在多个合法终态之间做选择。⚠️ 数据集从未公开（§I.7）。引用它的架构（LLM proposer + 学到的 world model 做 lookahead）作为最接近我们这套循环的先例；其余都不可复用 |
| **FoldingAgent** | **只引用 —— 但现在也是*我们的*范围** | 限制在 Pureland（只做 simple fold）以回避「越折越难」。⚠️ 我们后来采用了同样的限制，所以这不再是白捡的对比：诚实的说法是我们去**测量**这个限制的边界（34.2% 的真实 CP 落在外面，§I.1），而不是逃开它。它报告的「同时复合动作」失败正是这个边界上漏出来的东西 |
| **COrigami** | **不适用** | 只有布尔的可平折判定 + 主观的 VLM 美感打分，没有可复用的指标 |
| **OrigamiBench** | **复用数据集 + 指标定义** | 它是 benchmark 不是方法。它的数据集**就是** Flat-Folder 的 `examples/instagram/`（§I.1）；它的 Query Efficiency 指标是本项目那句主张的直接祖先。它评测的 agent 本身不是我们的基线 |
| **OrigamiSpace**（NeurIPS'25） | **不可用 —— 无仓库** | 有仓库了再说 |
| **GamiBench** | **待定 —— 审计格式** | 跟其他不同，有完整仓库 + HF 数据集。要审它的条目是 CP → Seq 配对，还是只能借走指标思路的 QA 形态 |

**Creasy 到底贡献什么**：在同一批 CP 上，它完整 step-graph 的**节点数**和**墙钟秒数**，
对比我们的**工具调用次数** —— 一个已发表、可引用的 query efficiency 参照点，比一个没发表的
自造基线更有力。外加一份**失败清单**：哪些 CP 它根本给不出序列（它的字典只有 4 个 maneuver ——
inside/outside reverse fold、swivel ×2 —— 而论文自己列的是 inside/outside reverse、squash、
petal；引用时要注明这个保真度落差），哪些会在跑完之前把 step-graph 撑爆。这份失败清单本身
就是「这个问题需要启发式」的证据 —— Akitaya 自己的 future-work 段落就是这么说的。

Learn2Fold / FoldingAgent / OrigamiBench / OrigamiSpace / GamiBench 只进 related work，不进结果表。
Flat-Folder 只作为终态 ground truth 的来源出现。

## H.5 实验条件与协议

| 条件 | 工具 | 测什么 |
| --- | --- | --- |
| **完整工具腰带** | 模拟器 + 提议 + 过滤 + 视觉（+ 哈密顿工具如就绪，+ 可选图像生成） | 上限 |
| **无工具，纯 prompting** | 无 | **记忆性对照** —— 是在通过循环推理，还是在回忆预训练里见过的折法？ |

同一个 VLM、同一批 CP、同样的预算。开跑前必须先定死：

- **输入匿名化。** CP 文件名直接带着模型名（`009_ku_Unassigned_Triangle_Pleat`）。
  如果无工具那一臂能读到这个名字，它就是在回忆而不是推理，于是**两臂都在测回忆**，这个 A/B
  什么都测不出来。去掉文件名和所有元数据，只喂几何。
- **query 预算。** 每个 CP 一个固定的 N，两臂完全相同。用尽预算记为**超时**（§I.2），
  不是 REJECT —— 这两件事含义不同。
- **重复次数与随机种子。** 每个 CP 跑 k 次，记录种子，报中位数和离散度。
- **失败原因的一致性。** 验证器是否返回原因必须与 A 组一致，并且在无工具臂仍能收到该信息的
  地方（比如以文本放进 prompt）保持两臂一致。
- 还要定死：失败后的重试次数、历史窗口、视觉通道的图像分辨率/渲染方式以及发送频率
  （每一步？只在失败/回溯时？）。

## H.6 指标与产出

**主指标 —— 序列层面**（跟 ground-truth 序列的编辑距离 / 步数比，F 组）。Probe B 实测终态问题
接近无需搜索 —— 传播判据的假阳性是 0%，因为「到达**某一个**合法终态」根本不是难的那一半
（`probes/probe-b-oracle.md`）。**难度在序列层**，所以最重要的数字必须从那里出。
⚠️ 序列指标只能在 A 桶上算 —— 这正是语料必须合成的原因（§I.0）。

**准入门槛 —— 终态匹配（ACCEPT 比例）。** 保留为准入判据（「它到底有没有产出一个合法终态」），
按 §I.2 的三个分层分别报，绝不合并。它不再是 headline。

**解决所需的 query 数** —— 在**全部**尝试上统计，不是只统计成功的；只看成功的会正好掩盖
Probe A 实测到的长尾爆炸。报预算内的完整分布 + 超时占比。

| 臂 | 成功率 | 解决所需 query 数 | 剪枝 P/R | 回溯误差 |
| --- | --- | --- | --- | --- |
| Random | | | — | — |
| BFS | | | — | n/a |
| DFS | | | — | n/a |
| Creasy | | （节点数 / 秒数） | — | — |
| Ours（完整工具腰带） | | | | |
| Ours（无视觉） | | | | |
| Ours（无工具，纯 prompting） | | | — | — |

如果假设成立，预期模式：Ours（完整）主要在 **query 数**上赢过 Random/BFS/DFS，不一定在成功率上赢；
Ours（无工具）跌回接近纯 prompting 的水平，确认增益来自工具；视觉消融显示几何/视觉反馈是否具体
帮助了剪枝正确性或回溯准确性（可能机制：看到折叠后的状态有助于抓住层序推理错误，正是 E 组的一类）。
如果 Ours（无工具）跟 Ours（完整）很接近，诚实的结论就是模型本来就「知道」这些折法 ——
如实报告，不要重新包装指标来掩盖它。

产出 = 这些数字 + E 组的错误分解，写成 Track 1 的论文。

**贡献**：(1) 在同一个 CP 集合、同一个 query 定义下可复现的基线阶梯，这是目前文献比较里缺失的；
(2) 一个按 query 效率和剪枝/回溯质量、而不只是成功率来评估的工具增强循环；
(3) 一个大多数「LLM 做规划」论文会跳过的直接记忆性对照；
(4) 一个呼应 Spa3R vs "I Know About Up!" 之争的视觉反馈消融。

---

# I. 数据

这是一份清单，不是一个合并好的数据集。**先读 §I.0**：没有任何可获取的来源能提供有规模的 A 桶，
所以主语料必须**合成**；真实来源只作锚点和 CP 供给。

| 桶 | 拥有 | 可用于 |
| --- | --- | --- |
| **A** | CP + 完整逐步序列 | 序列层面的指标（F 组） |
| **B** | 只有 CP + final result | ACCEPT/REJECT 循环（§H.2） |
| **C** | 只有 CP | 只能做探索 / pilot，不能打分 |

## I.0 合成 Pureland 语料 —— 主数据，尚未生成

- **方法**：从方纸出发随机施加 simple fold、记录序列、最后展开得到 CP。
  **生成是平凡的；逆问题（CP → Seq）才是难的** —— 这正是一个 benchmark 该有的结构。
  设计见 `corpus-plan.md`。
- **Ground truth**：**天然是 A 桶** —— 配对是构造出来的、不是标注出来的，所以没有东西要标注、
  也没有东西需要信任。
- **难度控制**：步数 —— 跟 PurelandFold 的 `step` 同轴同单位，所以合成语料和真实锚点可直接比较。
- **为什么**：两个真实的 A 桶候选分别是 27 条序列和几个经典模型，都撑不起 headline。
  **合成也是这个领域的常规做法，不是走捷径** —— Learn2Fold 自己的 OrigamiCode 是
  5,760 条序列 / 75,000 个已验证转移，绝大部分出自他们自己的符号模拟器。
- **状态**：未生成。刻意不预先设计的开放问题：随机折法该从什么分布里抽，才不会让语料全是退化
  情形（比如反复对折）。看完第一批再定。

## I.1 Flat-Folder `examples/instagram/` —— MIT · 366 个 `.fold` CP

github.com/origamimagiro/flat-folder。只有 CP；Flat-Folder 能按需把每个*解*成一个终态，但那是
算出来的输出、不是存下来的标签，而且一个 CP 可以有多个合法终态。**C 桶**，跑求解器并挑一个终态
即可升格为合成的 B 桶 —— 但这个「挑」是我们的实验选择，不是标签。OrigamiBench 用的就是这 366 个。

## I.2 可折性天花板：三分之一的语料根本无解

Probe C 阶段一（`probes/probe-c-screen.md`）用一个**精确的必要条件**筛过全部 366 个：

| 通过筛选（simple-foldable 的上界） | 241 / 366 = **65.8%** |
| --- | --- |
| **已证明不可 simple fold** | **125 / 366 = 34.2%** |

动作空间已定为 simple folding，所以**这 125 个在我们的动作空间里根本没有解**。在 366 上直接算
「解决比例」，天花板是 65.8%，而这跟模型好坏毫无关系。⚠️ 这个筛选是必要条件、不是充分条件 ——
通过不等于可折。而且 T4 证了一般情况下判定 simple foldability 是 NP-hard，所以无论怎么实现，
完整搜索一定会在一部分 CP 上超时。

**因此所有数据集层面的数字都按三层分别报，绝不合并：**

| 分层 | 定义 | 这一层的结果怎么读 |
| --- | --- | --- |
| **可折** | 完整搜索找到了序列 | 只有这一层的「解决比例」才是模型的分数 |
| **已证不可折** | 没通过 Probe C 的必要条件 | 只报数、不打分 —— 正确的模型应该**拒答** |
| **超时** | 搜索超出预算，状态未知 | 单独报占比；这是结果，不是缺口 |

**把三层合成一个百分比，是让这篇论文最快变得无法辩护的做法。** 分层与桶是**正交**的：
一个 CP 可以既是 B 桶、又是已证不可折。桶说的是「有什么 ground truth」，分层说的是「到底有没有解」。

## I.3 PurelandFold —— CC-BY-4.0 · 27 条序列 / 337 帧

huggingface.co/datasets/mayaweiz/PurelandFold。`cp.fold` 含**层序 ground truth**。
真正的 **A 桶** —— 我们找到的唯一一个有点规模的真实 A 桶来源。
**定位：真实性锚点，不是主数据。** 2026-09-15 实测（`corpus-plan.md`）：非局部依赖跨度
p50 = 0.7，而 instagram 是 p50 = 12.8，**差约 20 倍，且 PurelandFold 内部几乎没有跨度**。
这不是数据缺陷 —— 这就是「只做 simple fold」的含义。所以那条难度轴在这里不可用，只剩
`step`（5–21）一条轴，而 27 条序列撑不起 headline。跟 FoldingAgent 是同一个 Pureland 限制
（§H.4）：适合验证循环和算 A 桶序列指标，不能代表更难的复合折 CP。
**未决**：帧格式能否转成模拟器要的逐步 `.fold` 形状尚未确认；**74 行被跳过（`variables=0`）** ——
其中 27 行是 step-1，剩下约 47 行原因不明。

## I.4 Creasy 生成的 step-graph —— GPL-3 · 是生成器，不是静态数据集

github.com/xkevio/Creasy。对它 4 个 maneuver 能处理的任何 CP 计算完整 step-graph。对它覆盖到的
模型（千纸鹤、传统蛙基）这是真正的 A 桶，有的深达几万节点 —— 但仅限那一小撮，而且可能很贵地失败
（蛙基：约 30 分钟、22,665 个节点）。是少量高质量参考序列的来源，不是批量数据源。
我们跑它，但不把它的代码或输出并进我们要发布的东西。同时兼任 Creasy 基线（§H.4）。

## I.5 GamiBench —— MIT · 仓库 + HF 数据集

github.com/stvngo/GamiBench。这里唯一开箱即跑的 benchmark。它报告的指标（Accuracy、
Viewpoint Consistency、Impossible Fold Selection Rate）暗示是 QA/分类形态，可能意味着它的条目
不是原始的 `(CP, sequence)` 配对。桶待审计后确定。

## I.6 OrigamiSpace —— arxiv.org/abs/2511.18450（NeurIPS'25）· **无公开仓库**

不可获取：无法审计格式、也拿不到数据。定期重新检查。

## I.7 已关闭：Learn2Fold 不是数据源

曾是最高优先级的审计目标。**已核实 —— 这份数据对我们不存在。** OrigamiCode（5,760 条序列 /
75,000 个转移）绝大部分由他们自己的符号模拟器生成，而且**从未公开发布**。没有东西可审计、
可下载、可转换。Learn2Fold 只作为架构先例保留（§H.4）。

## I.8 通用 FOLD 来源，未审计，优先级最低

github.com/edemaine/fold（格式规范 + 示例）· origamisimulator.org（模型库）。如果上面审过的来源
太小，这些是*更多* CP（大多是 C 桶）的候选来源。尚未检查规模、许可证，以及是否带中间序列。

---

# 待办

**数据（最高优先级 —— 主路径）**
- [ ] **生成第一批合成 Pureland 语料（§I.0）**；在定死采样设计**之前**先看步数和退化分布。
- [ ] 写审计脚本，把 §I.1–I.5 每个来源的每个 CP 归到 A/B/C 桶，并对 A 桶记录有多少中间步骤。
      在做 dev/test 划分**之前**报出各桶大小（G 组要知道到底有多少样本能打分）。
- [ ] 给每个 instagram CP 打上 §I.2 的分层标签，避免任何人不小心在 366 上合并计分。
- [ ] 确认 PurelandFold 的帧格式能转成模拟器要的逐步 `.fold` 形状，并解释那 74 行被跳过的原因（§I.3）。
- [ ] 审计 GamiBench 的 HF 数据集形态 —— QA 条目 vs. 原始 CP/序列配对（§I.5）。
- [ ] 定期重查 OrigamiSpace 是否已有公开仓库（§I.6）。

**基线**
- [ ] 下载 Creasy 的 release jar，在同一批 CP 上跑，记录节点数 / 秒数 / 失败清单（§H.4）。
- [ ] 找到离散 PSO 的实现，或者细节足够、能便宜复现的原论文。

**要搭的东西**
- [ ] 曲面模拟器（§H.1）—— Track 1 真正的工程交付物。
- [ ] 哈密顿路径工具的 scoping note；不要让它卡住模拟器。
