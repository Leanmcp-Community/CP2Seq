# Origami as a Spatial Reasoning Benchmark

Working draft, started 2026-09-19. Target: ICLR, datasets and benchmarks.

> **Status.** Sections 1 to 7 and 11 to 13 are written. Sections 8, 9 and 10 are empty and marked
> `[TO RUN]`, each saying which run would fill it. **Nothing goes into those three sections that
> has not been run.**
>
> **Ownership.** This file owns the paper's prose. It cites `DATASET.md`, `EXPERIMENTS_SETUP.md`
> and `notes/plan/*` rather than restating them. Numbers carry the repo's inline `fact:` tags, so
> `doccheck.mjs` guards them here as everywhere else. §14 holds the editorial rules that are about
> writing rather than content.

---

## Positioning

This paper is submitted as a **benchmark and dataset** contribution. What it offers the community
is an evaluation substrate for **spatial and geometric reasoning in large language models**: a
corpus, an environment that doubles as an exact verifier, and a scoring protocol, rather than a
model, a training method or a state-of-the-art number. Every arm reported here runs an
off-the-shelf model through the harness; nothing is trained. The claim under review is that the
benchmark measures what it says it measures and that its judge can be trusted, not that any
particular model is good at the task.

The reasoning being measured is geometric as much as it is spatial, and the distinction is
load-bearing rather than cosmetic. A solver has to reason about lines, reflections, incidence and
adjacency on the original sheet, which is geometry in the ordinary sense, and simultaneously about
a layer ordering that the geometry does not determine, which is combinatorial. Calling the task
spatial reasoning alone understates the second half. Positioning the work as a benchmark for
spatial *and geometric* reasoning states the scope accurately and places it beside the
multimodal-reasoning benchmarks of §2.1 rather than beside the computational-origami literature of
§2.3, which is the theory the benchmark rests on rather than the field it contributes to.

**Title.** The title may therefore carry *geometric reasoning* explicitly. Candidates, to be
settled before submission:

- *Origami as a Spatial and Geometric Reasoning Benchmark*
- *Origami as a Benchmark for Spatial and Geometric Reasoning in Multimodal Language Models*
- *CP2Seq: A Spatial and Geometric Reasoning Benchmark with an Exact Verifier*

The current title is *Origami as a Spatial Reasoning Benchmark*; the subtitle *with Free Exact
Verification* was removed, and the exactness of the verifier now carries in the abstract and §5
rather than in the title.

---

## Abstract

Progress on reasoning has been fastest where verification is free. In mathematics and in code, a
candidate answer can be checked exactly, cheaply, and without a human, and that property has
shaped how quickly those domains improved. Spatial and physical reasoning has no such checker, so
it is evaluated instead with static images, multiple choice questions, or learned surrogate
simulators whose wrong verdicts look exactly like their right ones. A benchmark can only be as
trustworthy as the judge inside it.

We show that origami is a domain where exact verification is free, and that the gap between
generating a problem and solving it is severe. Folding a sheet forward is trivial: fold, record,
unfold. Recovering the discrete sequence of folds that produced a crease pattern is NP hard. The
same forward engine that generates a sample can therefore rule on any proposed step exactly, at no
cost, with no learned model in the loop. The task is also not a puzzle chosen for convenience. It
becomes strictly harder as it proceeds, because every fold thickens the stack and constrains the
next one, and a solver has to track a planar geometry together with a layer ordering that
continuously constrain each other.

We release CP2Seq, a benchmark whose ground truth is constructed rather than annotated, together
with an environment that is also the verifier: stepping it is the same act as asking for a
verdict. It executes one candidate fold and either returns the resulting state or refuses with a
named reason, such as the sheet would tear, the fold creases nothing, or the selected layers
cannot move in that direction. It performs no search and makes no choices of its own, so the work
of proposing, pruning and backtracking stays with the model, and what the benchmark scores is
search rather than geometry.

Samples are generated under two action models taken from the simple folding literature and
stratified along two axes, fold depth and coupling, where coupling is the number of layers a
single fold cuts. Every sample rebuilds byte identically from its seed and is checked by tolerance
free replay. Because one crease pattern admits many valid folded states, and because the recorded
sequence is not guaranteed to be minimal, an answer is scored by replaying the proposed sequence
rather than by step wise agreement with the stored one. The scoring protocol is solve rate at a
fixed query budget, reported per difficulty stratum under two notions of equality, equality of
crease sets and equality of folded states up to a symmetry group declared in advance, with queries
to solution as a secondary measure over all attempts including those that exhaust the budget. We
instantiate this protocol on off the shelf multimodal language models, with ablations that remove
visual feedback, remove filtering, and remove tools entirely as a memorization control on
anonymized geometry.

---

## 1. Introduction

Multimodal language models have become genuinely good at visual work. They caption and answer
questions about natural images, read documents, charts and tables, transcribe text in photographs,
follow video, and drive graphical interfaces from screenshots alone. Over the last two years the
direction of travel on these tasks has been steeply upward, and on several of them the reported
numbers sit near careful human annotators.

It does not follow that these models reason about space. Most of the competence arrives through one
architecture: a vision encoder trained to align images with text, and an adapter that projects its
output into the language model's token stream. What that encoder is rewarded for preserving is
semantic. It answers *what is in this picture*, and it answers it well, because that is what the
training objective asks of it. Metric and relational structure is not rewarded and need not
survive the projection: exact angles, exact incidences, which of two nearly identical shapes lies
in front, how many times one line crosses another. Competence at recognising a scene and
competence at reasoning about its geometry are separable, and an adapter trained for the first
gives no guarantee of the second. When the task moves to geometric and spatial reasoning, the
ordering of models by their image-task scores need not survive.

