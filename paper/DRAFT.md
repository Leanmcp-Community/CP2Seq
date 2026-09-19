# Origami as a Spatial Reasoning Benchmark with Free Exact Verification

Working draft, started 2026-09-19. Target: ICLR, datasets and benchmarks.

> **What this file is.** The paper's skeleton with the argued sections written out and the
> measured sections left blank. Intro, related work and method can be written now because they
> depend on decisions already made and code already shipped. Experiments, ablations and results
> are deliberately empty: **nothing goes in them that has not been run.** Placeholders are marked
> `[TO RUN]` and say what run would fill them.
>
> **Ownership.** This file owns the paper's prose. It does not restate what `DATASET.md`,
> `EXPERIMENTS_SETUP.md` or `notes/plan/*` own; it cites them. Numbers come from
> `notes/facts.json` with the same inline tags the other docs use, so `doccheck.mjs` guards them
> here too.

---

## 0. Front matter

**Title.** Origami as a Spatial Reasoning Benchmark with Free Exact Verification

**TL;DR.** Origami is a spatial reasoning domain where checking an answer is free: folding forward
is trivial, recovering the fold sequence is NP hard, and the engine that generates a problem
judges any proposed step exactly.

**Keywords.** verifiable rewards · spatial reasoning · benchmark · multimodal LLMs · interactive
environment · verifier · tool use · search and planning · synthetic data · computational origami

**Abstract.** Current draft lives in §11 of this file so that it is revised last, after the
sections it summarises.

---

## 1. Introduction

Four moves, in this order. The order is the argument: a reviewer should agree with move 1 before
origami is mentioned.

### 1.1 Verification is why some domains moved faster

Reasoning improved fastest where a candidate answer can be checked exactly, cheaply, and without a
human: mathematics and code. The checker is what makes large scale evaluation, rejection sampling,
search at test time, and reward from verification possible at all. Spatial and physical reasoning
has no such checker.

*Write this without overclaiming a causal law.* The claim is that free verification is a property
those domains have and this one lacks, and that the lack shapes how the field evaluates.

### 1.2 What the field does instead, and what each substitute costs

| Substitute | Cost |
| --- | --- |
| Static images, multiple choice | The model's proposal is never executed; a right answer for a wrong reason is unmarked |
| Learned surrogate simulators | A wrong verdict is indistinguishable from a right one, so the benchmark's own error rate is unknown |
| Human judgement, preference scores | Does not scale, and is not reproducible across papers |

**The line to land:** a benchmark can only be as trustworthy as the judge inside it.

### 1.3 Origami has the missing property

Folding forward is trivial: fold, record, unfold. Recovering the discrete fold sequence from the
resulting crease pattern is NP hard [Arkin et al. 2004; Akitaya, Demaine & Ku 2017]. The same
forward engine that generates a sample can rule on any proposed step exactly, at no cost, with no
learned model in the loop.

⚠️ **Do not oversell this as "origami is a proxy for physical intelligence."** The defensive
citation (flat origami is Turing complete) belongs in §7, and only as a defence against "this is a
toy problem" — never as evidence that skills transfer. Rule 110 is Turing complete too.

### 1.4 Why the task is hard in a way that matters

Three properties, each of which a maze-like testbed lacks:

1. **It gets harder as it proceeds.** Every fold thickens the stack and constrains the next one.
   This is measurable, not rhetorical: legal partial folds, layer counts and constraint counts per
   step all come out of the engine.
2. **Two kinds of state must be tracked at once, and they constrain each other.** A planar
   geometry (where the paper is) and an embedding topology (which face lies above which). The
   crease graph is fixed; the layer ordering is chosen, and choosing it is NP hard even given a
   valid mountain–valley assignment [Bern & Hayes 1996].
3. **The action space is a named object, not an invention.** all-layers / some-layers / one-layer
   simple folds, with finite or infinite fold lines, are defined and their complexity studied.

⚠️ **The claim that must not be made:** "legal moves are rare." The enumeration refutes it —
legal partial folds *grow* with depth. What falls is the hit rate of uniform random proposal,
which is a fact about a sampler, not about origami (`EXPERIMENTS_SETUP.md` §9).

### 1.5 Contributions

1. **CP2Seq**, a benchmark for crease-pattern-to-sequence recovery whose ground truth is
   *constructed rather than annotated*, stratified by fold depth and by coupling, reproducible
   from seeds.