⚠️ **Star example, to verify before it goes in.** The intended example is the *Vision Language
Models Are Blind* line of work, which reports that frontier models scoring well on hard visual
question answering fail at elementary geometric perception: deciding whether two circles overlap,
counting the intersections of two line plots, counting nested squares. The recorded reference is
Rahmanzadehgervi, Bolton, Taesiri and Nguyen, ACCV 2024, arXiv:2407.06581. **Verify the authors,
venue and the specific task list against the arXiv record before this sentence enters the paper.**
If any part does not hold exactly as stated, cut the example rather than soften it; one
unverifiable sentence in an introduction costs more than the example buys. Per §15 rule 7, no
citation enters this draft from memory.

Origami is an unusually clean place to look for the missing capability. It is an art form whose
entire content is geometric: a folder works from lines, reflections and incidences on a single
uncut sheet, and every decision is constrained by every decision before it. It also demands
spatial reasoning of a specific kind, because the sheet stops being flat the moment folding
begins. The folder has to track where each piece of paper now sits, which pieces lie above which,
and which of them are still joined to each other through the original sheet. A crease pattern, the
flat record left behind when a finished model is unfolded, contains all of that history and none
of its order. Reading a sequence back out of it is the skill that separates a practitioner from
someone who can recognise a crane.

We use origami as an instrument. The task we set a model is to recover the sequence of folds that
produced a crease pattern, given the pattern and the final folded state. It is a task with a
property that is rare and, for evaluation, decisive: it is trivial to generate and hard to solve.
Folding forward is a single pass of an engine that records what it did. Recovering the sequence is
NP hard [Arkin et al. 2004; Akitaya, Demaine & Ku 2017]. The same engine that generates a sample
therefore rules on any proposed step of a solution exactly, at no cost, with no learned component
in the loop, no tolerance to tune and no oracle to trust.

That asymmetry is what a benchmark wants, and it is what spatial and physical reasoning has
generally lacked. Benchmarks built on static images or multiple choice never execute the model's
proposal, so an answer that is right for the wrong reason is indistinguishable from one that is
right. Benchmarks built on learned surrogate simulators do execute the proposal, but against an
approximation whose wrong verdicts look exactly like its right ones, which leaves the benchmark's
own error rate unknown and unmeasurable from inside. Human judgement is exact in a sense and does
not scale. The consequence is worth stating plainly, because it motivates everything below: **a
benchmark can only be as trustworthy as the judge inside it.** Here the judge is the generator run
forwards, so difficulty is controllable rather than sampled, ground truth is recorded rather than
annotated, and negative examples are unlimited, because an illegal fold is produced by asking for
one.

Two recent benchmarks make origami a target for multimodal evaluation, and the difference between
them and this work is the difference between asking a model a question and executing its answer.
**GamiBench** pairs crease patterns with folded shapes rendered from six viewpoints and scores
multiple-choice visual question answering, including a set of deliberately impossible patterns a
model ought to reject. **OrigamiSpace** instruments each instance with a pattern diagram, the
folding process and a final image, and defines four tasks over them, from pattern prediction to
crease-pattern code generation. In both, a proposal is graded by comparison against a stored
target: the model selects among rendered alternatives, or emits an artifact that is matched to a
reference. Neither steps a paper-exact engine and asks whether *this* move, on *this* stack, is
something paper could do. Both therefore measure recognition of folded geometry, which is a real
capability, rather than the ability to search for a sequence that produces it. Section 2 makes the
comparison in full.

The distinction matters because the search is where the difficulty lives. Deciding whether a crease
pattern can be reached by simple folds at all is NP hard [Arkin et al. 2004; Akitaya, Demaine & Ku
2017], so recovering the sequence that produced one is at least as hard, and determining the layer
ordering of a flat folding is NP hard on its own even when a valid mountain-valley assignment is
supplied [Bern & Hayes 1996]. No amount of pattern recognition substitutes for search on a problem
of that shape. A benchmark that never executes a proposed step cannot tell a model that searched
from a model that recognised, and cannot report how much search either one needed.

The task is also hard in ways a maze or a grid-world is not. It gets harder as it proceeds: every
fold thickens the stack and constrains what the next fold may do, so the difficulty of step *k*
depends on steps 1 through *k−1*. And a solver has to maintain two kinds of state that constrain
each other. The crease graph is fixed once the pattern is given, but vertex coordinates are
reflected at every step, the overlap structure changes at every step, and the layer ordering
changes at every step and is *chosen* rather than computed. Determining that ordering is NP hard
even when a valid mountain-valley assignment is supplied [Bern & Hayes 1996]. Mazes have geometry
alone; here an independent combinatorial layer is tracked alongside it. The action space is not
invented for the occasion either: simple folds have been defined and their complexity studied for
two decades, so the operations an agent is given have names and claims about them can be checked
against a literature.

We contribute the following.

1. **A dataset, and the generator that built it.** CP2Seq holds 600 origami samples, each pairing a
   crease pattern with the fold sequence that produced it, the folded state after every step, and
   per-sample difficulty metrics. Ground truth is constructed rather than annotated, because the
   sequence is recorded as the fold happens. Samples are generated under two named action models
   from the simple folding literature and stratified by fold depth and by coupling. The corpus
   ships as a generator and a manifest rather than as data: every sample rebuilds byte-identically
   from its seed, so the dataset can be regenerated, extended, or re-stratified at a different
   difficulty by anyone who wants a different corpus than ours.

2. **An evaluation framework and environment, with progressive tiers of assistance.** The model is
   given the crease pattern and the final state and must recover the sequence, so it works from
   partial information about the structure throughout. The environment it works against is also the
   verifier: stepping it is the same act as asking for a verdict. It executes one candidate fold and
   either returns the resulting state or refuses with a named reason, such as the sheet would tear
   or the fold creases nothing. It performs no search and makes no choices, so proposing, pruning
   and backtracking stay with the model. Around it sits a graded tool belt, from a full belt with
   rendered views down through withheld vision and raw pass/fail to no tools at all, so the
   contribution of each assistance level is measured rather than assumed. The framework also
   supplies the scoring protocol: answers are judged by replaying them through the engine, at two
   declared levels of equality, because one crease pattern admits many valid folded states and the
   recorded sequence is not guaranteed to be the shortest.

3. **An evaluation of frontier multimodal models** against this dataset through this framework,
   with the tool tiers as ablations and a memorization control on anonymized geometry. `[TO RUN]`

4. **A measured scope boundary.** 89.3%<!--fact:probeC.provenNotPct--> of real crease patterns provably lie outside
   all-layers simple folding. The benchmark's action space is bounded by evidence rather than by
   assertion, and the boundary is reported rather than buried.

`[TO RUN: one sentence of headline result here, once §10 exists. It states what the frontier models
actually do on the task and is the last thing a reader of the introduction should see.]`

---

## 2. Related work

### 2.1 Origami benchmarks for multimodal models

**OrigamiSpace** (arXiv:2511.18450) contributes 350 instances, each carrying a crease pattern
diagram, a compiled flat pattern, the complete folding process and a final folded image, and
defines four tasks over them: pattern prediction, multi-step spatial reasoning, spatial
relationship prediction, and end-to-end crease-pattern code generation. It also provides an
interactive environment and describes reinforcement learning as a possibility explored rather than
a result demonstrated. Its design lesson is that one richly instrumented sample can support
several tasks, which is how 350 instances sustain a benchmark paper.

**GamiBench** (arXiv:2512.22207) contributes 186 regular and 186 *impossible* crease patterns
paired with folded shapes from six viewpoints, across three visual question-answering tasks, and
introduces two diagnostic metrics: viewpoint consistency and impossible fold selection rate. Its
impossible patterns are the closest the current literature comes to forcing a model to judge
feasibility rather than recognise a shape, and its headline finding is that leading models
struggle even at single-step spatial understanding. It is the benchmark this work is most directly
in conversation with, and the one whose negative examples we can produce without limit, because
generating an illegal fold in our environment is the same operation as generating a legal one.

**OrigamiBench**, **FoldingAgent** and **COrigami** complete the picture; their metrics appear in
the comparison of §2.4.

What all of these share is the gap. In each, the model's proposal is answered by a question rather
than by an execution: it selects among rendered alternatives, or produces an artifact that is
compared to a target. None of them steps a paper-exact engine and asks whether *this* move, on
*this* stack, is something paper could do.

### 2.2 Methods that pair a proposer with a simulator

**Learn2Fold** (arXiv:2603.29585) formulates origami as conditional program induction over a
crease-pattern graph. A language model generates candidate folding programs from text, and a
learned graph-structured world model acts as a differentiable surrogate simulator that predicts
physical feasibility and failure modes before execution, inside a lookahead planning loop. Its
stated key insight is to decouple semantic proposal from physical verification.

We adopt that decomposition and differ on one thing: the verifier. Theirs is learned,
differentiable and approximate, which is what makes it usable for planning and also what makes its
mistakes invisible. Ours is exact and costs nothing, because it is the generator run forwards.
Their scoring is step-level precision, recall and F1 against an expert sequence, together with
edge-level IoU; §6.1 shows why that family of measures is unsafe in this task, since a model that
finds a *shorter* correct sequence is marked wrong by it. That is a finding about scoring in this
setting rather than a criticism of their results.

The general precedent for a proposer paired with a verifier is older than any of this work: a
network that proposes and a search that checks is the structure behind AlphaGo, and the reason the
combination is stronger than either half.

### 2.3 Computational origami: the theory under the action space

The benchmark's central claim, that geometry does not determine a folded state, is Bern and
Hayes's: deciding the overlap order of a flat folding is NP hard even given a valid
mountain-valley assignment [*The Complexity of Flat Origami*, SODA 1996]. The action space is
Arkin et al.'s: simple folds, in the one-layer, some-layers and all-layers variants, with finite
or infinite fold lines [*When Can You Fold a Map?*, Comput. Geom. 29(1):23–46, 2004]. Their
complexity has been mapped since, including simple foldability's hardness [Akitaya, Demaine & Ku,
*Simple Folding is Really Hard*, JIP 2017] and the infinite all-layers case [Akitaya et al.,
*Infinite All-Layers Simple Foldability*]. The solver whose constraint vocabulary we borrow for
terminal states is Flat-Folder [Akitaya, Demaine & Ku, *Computing Flat-Folded States*, OSME 2024].

Two results shape what the task actually is. Demaine, Devadoss, Mitchell and O'Rourke showed that
any well-behaved folded state is reachable by *some* continuous motion [*Continuous Foldability of
Polygonal Paper*, CCCG 2004]; the question is therefore never whether a path exists, but whether
one exists through a finite number of the discrete operations a hand or a machine can perform. And
counting foldings has no closed form even for a one-dimensional strip, a problem open since Lucas
attributed it to Lemoine in 1891 [OEIS A000136]; this is the answer to "why not enumerate the
states", and it is a fact about the problem rather than about any implementation.

Finally, the problem itself is not new: generating folding sequences from crease patterns was
named and attacked symbolically by Akitaya et al. in 2013, by the same group whose tools this
field now depends on. What is new is neither the problem nor the theory, but the observation that
this problem supplies an exact verifier for free and can therefore serve as an evaluation
substrate for models that reason with tools.

### 2.4 The structural gap

The two closest benchmarks are worth setting beside this one directly, because a reader who knows
them will ask what is left to do.