2. **An environment that is also the verifier**: stepping it is the same act as asking for a
   verdict. Exact, free, no search, refusals named rather than boolean.
3. **A scoring protocol that survives non-unique solutions**: replay-based, at two levels of
   equality, with the symmetry group declared in advance.
4. **An evaluation of off-the-shelf multimodal LLMs** with a visual-feedback ablation, a
   filtering ablation, and a memorization control. `[TO RUN]`
5. **A measured scope boundary**: 89.3%<!--fact:probeC.provenNotPct--> of real crease patterns provably lie outside
   all-layers simple folding. The action space is bounded by evidence, not assertion.

---

## 2. Related work

Three groups. The table from `notes/reading/related-work-metrics-EN.md` is the backbone of §2.4
and should be reproduced in the paper, because it carries the structural argument.

### 2.1 Origami benchmarks for multimodal models

- **OrigamiSpace** (arXiv:2511.18450, Xu et al., Fudan / INF Technology). 350 instances, each
  carrying a CP diagram, compiled flat pattern, folding process and final folded image; four
  tasks; an interactive environment, with RL described as explored rather than demonstrated.
  ⚠️ **Cite as an arXiv preprint.** `papers.md` recorded it as NeurIPS'25; the arXiv record
  carries no venue, and the claim could not be substantiated.
- **GamiBench** (arXiv:2512.22207, Spencer et al.). 186 regular and 186 *impossible* crease
  patterns, six viewpoints, three VQA tasks; introduces viewpoint consistency (VC) and impossible
  fold selection rate (IFSR); reports that leading models struggle at single-step spatial
  understanding. **The strongest of the three to engage with**, because the impossible-pattern
  design is the closest anyone comes to executing a validity check.
- **OrigamiBench**, **FoldingAgent**, **COrigami**: see the metrics table.

**What all of them share, and it is the gap:** the model's proposal is answered by a question, not
by an execution. None of them steps a paper-exact engine.

### 2.2 Methods that pair a proposer with a simulator

- **Learn2Fold** (arXiv:2603.29585, Huang et al., cs.GR). Neuro-symbolic; formulates folding as
  conditional program induction over a crease-pattern graph; an LLM proposes folding programs and
  a **learned graph-structured world model** predicts feasibility and failure modes inside a
  lookahead planning loop. Its key insight, decoupling semantic proposal from physical
  verification, is the same division of labour this paper adopts.

  **Our relation to it, stated plainly and without hostility:** we agree with the decomposition
  and differ on the verifier. Theirs is learned, differentiable and approximate; ours is exact and
  free. Their scoring is step-level P/R/F1 against an expert sequence, which is exactly the
  measurement our corpus shows to be unsafe when a shorter correct solution exists.

- **AlphaGo-style proposer plus verifier** as the general precedent for "the network proposes, the
  search verifies". One sentence, as framing.

### 2.3 Computational origami: the theory the action space rests on

- Bern & Hayes, *The Complexity of Flat Origami*, SODA 1996. **Geometry does not determine layer
  order**; deciding overlap order is NP hard even given a valid M/V assignment. This is the
  citation under the paper's central claim.
- Arkin, Bender, Demaine, Demaine, Mitchell, Sethia & Skiena, *When Can You Fold a Map?*,
  Comput. Geom. 29(1):23–46, 2004. Simple foldability; the action space's definition.
- Akitaya, Demaine & Ku, *Simple Folding is Really Hard*, JIP 2017; *Infinite All-Layers Simple
  Foldability*; *Computing Flat-Folded States*, OSME 2024 (the Flat-Folder paper).
- Akitaya et al., *Generating Folding Sequences from Crease Patterns of Flat-Foldable Origami*,
  ACM SRC 2013. **CP→Seq was named in 2013**, by the same group whose tools this field uses.
- Demaine, Devadoss, Mitchell & O'Rourke, *Continuous Foldability of Polygonal Paper*, CCCG 2004.
  A well-behaved folded state is always reachable by *some* continuous motion, which is why the
  hard question is the **discrete step structure**, not reachability.
- Map/stamp folding counts, OEIS A000136, unsolved since Lucas (1891). Answers "why not just
  enumerate": there is no closed form even in one dimension.
- Ku & Demaine, thick folding, for the boundary to Track 2.

### 2.4 The structural gap this paper fills

From the metrics table: **every existing metric compares a produced artifact against a target.**
None ranks among the valid folded states of one crease pattern, and none scores an agent by how
much verification it needed. That absence is structural, because computing any of those metrics
requires a target.