| | **GamiBench** | **OrigamiSpace** | **CP2Seq (this work)** |
| --- | --- | --- | --- |
| Model produces | A choice among rendered options | A predicted pattern, a relation, or crease-pattern code | A sequence of folds, one step at a time |
| Judged by | Agreement with the stored answer | Similarity to a stored target, or compilation | Execution of each step, then replay of the whole |
| Judge is | A stored key | A comparison against a reference artifact | The fold engine itself, run forwards |
| Judge can be wrong | Not applicable; no execution | Where similarity stands in for correctness | Only if the model of paper is wrong, which replay cannot detect (§4.4) |
| Wrong answers | 186 authored impossible patterns | Not a designed axis | Unlimited: an illegal fold is produced by asking for one |
| Ground truth | Annotated per instance | Annotated per instance | Constructed; recorded as the fold happens |
| Non-unique answers | One key per question | Compared against one reference | Replayed and compared up to a declared symmetry group (§6.2) |
| Scores search effort | No | No | Yes: queries to solution, over all attempts (§6.3) |

Read across the bottom three rows rather than the top. GamiBench's impossible patterns are the
closest the literature comes to forcing a judgement of feasibility rather than a recognition of
shape, and they are authored, which is why there are 186 of them; here the same object is a
by-product of generation and there is no limit on it. OrigamiSpace's instrumentation per instance
is richer than ours and is the reason 350 instances sustain a benchmark paper; what it does not
have is a judge that can rule on a step the authors never anticipated. Neither ranks among the
several valid folded states of one crease pattern, because both compare against a stored answer,
and a stored answer cannot represent a set.

None of this is a defect in either benchmark. Both were built to measure whether a model
understands folded geometry, and they measure it. The claim here is narrower: that measuring
whether a model can *search* for a folding sequence requires a judge that executes, and that
origami supplies one for free.

Collecting the metrics used across this literature makes one absence visible. Every metric in use
compares a produced artifact against a target: geometric or semantic similarity to a reference,
precision and recall against an expert sequence, IoU over affected edges, compilation success,
human preference. **None ranks among the several valid folded states of a single crease pattern,
and none scores an agent by how much verification it required.** The absence is structural rather
than accidental, because computing any of those metrics requires a target to compare against, and
the interesting question here has more than one right answer.

---

## 3. Problem formulation

### 3.1 Flat-folded states

A flat-folded state is an isometric map of the sheet into the plane together with a layer
ordering. The map is fixed by the crease pattern; the ordering is not. A single crease pattern
therefore admits many folded states that are geometrically identical and distinct as embeddings,
and determining the ordering is NP hard even when a valid mountain-valley assignment is given
[Bern & Hayes 1996].

This distinction is the reason the task cannot be reduced to geometry. Over a folding sequence the
crease graph's topology never changes: the same vertices, edges and faces exist at step one and at
step nineteen. What changes is everything else. Vertex coordinates are reflected at every step.
The overlap structure, which faces lie above which, changes at every step and follows from the
geometry. The layer ordering changes at every step and does *not* follow from the geometry; it is
chosen, and it is where the decisions live. The number of layers accumulates, which is the formal
content of "it gets harder as it goes".

### 3.2 The action space

Simple folds come in named variants, and any benchmark in this area has to say which it uses,
because the complexity results differ between them.

| Model | Definition |
| --- | --- |
| One-layer simple fold | Rotate a single layer ±180° about a line |
| Some-layers simple fold | Rotate a contiguous run of layers |
| All-layers simple fold | Rotate every layer the line crosses, as sheet metal bends |
| Finite vs infinite line | Whether the fold line is a full line or a segment |

CP2Seq instantiates the all-layers and some-layers tiers. The all-layers tier is the simpler
object and it buys three properties at once, the third of which is rarely named. Because the whole
stack moves as a rigid body, no two connected pieces of paper ever move relative to each other
except at the fold line itself, where paper is allowed to bend. Self-intersection is impossible,
the layer ordering is forced rather than chosen, and **tearing is impossible by construction.**

Moving only some layers brings all three back, and tearing becomes the binding constraint. If a
moving face is joined to a stationary face along a crease, and that crease is not on the fold
line, the fold would rip the sheet. This is decidable only in the coordinates of the original
square, because adjacency is a fact about the original sheet that survives any amount of folding
and cannot be recovered from the current positions of the polygons alone.

An example makes the tier difference concrete, and it needs only two folds. Fold the right half of
a square over to the left across the vertical midline. The result is a two-layer stack whose top
layer is joined to the bottom layer along the entire crease at the midline. Now select the top
layer alone. Folding its upper half down across the horizontal midline would tear the sheet,
because the moving piece is joined to stationary paper along a vertical crease segment that is
perpendicular to the fold line. Folding its left quarter across a vertical line does not tear,
because the moving piece's only join to stationary paper lies on the fold line itself. Same state,
same layer selection, opposite verdicts, and the only difference is the orientation of the line.

### 3.3 The task

Given a crease pattern, produce a sequence of simple folds that reproduces it. Generating an
instance costs one forward pass of the engine; solving it is NP hard. That asymmetry is the
paper's foundation.

⚠️ One claim must not be made, and it was drafted wrongly here once. It is tempting to say that
legal moves are rare and that this is what makes the task hard. Enumeration refutes it: legal
partial folds *grow* with depth, from 22 at two layers to 332 at thirty-eight, six times the 56
all-layers folds available at the same state. What falls is the hit rate of uniform random
proposal, from 11.9% to 3.8% by seventeen layers, because the space being sampled grows faster
than the legal set inside it. That is a fact about a sampler, not about origami, and conflating
the two would put a false statement about branching factor into the paper.

---

## 4. CP2Seq

### 4.1 Generation

The corpus is synthesised and the project takes no outside data. A sample is produced by folding
forward from a square with randomly chosen simple folds, recording each fold as it is applied, and
unfolding at the end to obtain the crease pattern. The `(pattern, sequence)` pair is built rather
than labelled, so there is nothing to annotate and nothing to trust, and every sample is correct
by construction: the pattern is what the folding left behind.

Nothing is shipped that cannot be rebuilt. Given its seed, a sample regenerates byte-identically,
so the corpus is distributed as a generator plus a manifest rather than as data.

### 4.2 Difficulty, stratified rather than sampled