---

## 3. Problem: crease pattern to fold sequence

### 3.1 Definitions

A **flat-folded state** is an isometric map of the sheet into the plane together with a layer
ordering. The map is fixed by the crease pattern; the ordering is not. Hence one crease pattern
admits many folded states that are geometrically identical yet distinct as embeddings.

⚠️ **Wording discipline** (from `notes/reading/geometry-topology-definitions.md`): say *spatial
reasoning*, not *3D reconstruction*; treat "is a three-dimensional representation necessary or
merely sufficient" as a **research question**, never as a premise. Do not use homotopy/isotopy
language.

### 3.2 The action space, and why it is a named one

Table of the four named models (one-layer / some-layers / all-layers; finite vs infinite line).
State which two this benchmark instantiates and why.

**What the all-layers restriction buys, including the property nobody names:** no
self-intersection, no layer-ordering question, and **no tearing** — the whole stack moves as a
rigid body, so nothing moves relative to anything else except at the fold line. The moment a fold
may move only *some* layers, tearing becomes the binding constraint.

### 3.3 The task

Given a crease pattern, produce a sequence of folds that reproduces it. Forward generation is
`O(folds)`; inverse recovery is NP hard. **This asymmetry is the paper's foundation** and should
appear as a figure: one arrow cheap, the other arrow hard.

---

## 4. CP2Seq: the benchmark

Prose summary only; `DATASET.md` owns the details and is cited rather than copied.

### 4.1 Generation

Fold forward from a square with random simple folds, record the sequence, unfold to obtain the
crease pattern. The `(CP, sequence)` pair is **built, not labelled**, so there is nothing to
annotate and nothing to trust. Every sample rebuilds byte-identically from its seed.

### 4.2 Difficulty, stratified rather than sampled

Two axes: **fold depth**, and **coupling** (creases created per fold, i.e. how many layers one
fold cuts). Coupling is free at generation time and is simultaneously the closest measurable proxy
for by-hand difficulty and the mechanism behind "it gets harder as it goes".

⚠️ **Report the empty cell rather than hiding it.** Long sequences at low coupling are nearly
unreachable, because every all-layers fold thickens the stack. Real folders reach that corner by
**pre-creasing**, which this action space excludes. That is a scope statement about the benchmark
and it belongs in the paper, not in an appendix.

### 4.3 What a sample carries

`cp.fold`, `seq.json`, `steps.fold`, `meta.json`. One line each; table from `DATASET.md` §1.2.

### 4.4 Verification of the corpus itself

`verify-replay.mjs` and `verify-exact.mjs`; the latter compares maximal crease intervals with no
tolerance in the verdict. ⚠️ **State the limit honestly**: both share the fold engine with the
generator, so neither can catch a wrong model of paper — they catch drift between what was folded
and what was recorded, which is the likelier failure and the one that silently corrupts ground
truth. An independent check needs a third-party solver.

---

## 5. The environment, which is also the verifier

### 5.1 The identity, stated once and clearly

Stepping the environment *is* asking for a verdict. There is no separate validity oracle to call,
and no learned component anywhere in the loop.

### 5.2 Division of labour, which is what makes the benchmark measure anything

| Who | Does what |
| --- | --- |
| **Environment / verifier** | State update and legality. It does not search and does not choose |
| **Model** | Proposes the next fold, decides where to go, knows when to backtrack |

The referee is not a player. Deciding global flat-foldability is NP hard, so exhaustive search is
not an option, and the model's value is compressing search from exponential to feasible — which is
precisely what the verifier cannot supply.

### 5.3 Refusals are named, not boolean

`would-tear`, `no-crease`, `nothing-to-move`, `direction-impossible`, `bad-line`. A model told
`would-tear` can act on it; a model told "illegal" cannot.

⚠️ **There is no `penetrate` refusal and there cannot be one in this action space**: a fold moves a
contiguous run of layers taken from one extremity, so self-intersection is *unrepresentable*,
excluded by construction rather than detected by a test. Flat-Folder's four constraint types
remain the right reference for **global terminal states**, not for one legal step.

### 5.4 Observations

Top-down X-ray plus an exploded layer stack. Every intermediate state in this tier is flat, so a
second camera angle adds nothing while layer structure adds everything. Positions are `(x, y)` in
original-sheet coordinates plus an **integer layer index**; there is no continuous `z` here.

### 5.5 Error verbosity is an experimental variable