Difficulty is set by the sampler along two axes rather than measured after the fact. **Fold depth**
is the primary axis. **Coupling**, the number of creases a single fold creates, which is to say how
many layers it cuts, is the second; it is free to compute at generation time, since one fold cuts
every layer it crosses and each cut becomes one crease in the unfolded square. Coupling is
simultaneously the non-local dependency that Learn2Fold's difficulty tiers appeal to and the
closest measurable proxy for how hard a model is to fold by hand.

The release corpus holds 600 samples in five batches: 400 all-layers samples spanning 4 to 19
folds, stratified easy, mid and hard on the action space's tertiles, and 200 some-layers samples
at depths 3 to 6. Median crease count is 33 and median layer count 24, with the deep tail reaching
tens of thousands of both.

⚠️ Two limits belong in the paper rather than in an appendix. The first is an empty cell: long
sequences at low coupling are almost unreachable, yielding 2<!--fact:corpus.synth.lLocalHits--> hits in 16,000 attempts,
because every all-layers fold thickens the stack, so a long sequence cannot keep cutting few
layers. Real folders reach that corner by **pre-creasing**, an operation this action space
excludes. The longer a real model runs, the more of it sits outside what the benchmark can
express. The second is depth: the some-layers tier stops at six folds in this release, and the
difficulty the benchmark is about lives past the depth a search can reach. Restoring the deeper
tier is a matter of generator configuration and wall-clock, not redesign.

### 4.3 What a sample carries

| File | Contents |
| --- | --- |
| `cp.fold` | The crease pattern, planarised. The input |
| `seq.json` | Every fold: line, direction, creases made, coupling. The ground truth |
| `steps.fold` | The pattern plus the folded state after each step, as one multi-frame file |
| `meta.json` | Difficulty metrics, degeneracy flags, provenance |

### 4.4 Verifying the corpus itself

Two checks run over every sample, written independently of each other. The first replays each
recorded sequence and confirms it reproduces the pattern stored beside it. The second, written
without reference to the first, compares maximal creased intervals as multisets with no tolerance
in the verdict, after clustering edges into lines so that subdivision differences cannot register
as disagreements. Both pass on all 600 samples of the release corpus.

⚠️ Both share the fold engine with the generator, which bounds what they can establish. They
cannot catch a wrong model of paper: if the engine is wrong about tearing, replay is wrong in the
same way and agrees with itself. What they do catch is drift between what was folded and what was
recorded, which is the likelier failure and the one that silently corrupts ground truth. An
independent check requires a third-party solver and is not claimed here.

---

## 5. The environment, which is also the verifier

### 5.1 One object, two names

In this benchmark the environment and the verifier are the same object. Stepping it is the same
act as asking for a verdict: the model submits a candidate fold, and the reply is either the
resulting state or a refusal. There is no separate validity oracle, no second artifact that could
disagree with the first, and no learned component in the loop.

### 5.2 The division of labour

| Component | Responsibility |
| --- | --- |
| Environment / verifier | State update and legality. It does not search and does not choose |
| Model | Proposes the next fold, decides where to go, recognises when to backtrack |

This division is what makes the benchmark measure something. The obvious objection to any
tool-augmented setup is that the tool is doing the work, and here the answer is structural rather
than rhetorical: deciding global flat-foldability is NP hard, so the environment cannot search its
way to an answer even in principle. It can only say whether one proposed step is something paper
could do. Compressing an exponential search into a feasible number of queries is exactly what the
environment cannot supply and exactly what the model is being measured on. The referee is not a
player.

### 5.3 Refusals are named

An illegal fold returns a structured refusal with a name, not a boolean.

| Refusal | Meaning |
| --- | --- |
| `would-tear` | The moving layers are joined to stationary paper away from the fold line, so the sheet would come apart. The binding constraint of the some-layers tier |
| `no-crease` | The fold moves layers without creasing anything, tearing them free of the sheet rather than folding them |
| `nothing-to-move` | The fold line misses the selected layers entirely |
| `direction-impossible` | A run taken from the bottom of the stack was asked to fold over, or the reverse |
| `bad-line` | The fold line is malformed, or names no side of itself |

The names are the design. A model told `would-tear` can act on the information; a model told
"illegal" cannot. This also turns error analysis into a taxonomy that exists before the
experiment: every rejection arrives already labelled with the class it violated, so a reject is a
diagnosis rather than a dead end.

⚠️ There is deliberately no self-intersection refusal, and there cannot be one in this action
space. A some-layers fold may only move a contiguous run of layers taken from the top or the
bottom of the stack, and such a move cannot drive paper through the layers it left behind. Lifting
the top two layers and folding them across is something a hand can do; folding them *underneath*
the stack is not a fold but a slit. Restricting selection to a run at one extremity makes the
illegal case unrepresentable rather than undetected. The four constraint classes that Flat-Folder
checks (taco-taco, taco-tortilla, tortilla-tortilla, transitivity) remain the right vocabulary for
global terminal states; they are not what a single legal step needs checking against here.

### 5.4 What the model observes

On success the environment returns the new state together with two views: a top-down X-ray of the
stack, and an exploded view of the layers. Every intermediate state in this tier is flat, so a
second camera angle would show the same silhouette rotated and would carry no new information;
what carries information is layer structure, which is why the second view is an explosion rather
than a rotation. Positions are reported as coordinates on the original sheet together with an
integer layer index. There is no continuous vertical coordinate at this tier, and a rendering that
looks three-dimensional is not evidence of one; thickness belongs to a different problem and a
different paper.

### 5.5 Error verbosity is an experimental variable

The richer a refusal, the more of the reasoning the environment performs rather than the model. At
the limit, a message that names the fix has solved the step. Verbosity is therefore fixed before
the first run and reported with the results; otherwise the tool-augmented condition is not
reproducible and its comparison against the verifier-only condition measures message design rather
than reasoning.

---

## 6. Scoring

### 6.1 Why the obvious protocol is wrong