The richer the refusal, the more of the reasoning the tool performs. Frozen before the first run
and reported; `[TO RUN]` if it becomes its own ablation axis.

---

## 6. Scoring protocol

### 6.1 Why the obvious protocol is wrong

The recorded sequence is **a** solution, not **the** solution: the generator folds, it does not
search, so nothing makes its sequence minimal. Measured, 2<!--fact:shorter.release.n--> of
100<!--fact:shorter.release.outOf--> verified samples admit a shorter one. **Any metric that
compares step-by-step against the recorded sequence marks a better answer wrong**, which
disqualifies edit distance and step-level P/R/F1 for this task.

### 6.2 What we do instead

Replay the proposed sequence through the engine and compare states. **Both sides are replayed**;
a stored frame is never the thing compared against, because stored frames carry no original-sheet
coordinates and congruent layers then become interchangeable (`DATASET.md` scoring rule 4).

**Level 1 — crease-set equality.** Exact multiset comparison of maximal creased intervals.

**Level 2 — folded-state equality up to a declared group.** The 8 square symmetries and an
arbitrary translation, where the four reflections also reverse the stack and flip every parity,
because turning a model over does all three at once. ⚠️ **Layer-order variants are deliberately
not in the group**: those are different states reachable from one crease pattern, and deciding
which are valid needs a solver, which would hide an external dependency inside an equality test.

### 6.3 Metrics

- **Primary: solve rate at a fixed query budget**, reported **per difficulty stratum, never
  pooled**, under Level 1 and Level 2.
- **Secondary: queries to solution**, reported over **all** attempts including those that exhaust
  the budget. Conditioning on success hides the long tail.
- Exhausting the budget is **Timeout**, which is not the same as a wrong answer.

### 6.4 Validation of the protocol itself

The comparator ships with a negative control: a deliberately corrupted stack must be rejected.
⚠️ **Report that this control caught a real defect** — comparing current-plane geometry and parity
alone accepted 23 of 600 corrupted states, because congruent faces from different parts of the
sheet were interchangeable. With face identity restored: 600 of 600 rejected. **A verifier paper
that does not test its own verifier is asking to be taken on trust.**

---

## 7. Anticipated objections, answered in the paper rather than in rebuttal

| Objection | Where it is answered |
| --- | --- |
| "The simulator does all the work" | §5.2 division of labour, plus queries-to-solution |
| "Origami is a toy problem" | Flat origami is Turing complete — **defensive use only**; expressiveness, not transfer |
| "Why not enumerate the states?" | No closed form even in one dimension (OEIS A000136); Flat-Folder state counts |
| "Synthetic data is a shortcut" | Comparable published corpora are produced by their authors' own symbolic simulators; synthesis is what makes difficulty controllable and ground truth free |
| "Your corpus is not real origami" | 89.3%<!--fact:probeC.provenNotPct--> scope boundary, stated as a limit, not hidden |
| "The model just memorised the pattern" | The no-tools arm on anonymized geometry, §9 |

---

## 8. Experiments `[TO RUN]`

**Nothing is written here until it is run.** What this section will contain:

- 8.1 Models evaluated, held fixed across arms `[TO RUN]`
- 8.2 Query budget, repeats, seeds; median and spread, never a single run `[TO RUN]`
- 8.3 Main table: solve rate per stratum, Level 1 and Level 2 `[TO RUN]`
- 8.4 Queries-to-solution distribution, including timeouts `[TO RUN]`

**Protocol fixed before the first run** (from `EXPERIMENTS_SETUP.md` §5): input anonymization,
identical budget across arms, k runs per CP with recorded seeds, stratified sampling.

---

## 9. Ablations `[TO RUN]`

| Arm | Removes | Measures |
| --- | --- | --- |
| Full tool belt | nothing | Upper bound |
| No vision | the rendered-view channel | The value of visual feedback specifically |
| Verifier only | the filter step | The value of filtering on top of raw verification |
| No tools | everything, anonymized geometry | **Memorization control** |

> If the no-vision or no-tools arm performs nearly as well, **that is a finding, not a failed
> experiment.**

---

## 10. Results and analysis `[TO RUN]`

- 10.1 Headline result `[TO RUN]`
- 10.2 Failure taxonomy by refusal class — every rejection already arrives labelled, which turns a
  reject into a diagnosis `[TO RUN]`
- 10.3 Where difficulty actually lives: depth vs coupling `[TO RUN]`

---

## 11. Abstract

> Progress on reasoning has been fastest where verification is free. In mathematics and in code, a
> candidate answer can be checked exactly, cheaply, and without a human, and that property has
> shaped how quickly those domains improved. Spatial and physical reasoning has no such checker,
> so it is evaluated instead with static images, multiple choice questions, or learned surrogate
> simulators whose wrong verdicts look exactly like their right ones. A benchmark can only be as
> trustworthy as the judge inside it.
>
> We show that origami is a domain where exact verification is free, and that the gap between
> generating a problem and solving it is severe. Folding a sheet forward is trivial: fold, record,
> unfold. Recovering the discrete sequence of folds that produced a crease pattern is NP hard. The
> same forward engine that generates a sample can therefore rule on any proposed step exactly, at
> no cost, with no learned model in the loop. The task is also not a puzzle chosen for
> convenience. It becomes strictly harder as it proceeds, because every fold thickens the stack
> and constrains the next one, and a solver has to track a planar geometry together with a layer
> ordering that continuously constrain each other.
>
> We release CP2Seq, a benchmark whose ground truth is constructed rather than annotated, together
> with an environment that is also the verifier: stepping it is the same act as asking for a
> verdict. It executes one candidate fold and either returns the resulting state or refuses with a
> named reason, such as the sheet would tear, the fold creases nothing, or the selected layers
> cannot move in that direction. It performs no search and makes no choices of its own, so the
> work of proposing, pruning and backtracking stays with the model, and what the benchmark scores
> is search rather than geometry.
>
> Samples are generated under two action models taken from the simple folding literature and
> stratified along two axes, fold depth and coupling, where coupling is the number of layers a
> single fold cuts. Every sample rebuilds byte identically from its seed and is checked by
> tolerance free replay. Because one crease pattern admits many valid folded states, and because
> the recorded sequence is not guaranteed to be minimal, an answer is scored by replaying the
> proposed sequence rather than by step wise agreement with the stored one. The scoring protocol
> is solve rate at a fixed query budget, reported per difficulty stratum under two notions of
> equality, equality of crease sets and equality of folded states up to a symmetry group declared
> in advance, with queries to solution as a secondary measure over all attempts including those
> that exhaust the budget. We instantiate this protocol on off the shelf multimodal language
> models, with ablations that remove visual feedback, remove filtering, and remove tools entirely
> as a memorization control on anonymized geometry.

⚠️ Revise this last, and replace the final sentence with a result sentence once §10 exists.

---

## 12. Limitations, written by us before a reviewer writes them

1. **No training.** Every arm is an off-the-shelf model driven by prompting and tool calling. The
   contribution is the harness, not a model. Say so in the introduction, not only here: a stated
   limitation is not an objection, a discovered one is.
2. **Scope of the action space.** 89.3%<!--fact:probeC.provenNotPct--> of real crease patterns lie outside all-layers
   simple folding. Pre-creasing, the operation real folders use to reach the long-and-loose
   corner, is excluded.
3. **The verifiers share an engine with the generator.** They cannot catch a wrong model of paper.
4. **Flat states only.** No thickness, no material, no mechanics. That is Track 2 and a separate
   paper by an explicit decision, because the verifier there costs about ten thousand times more.
5. **Level 2's group excludes valid layer-order variants**, so it is stricter than the truest
   notion of equality. Stated, with the reason.

---

## 13. Figures to make

| # | Figure | Status |
| --- | --- | --- |
| 1 | The asymmetry: forward trivial, inverse NP hard | to draw |
| 2 | **The tearing pair.** One state, one layer selection; a vertical fold line is legal and a horizontal one tears. The clearest single illustration of why some-layers is a different problem, and it needs only two folds | to draw |
| 3 | A refusal as the model sees it: view, named reason, per-constraint checklist with locations | to draw |
| 4 | Difficulty: depth × coupling, with the empty cell visible | to draw |
| 5 | Main result, per stratum | `[TO RUN]` |

---

## 14. Checklist before submission

- [ ] Every number in the paper carries a `fact:` tag and `doccheck.mjs` passes
- [ ] No claim that "legal moves are rare"
- [ ] No claim that the model performs 3D reconstruction
- [ ] Turing-completeness cited defensively only
- [ ] OrigamiSpace cited as an arXiv preprint unless a venue is confirmed
- [ ] `[TO RUN]` sections either filled or the paper is resubmitted as benchmark-only
- [ ] Abstract's final sentence replaced by a result sentence