The recorded sequence is *a* solution, not *the* solution. The generator folds; it does not
search, so nothing makes its sequence minimal, and no minimal-length label is shipped because
producing one would require a search this benchmark deliberately does not run. Measured on the
verified split, 2<!--fact:shorter.release.n--> of 100<!--fact:shorter.release.outOf--> samples admit a sequence one fold shorter than the one that
built them.

The consequence is sharp. **Any metric that compares a proposal step by step against the recorded
sequence marks a better answer wrong.** A model that finds a shorter correct solution is penalised
for it. This disqualifies edit distance, and it disqualifies step-level precision, recall and F1
against an expert sequence for this task. Step count is not a correctness signal in either
direction.

### 6.2 What we do instead

Proposals are scored by replaying them through the engine and comparing the resulting states.
Both sides are replayed: the model's sequence and the reference sequence both pass through the
same engine, and a stored frame is never the object compared against. That last point is a
consequence of the file format rather than a preference. Stored frames record where each face sits
in the current plane and not which piece of the original sheet it is, and deep in a stack many
layers are congruent triangles, so two states differing by a swap of two such layers cannot be
distinguished from stored frames alone. A replayed state carries original-sheet coordinates for
free, because the engine needs them to decide tearing at all.

Two levels of equality are reported.

**Level 1, crease sets.** An exact multiset comparison of maximal creased intervals, equal rather
than overlapping, with no tolerance in the verdict.

**Level 2, folded states up to a declared group.** Because one crease pattern admits many valid
terminal states, exact equality against the one stored state would mark correct answers wrong. The
answer is not a tolerance but an equivalence: declare in advance which differences do not count,
then demand exactness inside that. The group is the eight symmetries of the square together with
an arbitrary translation. Translation is included because a fold can carry paper off the original
square, so a folded state's position in the plane is an accident of the sequence. The four
reflections additionally reverse the stack and flip every face's parity, because turning a model
over does all three at once; applying a reflection to coordinates alone would compare a model
against its mirror image and silently accept wrong answers.

⚠️ The layer-order variants that a flat-foldability solver reports as equally valid are
deliberately *not* in the group. Those are not symmetries of one state; they are different states
reachable from the same crease pattern, and deciding which orderings are valid requires a solver.
Folding that into an equality test would hide an external dependency inside what reads as
arithmetic. If that equivalence is wanted, it belongs in a separate check that owns the solver.

### 6.3 Metrics

The primary metric is **solve rate at a fixed query budget**, reported per difficulty stratum and
never pooled, under both levels of equality. A proposal is solved if replaying it reproduces the
target. Exhausting the budget is a timeout, which is reported separately from a wrong answer
because the two mean different things.

The secondary metric is **queries to solution**, reported over all attempts including those that
time out. Conditioning on the solved attempts hides precisely the long-tail blowup that makes the
task interesting. This metric is what answers the "the simulator did all the work" objection
quantitatively: two models sharing one exact verifier can be ranked by how little of it they
needed.

### 6.4 Validating the protocol

A verifier paper that does not test its own verifier is asking to be taken on trust, so the
comparator ships with a negative control: a deliberately corrupted state, with two layers swapped,
must be rejected.

The control earned its place. On its first full run, 23 of 600 corrupted states were **accepted**.
The cause was not a tolerance. The comparison used current-plane geometry and parity alone, and
deep in a stack many layers are congruent triangles, so two layers occupying the same region but
originating from different parts of the sheet were interchangeable. They are not interchangeable:
which one lies underneath is a real difference between two folded states, and precisely the
difference Level 2 exists to catch. With face identity on the original sheet restored to the
comparison, the full corpus reports 600 states equal, all under the identity symmetry, and 600 of
600 corrupted states rejected. Every verdict additionally reports whether face identity was
available, so a weakened comparison is visible in the output rather than assumed away.

---

## 7. Objections, answered here rather than in rebuttal

**"The simulator does all the work."** It cannot: deciding flat-foldability is NP hard, and the
environment only rules on single steps. §5.2 states the division of labour and §6.3 measures it.

**"Origami is a toy problem."** Flat origami is Turing complete, so the domain is not expressively
impoverished. ⚠️ This is a defensive citation and nothing more. It shows that the domain is rich
enough to be interesting; it does not show that anything learned here transfers, and the causal
chain from "origami is Turing complete" to "training on origami yields physical understanding" is
broken in the middle. Rule 110 is Turing complete too.

**"Why not enumerate the valid states?"** There is no closed form for the number of foldings even
of a one-dimensional strip, a problem open since 1891, and state counts for real patterns reach
astronomical magnitudes. The hardness is the problem's, not an implementation's.

**"Synthetic data is a shortcut."** The comparable published corpora are largely produced by their
authors' own symbolic simulators; synthesis is the field's normal practice. Here it is also what
makes difficulty controllable and ground truth free, and what allows the corpus to ship as a seed
rather than as a file.

**"Your corpus is not real origami."** Correct, and measured: 89.3%<!--fact:probeC.provenNotPct--> of real crease
patterns provably lie outside all-layers simple folding. This is stated as a scope boundary in §1
and §12 rather than left for a reviewer to discover.

**"The model may have memorised the pattern."** The no-tools arm runs on anonymized geometry with
filenames and metadata stripped, for exactly this reason: if a model can read a pattern's name it
recalls rather than reasons, and then both arms measure recall and the comparison measures
nothing. §9.

---

## 8. Experiments `[TO RUN]`

- **8.1 Models.** Held fixed across arms; comparing across models would confound the ablation.
  `[TO RUN: the main evaluation sweep]`
- **8.2 Protocol.** Query budget, repeats, seeds; median and spread reported, never a single run,
  because sampling is not deterministic and one run is not a measurement.
  `[TO RUN: same sweep]`
- **8.3 Main table.** Solve rate per stratum under Level 1 and Level 2.
  `[TO RUN: same sweep]`
- **8.4 Query distribution.** Queries to solution over all attempts, with the timeout fraction.
  `[TO RUN: same sweep]`

---

## 9. Ablations `[TO RUN]`

| Arm | Tools available | What it measures |
| --- | --- | --- |
| Full tool belt | Environment, views, any auxiliary tools | Upper bound |
| No vision | Same, rendered views withheld | The value of visual feedback specifically |
| Verifier only | Pass/fail, no filtering | The value of filtering on top of raw verification |
| No tools | None, anonymized geometry | Memorization control |

Same model, same patterns, same query budget across arms. If the no-vision or no-tools arm
performs nearly as well as the full arm, **that is a finding rather than a failed experiment**: it
means the gain is not where it was assumed to be. `[TO RUN]`

---

## 10. Results `[TO RUN]`

- **10.1 Headline.** `[TO RUN]`
- **10.2 Failure taxonomy.** Rejections grouped by refusal class; the taxonomy already exists, so
  this is tabulation rather than interpretation. `[TO RUN]`
- **10.3 Where difficulty lives.** Depth against coupling. `[TO RUN]`

---

## 11. Limitations

**No training.** Every arm is an off-the-shelf model driven by prompting and tool calling; no
model is trained or fine-tuned. The contribution is the harness, not a model. This is stated in
the introduction as well as here, because a limitation the authors declare is context and one a
reviewer discovers is an objection.

**Scope of the action space.** 89.3%<!--fact:probeC.provenNotPct--> of real crease patterns lie outside all-layers
simple folding, and pre-creasing, the operation real folders use to reach long sequences at low
coupling, is excluded.

**The corpus verifiers share an engine with the generator**, so they cannot detect a wrong model
of paper. They detect drift between what was folded and what was recorded.

**Flat states only.** No thickness, no material, no mechanics. Thickness changes the geometry
outright and belongs to a separate line of work with a verifier several orders of magnitude more
expensive.

**Level 2's group is narrower than the truest notion of equality**, because valid layer-order
variants are excluded for the reason given in §6.2. It is therefore strict rather than permissive,
which is the safe direction but not a free one.

---

## 12. Figures

| # | Figure | Status |
| --- | --- | --- |
| 1 | The asymmetry: generation is one forward pass, recovery is NP hard | To draw |
| 2 | The tearing pair of §3.2. One state, one layer selection, a vertical fold line legal and a horizontal one not | To draw |
| 3 | A refusal as the model receives it: view, named reason, per-constraint checklist with locations | To draw |
| 4 | The difficulty grid, depth against coupling, with the empty cell visible | To draw |
| 5 | Main result per stratum | `[TO RUN]` |

---

## 13. Reproducibility

The corpus ships as a generator and a manifest; every sample rebuilds byte-identically from its
seed. The environment, both corpus verifiers and the state comparator are released with the
benchmark. The negative control of §6.4 runs as a command, so a reader can confirm that the
comparator rejects corrupted stacks rather than taking §6.4 on trust.

---

## 14. References

Grouped by the role each work plays in the argument rather than alphabetically, so that a
co-author can see what is load-bearing. Entries marked ⚠️ need a citation fixed before submission.

### 14.1 Origami benchmarks and systems for language models

| Key | Work |
| --- | --- |
| `origamispace` | R. Xu, D. Lu, Z. Zhao, X. Tan, X. Wang, S. Yuan, J. Chen, Y. Xu. **OrigamiSpace: Benchmarking Multimodal LLMs in Multi-Step Spatial Reasoning with Mathematical Constraints.** arXiv:2511.18450, Nov 2025. ⚠️ Cite as a preprint; `papers.md` recorded NeurIPS'25 and the arXiv record carries no venue |
| `gamibench` | R. Spencer, R. Yaari, R. Vemavarapu, J. Yang, S. Ngo, U. Sharma. **GamiBench: Evaluating Spatial Reasoning and 2D-to-3D Planning Capabilities of MLLMs with Origami Folding Tasks.** arXiv:2512.22207, Dec 2025. Code and data released |
| `learn2fold` | Y. Huang, Y. Chen, Y. Jiang, J. Han, Z. Tu, Y. Yang, C. Jiang. **Learn2Fold: Structured Origami Generation with World Model Planning.** arXiv:2603.29585 (cs.GR), Feb 2026, rev. Apr 2026 |
| `foldingagent` | M. Moriya et al. **FoldingAgent.** arXiv:2609.00377. Reconstructs folding processes from instructional video; built on the PurelandFold dataset. Code: `github.com/maya-moriya/FoldingAgent` |
| `origamibench` | **OrigamiBench.** ⚠️ **Citation missing.** Appears in our metrics survey as the source of query efficiency and geometric/semantic similarity, and its dataset is the 366<!--fact:corpus.instagram.total--> patterns in Flat-Folder's `examples/instagram/`. A full reference has to be recovered before submission |
| `corigami` | **COrigami.** ⚠️ **Citation missing.** Appears in the metrics survey (flat-foldability as a boolean, VLM aesthetic score). Same action needed |

### 14.2 Complexity and theory of flat folding

| Key | Work |
| --- | --- |
| `bern-hayes` | M. Bern, B. Hayes. **The Complexity of Flat Origami.** SODA 1996, 175–183. *Geometry does not determine layer order: deciding overlap order is NP hard even given a valid mountain-valley assignment.* The citation under the paper's central claim |
| `arkin-map` | E. Arkin, M. Bender, E. Demaine, M. Demaine, J. Mitchell, S. Sethia, S. Skiena. **When Can You Fold a Map?** Comput. Geom. 29(1):23–46, 2004. *Defines simple foldability; the action space comes from here* |
| `akitaya-hard` | H. Akitaya, E. Demaine, J. Ku. **Simple Folding is Really Hard.** J. Information Processing 25:580–589, 2017 |
| `akitaya-infinite` | H. Akitaya et al. **Infinite All-Layers Simple Foldability.** Graphs and Combinatorics. arXiv:1901.08564. *The all-layers model, which corresponds to sheet-metal bending* |
| `akitaya-flatfolder` | H. Akitaya, E. Demaine, J. Ku. **Computing Flat-Folded States.** OSME 2024. *The Flat-Folder paper; deciding a global flat-folded state is NP hard* |
| `mixed-orthogonal` | **Complexity of Simple Folding of Mixed Orthogonal Crease Patterns.** arXiv:2306.00702 |
| `turing` | **Flat Origami is Turing Complete.** arXiv:2309.07932. ⚠️ Defensive citation only (§7) |
| `continuous` | E. Demaine, S. Devadoss, J. Mitchell, J. O'Rourke. **Continuous Foldability of Polygonal Paper.** CCCG 2004. *Folded state versus folding motion; reachability is free, so the hard question is the discrete step structure.* Predecessor: Demaine & Mitchell, *Reaching Folded States of a Rectangular Piece of Paper*, CCCG 2001 |
| `layer-algebra` | **An Algebraic Approach to Layer Ordering Constraints for Origami Flat-Foldability.** Origami8, 2026 |
| `flat-folding-graphs` | **Realization and Connectivity of the Graphs of Origami Flat Foldings.** arXiv:1808.06013 |

### 14.3 The CP→Seq problem itself

| Key | Work |
| --- | --- |
| `akitaya-cp2seq` | H. Akitaya, J. Mitani, Y. Kanamori, Y. Fukui. **Generating Folding Sequences from Crease Patterns of Flat-Foldable Origami.** ACM SRC / SIGGRAPH Posters 2013. *The problem was named here, by the group whose tools the field now uses. Reflection paths, graph rewriting, step graphs; a frog base explodes to 22,665 nodes and 30 minutes, and the authors' own future work asks for the priority heuristic this paper's models are being asked to supply* |
| `creasy` | **Creasy.** Open-source CP→Seq implementation of the above (Java, GPL-3.0, unmaintained since 2022). `github.com/xkevio/Creasy`. *Usable as a symbolic baseline* `[TO RUN if used]` |

### 14.4 Counting folded states

| Key | Work |
| --- | --- |
| `oeis-a000136` | OEIS **A000136**, foldings of a strip of stamps: 1, 2, 6, 16, 50, 144, 462, 1392, 4536, 14060, … *No closed form.* See also A001011, A001416 |
| `lucas` | É. Lucas (1891), attributing the problem to É. Lemoine; earlier literature traced by J. Touchard (1950) |
| `koehler` | J. Koehler. **Folding a Strip of Stamps.** J. Combinatorial Theory 5:135–152, 1968 |
| `lunnon` | W. F. Lunnon. Multi-dimensional map folding, 1971 |
| `meanders` | **Foldings and Meanders.** arXiv:1302.2025. *Meanders and stamp foldings are the same combinatorial object* |

### 14.5 Spatial reasoning context

| Key | Work |
| --- | --- |
| `spatial-survey` | **Spatial Reasoning in MLLMs: A Survey.** arXiv:2511.15722 |
| `vot` | **Mind's Eye of LLMs: Visualization-of-Thought Elicits Spatial Reasoning in Large Language Models.** NeurIPS 2024. arXiv:2404.03622. *Names the mental-imagery question this benchmark can turn into a measurement* |

### 14.6 Tools, formats and data

| Key | Work |
| --- | --- |
| `flatfolder` | **Flat-Folder.** `github.com/origamimagiro/flat-folder`, MIT. Decides and enumerates flat-folded states; source of the four constraint classes cited in §5.3 |
| `fold-format` | **The FOLD file format.** `github.com/edemaine/fold`. The de facto standard used by every artifact we ship |
| `oripa` | **ORIPA.** J. Mitani. Crease-pattern editor and folded-form estimation |
| `purelandfold` | **PurelandFold.** `huggingface.co/datasets/mayaweiz/PurelandFold`, CC-BY-4.0. 27 sequences, 337 frames. *Not used as training or evaluation data here; cited as the closest existing sequence-level corpus and as FoldingAgent's data* |

### 14.7 Statistical physics of random flat-foldability

Optional support for the claim that multiple valid states is the normal case rather than a
curiosity. Include only if §3.1 needs reinforcement.

- **A Spin Model for Global Flat-Foldability of Random Origami.** arXiv:2403.07306
- **On Random Locally Flat-Foldable Origami.** arXiv:2502.04279

### 14.8 Deliberately not cited

Thick folding (Ku & Demaine 2016), bar-and-hinge mechanics, MERLIN2, SWOMPS, Sim-FAST-PY, and the
creased-sheet mechanics literature all belong to the thickness and mechanics line of work. They
are a separate paper with a verifier several orders of magnitude more expensive, and citing them
here would invite a reviewer to ask why this paper does not do that one.

---

## 15. Editorial rules for this draft

Not part of the paper. Each of these has been drafted wrongly at least once in this project.

1. **Never claim legal moves are rare.** The enumeration refutes it (§3.3).
2. **Never claim the model performs 3D reconstruction.** Say spatial reasoning; pose "is a
   three-dimensional representation necessary or merely sufficient" as a research question. Avoid
   homotopy and isotopy language entirely.
3. **Turing completeness is defensive only** (§7).
4. **Cite OrigamiSpace as an arXiv preprint** unless a venue is confirmed; `papers.md` recorded a
   venue that its arXiv record does not carry.
5. **Every number carries a `fact:` tag** and `doccheck.mjs` must pass before submission.
6. **Sections 8 to 10 stay empty until the runs exist.** If they cannot be filled in time, the
   paper is submitted as a benchmark paper and the ablation sentence leaves the abstract.
7. **No citation enters this draft from memory.** Authors, venue, year and the specific claim
   attributed to a work are verified against the record before the sentence stays. A citation that
   cannot be verified is cut, not softened. The `⚠️` in §1 is live and blocks submission.
