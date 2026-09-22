# Origami as a Spatial and Geometric Reasoning Benchmark

## Abstract

Multimodal language models perform well on visual recognition and on tool use, but these abilities
do not transfer directly to spatial and geometric reasoning. Geometric structure does not reduce to
text or to a single image: exact angles and incidences, which surface lies in front of which, and
the order in which operations were applied are not recoverable from a semantic description of a
scene. We introduce **CP2Seq**, a benchmark for evaluating geometric reasoning and sequential
planning in multimodal language models through origami. The benchmark contains 600<!--fact:corpus.release.total--> procedurally
generated samples, each requiring a model to produce a valid sequence of folds from a crease pattern
and a target folded state. Samples are produced by a deterministic folding engine. Ground truth is
recorded as each fold happens rather than annotated afterwards. Every sample rebuilds
byte-identically from its seed, so the corpus is released as a generator and a manifest rather than
as a data archive. We release the generation and evaluation framework alongside it, so the corpus
can be regenerated, extended, or re-stratified at a different difficulty. During evaluation, the
engine executes proposed folds or rejects invalid actions with explicit feedback, while the model
remains responsible for selecting actions and searching for a solution. We evaluate frontier
multimodal language models under progressively greater tool assistance, and against a
deterministic breadth-first search over the same action set. Candidate sequences are assessed by
executing them and comparing the resulting folded state with the target, allowing for planar
translations, rotations, and reflections. Under the low reasoning effort setting, none of the
evaluated models solves a sample outside the easy subset. On that subset, the best model achieves a
success rate of 20.4%<!--fact:results.luna.toolEasyPct-->, compared with 54.7%<!--fact:results.bfs.easyPct--> for the search baseline. Its dominant failure mode is
not an exhausted query budget but the repeated proposal of states it has already visited, which
terminates 48%<!--fact:results.luna.cyclingPct--> of its attempts. These results identify a substantial gap between frontier
multimodal models and explicit search on this origami planning task.

---

## 1. Introduction

Multimodal language models have become genuinely good at visual work. They caption and answer
questions about natural images, read documents, charts and tables, transcribe text in photographs,
follow video, and drive graphical interfaces from screenshots alone. Over the last two years the
direction of progress on these tasks has been steeply upward, and on several of them the reported
numbers sit near careful human annotators. TODO: Rewrite this. 

It does not follow that these models reason about spatial reasong (TODO: Fisx this with geom reasoning etc. ). Most of the competence arrives through one
architecture: a vision encoder trained to align images with text, and an adapter that projects its
output into the language model's token stream. What that encoder is rewarded for preserving is
semantic. It answers *what is in this picture*, and it answers it well, because that is what the
training objective asks of it. Metric and relational structure is not rewarded and need not
survive the projection: exact angles, exact incidences, which of two nearly identical shapes lies
in front, how many times one line crosses another. Competence at recognising a scene and competence at reasoning about its geometry are different, and an adapter trained for the first
gives no guarantee of the second. When the task moves to geometric and spatial reasoning, the
ranking of models by their image-task scores need not survive. (fix the wordings). 

Why Origami for Spatial and Geometric reasoning

(DELETE AND WRITE AGAIN)
Origami is an unusually clean place to look for the missing capability. It is an art form whose
entire content is geometric: a folder works from lines, reflections and incidences on a single
uncut sheet, and every decision is constrained by every decision before it. (Mention about the spatial thing - using the fact about the layer ordering etc. -  ) It also demands
spatial reasoning of a specific kind, because the sheet stops being flat the moment folding
begins. The folder has to track where each piece of paper now sits, which pieces lie above which,
and which of them are still joined to each other through the original sheet. A crease pattern, the
flat record left behind when a finished model is unfolded, contains all of that history and none
of its order. Reading a sequence back out of it is the skill that separates a practitioner from
someone who can recognise a crane.

We use origami as an instrument. **The model is given two things: the crease pattern, and the final
folded state. It is asked for the sequence of folds that turns the flat sheet into that state.**
Both endpoints are supplied and the path between them is not, which is the whole of the task. The
pattern says which lines were creased at some point during the folding but says nothing about the
order they were creased in, and the final state says where the paper ended up but not how it got
there.

 -  need a graph here to illustrate

This is trivial to generate and hard to solve, which is what makes it usable for evaluation.
Folding forward is a single pass of an engine that records what it did. Deciding whether a crease
pattern is reachable by simple folds at all is NP hard [Arkin et al. 2004; Akitaya, Demaine & Ku
2017], so recovering the sequence that produced one is at least as hard. The same engine that
generates a sample therefore rules on any proposed step of a solution exactly, using an operation
it already implements, with no learned component in the loop, no tolerance to tune and no oracle to
trust.

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

The distinction matters because the search is where the difficulty lives. Determining the layer
ordering of a flat folding is NP hard on its own, even when a valid mountain-valley assignment is
supplied [Bern & Hayes 1996]. - 这句话看不懂 No amount of pattern recognition substitutes for search on a problem
of that shape, and a benchmark that never executes a proposed step cannot tell a model that
searched from a model that recognised, nor report how much search either one needed. - 这句话看不懂

This is also why the benchmark reports a deterministic search baseline alongside the models rather
than only against them. The stack deepens with every fold, the enumerated action set grows with it,
and the depth at which exhaustive search stops being affordable is a property of the corpus that
can be measured rather than asserted. `[the deterministic breadth-first baseline of §8,
reported per stratum, giving the depth at which it stops solving and the states it expands. Until
that number exists, no claim is made here about where blind search fails.]` What the benchmark is
designed to reward is the use of geometry: looking at the crease pattern and the final state and
inferring which fold could plausibly have been last, then working backwards. **Geometry is supplied
to the model as input and is not the thing being scored. Being able to act on it is.** A model that
cannot read a reflection off a pattern has no way to choose a direction other than enumeration, and
the baseline is what says how far enumeration alone gets.

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
   declared levels of equality -- （edited distance and CP） - -, because one crease pattern admits many valid folded states and the
   recorded sequence is not guaranteed to be the shortest.

3. **An evaluation of frontier multimodal models** against this dataset through this framework,
   run across the progressive tiers of tool assistance and with a memorization control on
   anonymized geometry. `[TO RUN]`

4. **A measured scope boundary.** 89.3%<!--fact:probeC.provenNotPct--> of the 366<!--fact:corpus.instagram.total--> real crease patterns in
   Flat-Folder's `examples/instagram/` corpus provably lie outside all-layers simple folding. The benchmark's action space is bounded by evidence rather than by
   assertion, and the boundary is reported rather than buried.

We find that the task is beyond current models at the setting we could afford to run. ((No model
solved a single sample past the easy stratum  - ---are you sure, then we should give a graph, shows what's newest model performance))), and on the easy stratum a deterministic breadth-first
search over exactly the action set the models are given solves 54.7%<!--fact:results.bfs.easyPct--> against
20.4%<!--fact:results.luna.toolEasyPct--> for the best-covered model. Blind search beats every model tested, on the only
stratum where anything succeeds at all. The dominant failure is not exhausting the search budget but
revisiting states already seen: 48%<!--fact:results.luna.cyclingPct--> of that model's attempts terminate in detected state
cycling. 

⚠️ Every model attempt ran at low reasoning effort, so the supported claim is about models
at that setting rather than about the frontier in general; §10.6 states this and §11 carries it as a
limitation.- -----put in appendix

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
mistakes invisible. Ours is exact, because it is the generator run forwards.
Their scoring is step-level precision, recall and F1 against an expert sequence, together with
edge-level IoU; §6.1 shows why that family of measures is unsafe in this task, since a model that
finds a *shorter* correct sequence is marked wrong by it. That is a finding about scoring in this
setting rather than a criticism of their results.

The general precedent for a (((((proposer paired with a verifier))))))) - ----what's this??? what's pur proposer
is older than any of this work: a
network that proposes and a search that checks is the structure behind AlphaGo [Silver et al.
2016], and the reason the
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
this problem supplies an exact verifier and can therefore serve as an evaluation substrate for
models that reason with tools.

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
origami supplies one.

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


------this 3 paragraphs are over emphasizing on whether all layers fold or some layer'fold  it gonna tear or not. is that the only point in this part????

### 3.3 The task

Given a crease pattern, produce a sequence of simple folds that reproduces it. Generating an
instance costs one forward pass of the engine; solving it is NP hard. That asymmetry is the
paper's foundation.

---------

It is tempting to say that
legal moves are rare and that this is what makes the task hard. Enumeration refutes it: legal
partial folds *grow* with depth, from 22 at two layers to 332 at thirty-eight, six times the 56
all-layers folds available at the same state. What falls is the hit rate of uniform random
proposal, from 11.9% to 3.8% by seventeen layers, because the space being sampled grows faster
than the legal set inside it. That is a fact about a sampler, not about origami, and conflating
the two would put a false statement about branching factor into the paper.


---------this paragraph should be listed properly and give a proper graph to illustrate it!!!!!!!!

---

## 4. CP2Seq: the dataset

### 4.1 Why the corpus is synthesised

Every sample is built rather than collected, and the reason is that the construction supplies the
label. A folding sequence is not something that can be read off a finished crease pattern by
inspection, which is the whole premise of the task; so a corpus of annotated patterns would require
either a solver, which is the thing being benchmarked, or a human expert, which does not scale and
introduces an error rate nobody can measure. Folding forward and recording avoids both. The
sequence is not inferred after the fact, it is what happened, and the pattern is what the folding
left behind.

This also means difficulty is a dial rather than an observation. A collected corpus has whatever
distribution of depth and entanglement its source happened to have. A generated one is stratified
on purpose, and the empty regions of that stratification are visible rather than hidden (§4.5).

### 4.2 Generation, step by step

The generator starts from a unit square and applies randomly chosen legal simple folds, recording
each one, until it reaches a target depth. It then unfolds and reads off the crease pattern.

```
GENERATE(seed, depth_target, tier):
    rng   <- seeded RNG from `seed`                 # byte-identical replay depends only on this
    state <- unit square, one layer
    seq   <- []

    while len(seq) < depth_target:
        cands <- ENUMERATE_LEGAL_FOLDS(state, tier)   # every fold the engine would accept
        if cands is empty:
            return FAILED                             # dead end: discard, do not repair
        fold  <- rng.choice(cands)
        state <- APPLY(state, fold)                   # the same APPLY the verifier uses
        seq.append(fold with its line, direction, selected layers, creases made, coupling)

    cp     <- UNFOLD(state)                           # creases accumulated over the whole sequence
    cp     <- PLANARISE(cp)                           # split edges at crossings; canonical form
    frames <- [state after each step]                 # retained as the multi-frame steps.fold

    assert REPLAY(cp, seq) == state                   # sample is rejected if this fails
    return Sample(cp, seq, frames, metrics(cp, seq))
```

Four properties of this procedure matter for the benchmark and each is a deliberate choice.

**The generator never searches.** It picks uniformly among legal folds and never backtracks. A dead
end discards the sample rather than repairing it. This keeps generation one forward pass, and it is
also why the recorded sequence carries no claim to being minimal (§6.1).

**`ENUMERATE_LEGAL_FOLDS` and `APPLY` are the same functions the environment exposes to the model.**
The generator is not a privileged path through a different code path; it is the environment driven
by a random policy. A sample is therefore reachable by definition, using exactly the action space
the model is given.

**Planarisation is canonical.** A crease pattern is stored with every edge split at every crossing,
so two patterns that describe the same geometry have the same edge set and can be compared as
multisets without a tolerance.

**Every sample is replayed before it is kept.** The assertion is not a test that runs sometimes; a
sample that does not reproduce its own state is discarded at generation time.

### 4.3 Reproducibility as a shipping format

Given its seed and the generator version, a sample regenerates byte-identically. The corpus is
therefore distributed as a generator plus a manifest, not as a data archive: the manifest lists each
sample's seed, tier, target depth and a hash of the resulting crease pattern, and rebuilding is
verification. A reader who wants ten thousand samples instead of six hundred, or a stratification we
did not choose, runs the generator rather than asking us for a larger download.

### 4.4 Difficulty, stratified rather than sampled

Difficulty is set along two axes rather than measured after the fact.

**Fold depth** is the primary axis: the number of folds in the recorded sequence. It is the axis the
task's hardness is defined on, because step *k* is constrained by steps 1 through *k−1*.

**Coupling** is the second: the number of creases a single fold creates, which is to say how many
layers the fold line cuts. It is free to compute at generation time, since one fold cuts every layer
it crosses and each cut becomes one crease in the unfolded square. Coupling is the measurable proxy
for non-local dependency: a high-coupling fold writes creases into many layers at once, so a later
fold cannot be reasoned about locally.

The two are not independent, and the dependence is itself a finding (§4.5).

### 4.5 What the corpus contains - This part only need to let readers know that , all layers fold(easy, medium, hard levels) + some layers fold

other things like generated or verified, we don't need to mention, we only need to put it in hugging face or appendix



### 4.6 What a sample carries

| File | Contents |
| --- | --- |
| `cp.fold` | The crease pattern, planarised. **The input** |
| `steps.fold` | The pattern plus the folded state after each step, as one multi-frame file. The final frame is **the other input**; the intermediate frames are held back |
| `seq.json` | Every fold: line, direction, selected layers, creases made, coupling. **The ground truth**, never shown to the model |
| `meta.json` | Difficulty metrics, degeneracy flags, seed and generator version |

> **FIGURE 2: one dataset sample, end to end.** `[DRAFT IMAGE: placeholder, will be replaced
> with a human-authored figure. Drafts generated with OpenAI gpt-image-2.]` 

A single easy sample laid out as the
> model sees it and as the ground truth records it. Left: `cp.fold` rendered as a crease pattern,
> mountain and valley distinguished. Centre: the final folded state from `steps.fold`, as the
> top-down X-ray plus the exploded layer view, which is exactly what the model receives. Right: the
> recorded `seq.json` as a strip of small diagrams, one per fold, each showing the fold line and
> the layers it moved, with the coupling of that fold printed beneath. The caption should say
> plainly that the left and centre panels are the input and the right panel is withheld. This is
> the figure that makes the task legible in one glance, and it should come early.

### 4.7 Two limits that belong in the paper rather than an appendix. --------MISSING

⚠️ The first is an empty cell. Long sequences at low coupling are almost unreachable, yielding
2<!--fact:corpus.synth.lLocalHits--> hits in 16,000 attempts, because every all-layers fold thickens the stack, so a long
sequence cannot keep cutting few layers. Real folders reach that corner by **pre-creasing**, an
operation this action space excludes. The longer a real model runs, the more of it sits outside what
the benchmark can express.

⚠️ The second is depth. The some-layers tier stops at six folds in this release, and the difficulty
the benchmark is about lives past the depth a search can reach. Restoring the deeper tier is a
matter of generator configuration and wall-clock, not redesign.

> **FIGURE 3: the difficulty grid.** `[DRAFT IMAGE: placeholder, will be replaced with a
> human-authored figure plotted from real data.]` Depth on one axis, coupling on the other, one
> cell per stratum, shaded by how many samples landed there. The long-sequence low-coupling corner
> should be visibly empty, and the caption should name pre-creasing as the reason.

### 4.8 Verifying the corpus itself

Two checks run over every sample. Both replay the recorded sequence and compare the creases it
makes against the pattern stored beside it; what they do not share is the comparison. The first
groups edges into lines, merges collinear pieces and matches them within a tolerance. The second
was written after five false failures had come out of exactly that machinery, each one a defect
in the comparison rather than in the corpus, and reuses none of it. It merges each line's pieces
into maximal creased intervals, the quantity subdivision cannot change, and matches those one to
one. Comparing subdivided segments instead does not work: of 457 failures under that earlier
design, 364 were two sides carrying a different *number* of segments, which is not a distance and
no tolerance can reach. The verdict is an absolute test at the radius at which the generator's own
planarizer identifies two points as one vertex, 1e-9, the floor of what the corpus records rather
than a constant tuned until the run passed. A depth-scaled ULP distance is reported alongside as a
diagnostic on how much of that margin is used; on a sampled subset the median match needed 16 ULP,
four orders inside the floor. Both checks pass on all 600<!--fact:corpus.release.total--> samples of
the release corpus.

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

### 5.3 Refusals are named， isn't that you shoulr mention a check, each step check and final step check, final step check now is missing , should mention here--------

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

FInal step check. - The four constraint classes that Flat-Folder
checks (taco-taco, taco-tortilla, tortilla-tortilla, transitivity) remain the right vocabulary for
global terminal states; they are not what a single legal step needs checking against here.

### 5.4 What the model observes - you should add a screen shot of simulator software !!!!!!!!

On success the environment returns the new state together with two views: a top-down X-ray of the
stack, and an exploded view of the layers. Every intermediate state in this tier is flat, so a
second camera angle would show the same silhouette rotated and would carry no new information;
what carries information is layer structure, which is why the second view is an explosion rather
than a rotation. Positions are reported as coordinates on the original sheet together with an
integer layer index. There is no continuous vertical coordinate at this tier, and a rendering that
looks three-dimensional is not evidence of one; thickness belongs to a different problem.


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
than overlapping, with no tolerance in the verdict. This level is genuinely tolerance-free: edges
are clustered into lines first, so subdivision differences cannot register as disagreements, and
what remains is a combinatorial comparison.

**Level 2, folded states up to a declared group of transforms.** Because one crease pattern admits
many valid terminal states, exact equality against the one stored state would mark correct answers
wrong. The answer is an equivalence: declare in advance which differences do not count, then demand
equality inside that.

**The transforms are quotiented out of every result reported in this paper.** The declared group is
the full plane isometry group: **arbitrary translation, arbitrary rotation, and reflection**. One
single isometry must carry every layer of the candidate onto its reference counterpart; a match is
not accepted by transforming each layer independently.

Each transform is in the group for a concrete reason rather than for generality.

- **Translation.** A fold can carry paper off the original square, and which half of the sheet
  travels decides where the stack lands. A folded model is the same model wherever it sits on the
  table, so its position in the plane is an accident of the sequence.
- **Rotation.** The same object produced by a sequence that worked around the square in a different
  order arrives rotated. Rotations preserve both stack order and face parity, so they need no
  further correction.
- **Reflection, with two corrections.** A reflection represents turning the model over, and turning a
  model over does three things at once: it mirrors the coordinates, **reverses the stack**, and
  **flips every face's parity**. All three are applied together. Applying a reflection to coordinates
  alone would compare a model against its mirror image and silently accept wrong answers, which is
  the most dangerous failure a comparator of this kind can have.

**Floating point is unavoidable once transforms are admitted, and the paper states its tolerance
rather than claiming not to have one.** A rotation by an angle that is not a multiple of a right
angle produces irrational coordinates, so candidate and reference vertices agree only to within
floating-point representation, and comparing them for bitwise equality would reject correct answers.
The comparator therefore matches polygons under a tolerance of **2×10⁻⁶** in the plane, with
degenerate-vertex cleanup at 10⁻⁷ and a collinearity threshold of 10⁻⁹. These are the values in
`terminal_match.mjs` and they are reported in every result record, so a reader can see what was
used rather than infer it.

⚠️ **This qualifies a claim made elsewhere in the paper and the qualification belongs here.** Level 1
crease-set comparison is genuinely tolerance-free: it compares maximal creased intervals as
multisets after clustering edges into lines, and the verdict involves no floating-point threshold.
Level 2 is not tolerance-free and cannot be, because it admits rotations. The honest formulation is
that the *verifier* is exact, since legality is decided combinatorially by the engine, while
*terminal-state equality under transforms* carries a stated numerical tolerance. Any sentence in
this draft that calls the whole pipeline tolerance-free is wrong and must be narrowed to Level 1.

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


## 8. Experimental setup

### 8.1 The pipeline -----should have a hand drawn graph 

One episode is one sample attempted by one model under one tier of assistance. The loop is the same
for every arm and every model, and the only thing that varies between arms is what the model is
allowed to see and call.

```
EPISODE(sample, model, tier, budget):
    cp, final <- LOAD(sample)          # cp.fold and the LAST frame of steps.fold
                                       # intermediate frames are never exposed
    state     <- unit square, one layer
    seq       <- []
    while len(seq) < budget:
        obs      <- RENDER(state, tier)        # views withheld at the no-vision tier
        action   <- model(cp, final, obs, history, tier)
        if action is SUBMIT:  break
        verdict  <- ENVIRONMENT.step(state, action)   # the verifier IS this call
        if verdict is REFUSAL:
            history.append(refusal with its named reason)   # state unchanged
        else:
            state <- verdict.state
            seq.append(action)
            history.append(obs)
    return SCORE(replay(cp, seq), replay(cp, reference_seq))
```

Three things about this loop decide what the benchmark measures.

**The environment is the only thing that changes state.** A model cannot assert that a fold
happened. It proposes, and the environment either performs the fold or refuses it, so the state the
model reasons about is always a state paper could be in.

**A refusal costs a query and does not advance the episode.** This is what makes queries-to-solution
meaningful: a model that proposes carelessly pays for it in budget, and a model that reasons before
proposing is rewarded in the secondary metric even when both eventually solve the sample.

**The reference sequence is never read during the episode.** It enters only at scoring time, and
then only as something to replay, never as something to compare against step by step (§6.1).

> **FIGURE 4: the evaluation pipeline.** `[DRAFT IMAGE: placeholder, will be replaced with a
> human-authored figure. Drafts generated with OpenAI gpt-image-2.]` A left-to-right diagram of one episode. On
> the left, the two inputs: the crease pattern and the final folded state. In the centre, the loop
> as a cycle: model proposes a fold, environment either returns a new state with its two rendered
> views or returns a named refusal, history accumulates. On the right, termination and scoring:
> replay of the model's sequence and replay of the reference, compared at Level 1 and Level 2. The
> figure should make three things visually obvious: that the environment and the verifier are one
> box and not two; that refusals loop back without advancing; and that `seq.json` sits outside the
> loop entirely, entering only at the scoring step. A dashed boundary around the withheld items
> (intermediate frames, reference sequence) would carry that last point without a sentence.

### 8.2 The tools the model is given

The tool belt is the experimental variable. Every tool is a read or a step against the same engine;
none of them searches, and none of them ranks candidates.

| Tool | What it returns | Why it exists |
| --- | --- | --- |
| `apply_fold` | The new state, or a named refusal | The action. This call **is** the verification |
| `get_views` | Top-down X-ray of the stack, exploded layer view | The visual channel; withheld at the no-vision tier |
| `get_state` | Face positions in original-sheet coordinates plus integer layer index | The symbolic channel, so a model is never forced to read geometry off a raster |
| `list_legal_folds` | Every fold the engine would currently accept | The filtering tier. It prunes; it does not choose |
| `undo` | The previous state | Backtracking without spending the episode |

`list_legal_folds` is the tool that needs justifying, because it is doing the most work. It
enumerates candidate actions and returns those that are legal, which is a large prune performed by
the simulator rather than by the model. That is precisely why the tier structure exists and why the
deterministic baseline of §8.4 is reported: if exhaustive search over the enumerated set solves the
corpus outright, then the filtered arm is not measuring origami reasoning, and the benchmark has to
say so rather than let a headline number imply otherwise.

> **FIGURE 5: a refusal as the model receives it.** `[DRAFT IMAGE: placeholder, will be
> replaced with a human-authored figure built from real renders.]` One concrete rejected fold,
> rendered exactly as the harness returns it. The proposed fold line drawn over the current state;
> the named reason (`would-tear`); and the specific evidence, which for a tear is the crease segment
> joining a moving face to a stationary one, highlighted, away from the fold line. Beside it, the
> same state with a legal fold line for contrast, since the tearing pair of §3.2 is the clearest
> illustration in the paper and currently exists only as prose. The caption should state that the
> reason is a name rather than a boolean, and that this is why error analysis is a taxonomy that
> exists before the experiment rather than a clustering done afterwards.

### 8.3 Tiers, models and protocol

**Tiers.** Four levels of assistance, from a full tool belt down to none; the table is in §9. The
same model, the same samples and the same query budget across tiers, so that the only difference
between two tiers is what was withheld.

**Models.** `[TO FILL from the aggregation: the models actually run, their versions, and the
reasoning-effort and image-history settings used. Held fixed across tiers, because comparing across
models and across tiers at once would confound the two.]`

**Protocol.** Query budget, number of repeats and seeds are fixed before the first run and reported
with the results. Median and spread across repeats are reported, never a single run, because
sampling is not deterministic and one run is not a measurement.

**Transforms are applied in every reported result.** Every solve rate in §10 is computed after
quotienting out the plane isometry group of §6.2: translation, rotation and reflection, with
reflections reversing the stack and flipping face parity. A candidate is counted correct if one
single isometry carries every layer onto its reference counterpart. This is not an optional
post-hoc leniency applied to borderline cases; it is part of the definition of a correct answer,
and it is applied identically to every arm, every model and every baseline. Turning it off would
mark correct answers wrong, because where a folded model lands on the table is an accident of which
half of the sheet travelled.

**Matching under transforms requires a floating-point tolerance, and it is stated.** Admitting
arbitrary rotation means candidate and reference coordinates agree only to within floating-point
representation, so the comparator matches polygons within **2×10⁻⁶**, cleans degenerate vertices at
10⁻⁷ and treats vertices as collinear below 10⁻⁹. Every result record carries the tolerance it was
scored under, so the value is visible in the released runs rather than buried in a constant. The
engine's legality decisions are combinatorial and involve no tolerance; the numerical threshold
applies only to terminal-state equality under transforms.

**Error verbosity is itself a variable.** The richer a refusal, the more of the reasoning the
environment performs rather than the model; at the limit a message that names the fix has solved the
step. Verbosity is fixed before the first run and reported, otherwise the comparison between tiers
measures message design rather than reasoning.

### 8.4 Baselines

Three, none of them a language model, so the models are ranked against something rather than only
against each other.

| Baseline | What it establishes |
| --- | --- |
| Uniform random over enumerated legal actions | The floor. What the tool alone achieves with no reasoning at all |
| Deterministic breadth-first over the same action set (`workspace/search_baseline.mjs`) | How much of the task the enumerator already solves, and the depth at which exhaustive search stops being affordable |
| Symbolic CP→Seq solver (Creasy) | The closest thing to prior art on the task itself |

The breadth-first baseline is the one that answers the "the simulator did all the work" objection of
§7 numerically rather than structurally, which is the stronger form of that answer.

---

## 9. Progressive tiers of tool assistance `[TO RUN]`

The model is run at four levels of assistance, each removing one kind of help from the level above.
These are reported as tiers rather than as ablations, for the reason given in §16: a full ablation
study was planned and has not been run, and calling a partial sweep an ablation would overclaim.

| Tier | Tools available | What it isolates |
| --- | --- | --- |
| Full tool belt | Environment, rendered views, any auxiliary tools | Upper bound |
| No vision | Same, rendered views withheld | The contribution of visual feedback |
| Verifier only | Pass/fail, no filtering | The contribution of filtering on top of raw verification |
| No tools | None, anonymized geometry | Memorization control |

Same model, same patterns, same query budget across tiers. If the no-vision or no-tools tier
performs nearly as well as the full tier, **that is a finding rather than a failed experiment**: it
means the gain is not where it was assumed to be. `[TO RUN]`

---

## 10. Results

All numbers below come from `workspace/RESULTS/results.md`, produced by
`python3 workspace/aggregate_results.py` over every saved run. 1,211<!--fact:results.attempts--> attempts across
47 runs and 256 distinct samples. Every attempt is counted once, and an attempt with no recorded
`solved` field is counted as unsolved.

### 10.1 Headline

**No language model solved a single sample beyond the easy stratum.** Across every model arm,
mid is 0 of 70<!--fact:results.lm.midN--> and hard is 0 of 27<!--fact:results.lm.hardN-->. On the easy stratum a deterministic
breadth-first search over exactly the action set the models are given solves
54.7%<!--fact:results.bfs.easyPct-->, against 20.4%<!--fact:results.luna.toolEasyPct--> for the best-covered model at the same tier.

**Blind search beats every model tested, by a factor of about 2.7 on the only stratum where
anything succeeds at all.**

| Arm | Tier | easy | mid | hard | overall | med. tool calls |
| --- | --- | --- | --- | --- | --- | ---: |
| `deterministic-bfs` | legal-folds | **366/669 (54.7%)** | 1/40 (2.5%) | 0/16 | 367/725 (50.6%) | 5 |
| `gpt-5.6-luna` | legal-folds | 59/289 (20.4%) | 0/66 | 0/25 | 59/380 (15.5%) | 23.5 |
| `gpt-5.6-luna` | no tools | 4/65 (6.2%) | 0/1 | 0/1 | 4/67 (6.0%) | 29 |
| `claude-sonnet-5` | legal-folds | 0/5 | — | — | 0/5 | 10 |
| `gpt-5.6-sol` | no tools | 0/7 | — | — | 0/7 | 20 |
| `gpt-5.6-terra` | no tools | 0/1 | — | — | 0/1 | 35 |
| `gpt-6-astra` | no tools | 1/1 | — | — | 1/1 | 5 |
| `codex-cli-chatgpt` | none | 0/1 | — | — | 0/1 | 2 |
| *errored, model unrecorded* | — | 0/20 | 0/3 | 0/1 | 0/24 | — |

⚠️ **Read the denominators before the percentages.** Only `gpt-5.6-luna` and the baseline have
coverage worth a rate. `gpt-6-astra` shows 1/1; **that is one attempt and must not be reported as
100%.** `claude-sonnet-5`, `gpt-5.6-sol`, `gpt-5.6-terra` and `codex-cli-chatgpt` have between one
and seven attempts each. These rows are present because omitting them would be selective reporting,
not because they support a comparison. Any main table in the submitted paper prints $n$ in every
cell or drops the row.

### 10.2 The baseline reading

`deterministic-bfs` solves 367 of 725 attempts overall. Per stratum: 366/669 easy, 1/40 mid, 0/16
hard. Median states expanded is 65 on easy, 1051.5 on mid, 532 on hard. 358<!--fact:results.bfs.timeouts--> of its 725
attempts ended in timeout rather than exhaustion, so **50.6% is a lower bound under the baseline's
time budget, not the ceiling of exhaustive search.**

This is the outcome §16.7 anticipated and the one `workspace/search_baseline.mjs` was written to
detect. Its header records that `list_legal_folds` evaluates roughly 2,010 candidate actions per
state and returns a mean of 3.51 that are legal and stay inside the target crease pattern, over
73,750 enumerations. A branching factor near 3.5 makes an easy sample of five folds a tree of a few
hundred states, and the median of 65 states expanded on easy confirms it. **The easy stratum is
therefore not measuring origami reasoning.** It is measuring whether a model can avoid losing to
breadth-first search on a tree its own tool has already pruned by roughly 570-fold, and every model
tested loses.

The paper says this plainly rather than reporting the models' easy-tier rate as an achievement. It
is also the answer to the "the simulator does all the work" objection of §7, and the answer is
uncomfortable: **on the easy stratum the simulator does do most of the work.** The benchmark's value
here is that it can measure that rather than hide it. On mid and hard the objection dissolves,
because search solves 1 of 56 and the models solve 0 of 97.

### 10.3 What the tools contribute

The one within-model tier comparison the data supports is `gpt-5.6-luna` on easy:

| Tier | easy |
| --- | --- |
| `legal-folds` (filtering) | 59/289 (20.4%) |
| no tools | 4/65 (6.2%) |

Filtering is worth roughly 3.3x on the easy stratum. It is worth nothing on mid or hard, where both
tiers are zero. ⚠️ The no-vision and verifier-only tiers of §9 were not run, so the four-tier ladder
this paper describes is not yet instantiated; only the two endpoints exist.

### 10.4 Failure taxonomy

Termination reasons for `gpt-5.6-luna`, its 447 attempts:

| Termination | n | Share |
| --- | ---: | ---: |
| `state_cycling` | 215<!--fact:results.luna.cycling--> | 48.1% |
| `finished` | 167<!--fact:results.luna.finished--> | 37.4% |
| `turn_budget` | 47<!--fact:results.luna.turnBudget--> | 10.5% |
| `repetition_detected` | 18<!--fact:results.luna.repetition--> | 4.0% |

**This is the most informative result in the section and it is not a solve rate.** A majority of
attempts, 233 of 447 counting cycling and repetition together, end with the model revisiting a state
it has already produced rather than exhausting its budget. The model is not running out of room to
search; it is failing to notice that it has been somewhere before. That is a specific, diagnosable
deficit in maintaining state across a multi-step spatial task, and it is exactly the kind of finding
a benchmark with an executing verifier can produce and a multiple-choice benchmark cannot.

By contrast the baseline never cycles, because breadth-first search over a visited set cannot; it
times out instead, 358 times.

### 10.5 Where difficulty lives

Depth separates the arms completely. Easy is the only stratum where anything succeeds; mid yields a
single solve, by the baseline, at a median of 1051.5 states expanded against 65 on easy; hard yields
none from any arm. `[TO RUN: solve rate against coupling, to test whether the second stratification
axis of §4.4 predicts difficulty as intended. Only depth is evidenced so far.]`

### 10.6 Threats to these results

⚠️ **Every model attempt ran at `reasoning_effort: low`.** All 461 language-model attempts with a
recorded effort setting used the low setting; 25 have none recorded. **This is the single largest
caveat on every claim in this section.** "Frontier models fail this task" is not supported by these
runs. What is supported is "frontier models at low reasoning effort fail this task, and lose to
breadth-first search where search works." Re-running the best-covered arm at high effort is the most
valuable remaining experiment in the project, and until it exists the headline must carry the
qualifier.

⚠️ **Coverage is severely imbalanced.** 725 baseline attempts and 447 for `gpt-5.6-luna`, against
between one and seven for every other model. No cross-model claim is made.

⚠️ **24<!--fact:results.errorAttempts--> attempts terminated in `error` with no model recorded** and are counted as unsolved.
They are reported as their own row rather than dropped, because dropping failed attempts inflates
every rate above them.

⚠️ **Repeats are not yet reported as median and spread.** §8.3 promises this and the aggregation
counts attempts rather than grouping repeats per sample. The protocol requires it before submission.

> **FIGURE 6: main result per stratum.** `[DRAFT IMAGE: placeholder, will be replaced with a
> human-authored figure plotted from the aggregation output.]` The baseline line crosses above every
> model line on the easy stratum. Per `paper/figures/figure6.md`, that crossing must be plainly
> visible rather than smoothed away; it is the most informative feature of the chart.

---

## 11. Limitations

**Every model attempt ran at low reasoning effort.** All 461 language-model attempts with a
recorded setting used `reasoning_effort: low`. The results therefore support a claim about models at
that setting, not about frontier models in general, and the headline is worded accordingly. Raising
the effort on the best-covered arm is the most valuable remaining experiment.

**The easy stratum does not measure what the benchmark is for.** Deterministic breadth-first search
solves 54.7% of it at a median of 65 states expanded, beating every model. The stratum measures
whether a model can beat trivial search on a tree its own tool has pruned roughly 570-fold. Claims
about reasoning should be read off mid and hard, where every arm including search is at or near
zero, and where the benchmark currently discriminates nothing either. **The band in which this
benchmark separates models may be narrow or, at this depth range, empty.**

**Model coverage is severely imbalanced.** 447 attempts for one model and between one and seven for
four others. No cross-model comparison is supported.

**No training.** Every arm is an off-the-shelf model driven by prompting and tool calling; no
model is trained or fine-tuned. The contribution is the harness, not a model. This is stated in
the introduction as well as here, because a limitation the authors declare is context and one a
reviewer discovers is an objection.

**Scope of the action space.** 89.3%<!--fact:probeC.provenNotPct--> of the 366<!--fact:corpus.instagram.total--> real crease
patterns in Flat-Folder's `examples/instagram/` corpus lie outside all-layers simple folding, and pre-creasing, the operation real folders use to reach long sequences at low
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

## 13a. Licence and availability

The corpus generator, the environment and verifier, both corpus checks, the state comparator and the
evaluation harness are released under the **BSD 3-Clause** licence.

Code and data are released on publication; links are omitted here.

The artifacts carry no personal data, no human-subject data and no scraped content. Every sample is
synthesised from a seed by folding a square, so no licensing question attaches to the geometry and
no attribution is owed to any origami designer. Flat-Folder's `examples/instagram/` set, the one
external corpus this paper measures against, is not redistributed; the scope measurement of §11 was
computed against it in place and is reported as a number.

---

## 13b. Use of large language models

ICLR 2026 requires that **any** use of a large language model be disclosed, on the Code of Ethics
principle that all contributions to the research must be acknowledged, and holds the authors
responsible for everything in the paper regardless of what assisted in producing it. The policy does
not treat a model used as a research instrument differently from one used for writing: both must be
disclosed. Disclosure is required **in the paper's text and in the submission form**, so filling in
this section is not sufficient on its own.

⚠️ Remember the submission form. It is a separate field and is easy to miss.

**Large language models are part of the object of study.** This is a benchmark for evaluating
language models, so models appear in the work by construction. Every number in §10 is the output of
a frontier multimodal model driven through the harness of §8. The models, versions and settings are
listed there. No model was trained or fine-tuned for this paper.

**Code.** The benchmark's implementation was written with AI assistance, principally Claude Code,
used as a coding assistant throughout. Every design decision, every experiment and the direction of
the work were determined by the human authors, and all generated code was reviewed before use. The
authors are responsible for the correctness of the released artifacts. Two habits in this project
exist because of that reliance and are worth naming: the corpus carries two independently written
checks over every sample (§4.8), and the state comparator ships with a negative control that must
reject a deliberately corrupted state (§6.4). The second caught a real defect, in which 23 of 600
corrupted states were initially accepted.

**Literature search.** Related work was assembled primarily by hand, using Google Scholar and
alphaXiv. AI assistance was used partially, to locate candidate papers and recover bibliographic
details. Every citation was verified against the arXiv or publisher record by a human author;
citations that could not be verified were removed rather than softened.

**Writing.** AI assistance was used in drafting and editing. The argument, claims, experimental
design and conclusions are the authors'. No text was included that an author had not read and
agreed with, and no result, citation or number was produced by a language model without being
checked against the artifact it describes.

**Figures.** Any figure marked **DRAFT IMAGE** is a placeholder generated with OpenAI
`gpt-image-2` and used only as a compositional reference to be redrawn by hand. Generated images
never depict data or geometry: crease patterns, folded states and result charts are rendered from
the corpus and the run outputs. Draft figures will not appear in a submitted version.

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
   paper is submitted as a benchmark paper and the tier-sweep sentence leaves the abstract.
7. **No citation enters this draft from memory.** Authors, venue, year and the specific claim
   attributed to a work are verified against the record before the sentence stays. A citation that
   cannot be verified is cut, not softened. The `⚠️` in §1 is live and blocks submission.

---

## 16. Changes

Decisions taken about the paper's framing, recorded here so they are not relitigated and so a
co-author can see what was deliberate. Not part of the paper.

### 16.1 The free-verification framing is removed

**Decision.** The phrase *free exact verification*, and the framing built on it, is out. It is gone
from the title, from the abstract, and from the body. Where the property still matters it is stated
as what it is: the judge executes the model's proposal, and the engine that generates a sample is
the engine that rules on a step.

**Why.** Free verification is not a distinguishing property. It is the ordinary condition of the
benchmarks this paper sits beside: code benchmarks run tests, maths benchmarks run a proof
assistant, and nobody advertises that as a contribution because it is assumed. Leading with it
invites two bad readings at once. A reviewer who works on code or maths benchmarks reads it as a
claim to something everyone already has, which reads as naivety. A reviewer who does not reads it
as the paper's main idea, which displaces the actual contribution. Either way the reader's
attention goes to the verifier rather than to the dataset, the task and the tiers, which is where
the work is.

**What replaces it.** The contribution is stated as a dataset and an evaluation framework for
spatial and geometric reasoning. Exact verification stays in the paper as a property of the
environment (§5) and as the reason the scoring protocol can be trusted (§6.4), which is the right
altitude for it: a mechanism the paper relies on, not the thing it is selling.

### 16.2 The task definition is fixed and is now stated once, precisely

**Decision.** The model is given **both** the crease pattern **and** the final folded state, and is
asked for the sequence of folds that turns the flat sheet into that state. Both endpoints are
supplied; the path between them is not.

**Why.** The abstract previously said the task was recovering the sequence "that produced a crease
pattern," which omits the final state and describes a harder and different task. §1 and the
abstract now agree and use the same wording. Any future edit that changes what the model is given
has to change both.

### 16.3 Geometry versus search is not a contradiction, and the resolution is now written down

**Decision.** The paper keeps saying that what it scores is search, and also keeps positioning
itself as a benchmark for spatial and geometric reasoning. Both are true and the bridge between
them is now stated in §1 and the abstract rather than left implicit.

**Why.** The two only look like they collide. Geometry is supplied to the model as input, so the
paper is not scoring whether a model can compute a reflection. What it scores is whether a model
can *act* on the geometry it was given in order to choose a direction. That distinction is
load-bearing, because blind search does not survive this task: the reachable space grows with depth
faster than exhaustive strategies can cover, so a model proposing without reading the pattern
exhausts its budget on the deeper strata, and a deterministic breadth-first search fails on the
same samples for the same reason. Blind enumeration is not a weak baseline here, it stops being
viable. A model that cannot read a reflection off a pattern therefore has no way to choose a
direction, and on this task that is indistinguishable from being unable to do it at all. Geometric
understanding is the precondition for the search that gets scored.

### 16.4 Ablations are demoted to tiers, because the full study has not been run

**Decision.** The word *ablation* is out of the abstract and §1. §9 is now "Progressive tiers of
tool assistance." The four arms are unchanged; only the claim about them is weaker.

**Why.** A full ablation study was planned and has not been run. An ablation is a specific claim,
that one factor was isolated and its contribution measured, and a partial sweep does not support
it. Reporting tiers says what was actually done: the model is run at four levels of assistance and
the levels are compared. If the full study is run before submission this can be restored to an
ablation, and §9 and the abstract both change back together.

### 16.5 Still open

- **The abstract's lede.** It now opens on multimodal models and the geometry gap, matching §1. It
  is still long, at roughly one page-third, and should be cut once §10 exists and the headline
  result has to fit.
- **The headline result sentence** in §1 and the abstract. `[TO RUN]`
- **Figure 1**, the generation-versus-recovery asymmetry. §12 has it as "to draw"; an introduction
  to a benchmark paper is usually carried by that figure.
- **The star example in §1 is an unverified citation** and blocks submission. See §15 rule 7.

### 16.6 The 89.3% scope claim is now bounded to the corpus it was measured on

**Decision.** Every statement of the figure now reads "89.3% of the 366 real crease patterns in
Flat-Folder's `examples/instagram/` corpus" rather than "89.3% of real crease patterns." Three
places: §1 contribution 5, §7, §11.

**Why.** The measurement was made on one convenience corpus of 366 patterns. "Real crease patterns"
names a population that was never sampled, and a reviewer who checks the provenance will read the
generalization as either careless or deliberate. The bounded version is unattackable and loses none
of its force, because the point is only that the action space excludes most real origami and the
boundary is reported rather than buried. This was the single easiest reviewer objection in the
paper to remove.

### 16.7 The BFS claim was removed until the number exists

**Decision.** §1 previously asserted that a deterministic breadth-first search fails on the same
samples a model does. That sentence is gone. In its place is a statement that the depth at which
exhaustive search stops being affordable is measurable, and a `[TO RUN]` for the baseline.

**Why.** The claim had no measurement behind it, and the repo's own baseline suggests it may point
the other way. `workspace/search_baseline.mjs` was written to answer the opposite worry: its header
records that `list_legal_folds` evaluates roughly 2010 candidate actions per state and returns a
mean of 3.51 that are legal and stay inside the target CP, measured over 73,750 enumerations, and
warns that if exhaustive search over that pruned set solves the easy tier outright then the
enumerator arm's 20 to 26 percent is not measuring origami reasoning. A branching factor of 3.5 is
small. Asserting that blind search collapses, while shipping a script that suspects it does not,
is the kind of contradiction a reviewer finds by reading the repository. **The script has never had
its results written into any document in this project.** Run it and the sentence can come back,
stronger, with a number.

### 16.8 Baselines are named, because a benchmark without them is usually rejected

**Decision.** §8.5 names three: uniform random over enumerated legal actions, deterministic
breadth-first over the same action set, and the symbolic CP→Seq solver (Creasy). All `[TO RUN]`.

**Why.** Reviewers of dataset and benchmark papers ask what the floor is and what a non-learned
method achieves. Without that, model numbers are uninterpretable: 25 percent is either impressive
or embarrassing depending on what search alone does. The BFS baseline doubles as the answer to the
"the simulator did all the work" objection of §7, which is currently argued structurally and would
be much stronger argued numerically.

### 16.9 Licence and release terms

**Decision.** Everything ships under **BSD 3-Clause**: generator, environment and verifier, corpus
checks, comparator, harness, and the corpus itself. Recorded in §13a.

**Why.** Dataset and benchmark tracks expect an explicit licence, a hosting story and a maintenance
commitment, and their absence is a routine reviewer complaint. The corpus shipping as a seed rather
than a blob answers hosting almost for free. Still outstanding: the anonymised repository URL, an
archival DOI, and a datasheet.

### 16.10 OrigamiBench is closer to this work than §2 assumes, and this needs a decision

**Status: open. This is the most significant finding of the September 2026 citation check.**

The missing `origamibench` citation was recovered: Agarwal, Wu, Jian, Hu, Mansoor, Li, Peng, Dai,
Ding and Sansone, *OrigamiBench: An Interactive Environment to Synthesize Flat-Foldable Origamis*,
arXiv:2603.13856, March 2026. Its abstract describes "an interactive benchmark in which models
iteratively propose folds and receive feedback on physical validity and similarity to a target
configuration."

That is much nearer this paper's design than the draft assumed when it listed OrigamiBench as one
of the works that "complete the picture." The claim in §1 and §2.4 that *none* of the existing
benchmarks steps an engine and rules on a proposed move is now doubtful as stated, because
OrigamiBench appears to do exactly that.

Two distinctions probably survive and both need checking against the paper rather than the
abstract. First, OrigamiBench reports "similarity to a target configuration", which is a graded
comparison, where this work replays and compares exactly under a declared symmetry group. Second,
OrigamiBench synthesises toward a target, where this work recovers a sequence from a crease pattern
and a final state, which is the inverse problem. If both hold, the contribution stands and the
wording needs narrowing from "none of them executes" to something precise about exactness and
about the inverse direction. **If neither holds, the framing of §1 and §2.4 has to change.** Read
the paper before submission.

### 16.11 Citations verified in the September 2026 check

- **OrigamiSpace.** 350 instances and the four tasks confirmed. The venue is confirmed as **NeurIPS
  2025**, not an unvenued preprint, so §15 rule 4 is now satisfied and can be retired.
- **GamiBench.** 186 regular and 186 impossible patterns, six viewpoints, three VQA tasks, and the
  viewpoint-consistency and impossible-fold-selection-rate metrics all confirmed. Authors confirmed.
- **OrigamiBench.** Recovered; see §16.10.
- **COrigami.** Recovered as *COrigami: An AI Pipeline for Co-Designing Flat-Foldable Visually
  Recognisable Origami*, arXiv:2606.26299. Author list still unverified.
- **Still unverified:** the *Vision Language Models Are Blind* star example of §1, and the author
  lists of thirteen theory and tools entries, which now carry sort keys so the bibliography renders
  but still need real authors.

### 16.12 Two claims about exactness were narrowed to what the code does

**Decision.** The paper no longer calls the pipeline tolerance-free, and no longer describes the
Level 2 group as the eight symmetries of the square plus a translation.

**Why.** Neither matched `DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs`. Two mismatches:

1. **The group is larger than claimed.** The comparator quotients out the full plane isometry group,
   including *arbitrary* rotation, not the eight symmetries of the square. Its own header says so:
   "terminalMatch quotients the plane isometry group out."
2. **There is a tolerance.** `MATCH_TOL = 2e-6`, with degenerate-vertex cleanup at `1e-7` and a
   collinearity threshold at `1e-9`. The value is recorded in every result the harness writes:
   1,187 of 1,211 attempts across the saved runs carry `"tolerance": 2e-06`.

Admitting arbitrary rotation makes a tolerance unavoidable, because a rotation by an angle that is
not a multiple of a right angle produces irrational coordinates. So the tolerance is not sloppiness;
it is the necessary consequence of a design choice the paper wanted. What was wrong was the claim,
not the code.

The formulation now used: the **verifier** is exact, because legality is decided combinatorially by
the engine and involves no threshold; **terminal-state equality under transforms** carries a stated
numerical tolerance. Level 1 crease-set comparison remains genuinely tolerance-free.

Claiming an exactness the implementation does not have is the first thing a reviewer with the
repository checks, and in a paper whose contribution is the trustworthiness of its judge it would be
the most damaging possible thing to get wrong.

### 16.13 Figures have written briefs

**Decision.** `paper/figures/figure1.md` through `figure6.md`, one per figure, each naming where it
appears, the argument it carries, what it must show, **what it must not show**, how to tell whether
the drawing worked, and a draft caption. `paper/figures/README.md` indexes them.

**Why.** Three of the six figures can be drawn wrongly in ways that would contradict the paper's own
claims, and the briefs say so explicitly. Figure 1 must not imply legal moves are rare, which §3.3
exists to forbid. Figure 4 must draw the environment and the verifier as one box, because that is
the claim. Figure 6 must not hide a baseline crossing. A figure brief that only says what to draw
would let all three happen.

### 16.14 The abstract is rewritten as one paragraph and made consistent with the code

**Decision.** The abstract is now a single paragraph of roughly 440 words, down from six paragraphs,
and every claim in it matches the implementation and the rest of the paper.

**Why one paragraph.** The ICLR template states the requirement outright: "The abstract must be
limited to one paragraph." Six paragraphs was a hard format violation, not a style preference.

**What changed beyond the format.** Five inconsistencies were removed rather than reworded.

1. **The task.** It now says the model is given the crease pattern *and the final folded state*,
   matching §1. The old text said only "the sequence of folds that produced a crease pattern",
   which describes a harder and different task.
2. **The dataset.** It now leads with a benchmark *and dataset* of 600 samples. The old abstract
   named no size and made no dataset claim, which for a datasets-and-benchmarks submission is the
   first thing a reviewer looks for.
3. **Tolerance.** It no longer claims tolerance-free replay. Crease-set comparison is tolerance-free
   and says so; folded-state comparison is up to the plane isometry group and carries a stated
   numerical tolerance, per §16.12.
4. **Ablation vocabulary.** "Ablations that remove visual feedback, remove filtering, remove tools"
   is replaced by progressive tiers of tool assistance, per §16.4.
5. **Baselines.** The abstract now says models are ranked against a deterministic search baseline
   rather than only against each other, which is what §8.4 promises and what a benchmark paper is
   expected to provide.

The free-verification framing stays out (§16.1). What survives of it is the one sentence that
carries a fact rather than a slogan: the verdict on a step carries no threshold because legality is
decided combinatorially.

**Done, see §16.18.** The abstract was cut to 282 words once §10 produced numbers.

### 16.15 Figure drafting is scripted, with the limits of the method written into the script

**Decision.** `paper/figures/gen_figures.sh` drives the imagegen CLI to produce tracing drafts.
`--list` prints how each figure should actually be made; `--dry-run` needs no API key.

**How it runs.** Each figure is one `codex exec` call. Codex uses its **built-in `image_gen` tool**,
which is the imagegen skill's own preferred path and needs **no `OPENAI_API_KEY`** and no direct API
access. The `scripts/image_gen.py` CLI fallback, which does require a key, is explicitly not used.

**Why only two of six by default.** Figures 1 and 4 are conceptual and draft usefully from a prompt;
a bare run drafts only those. `--all` overrides it. The other
four carry data or geometry and must not ship as generated images: figures 2 and 5 should be built
from renders that already exist in this repo (`initial/cp.png`, `final/top.png`,
`final/exploded.png` for any sample), and figures 3 and 6 must be plotted from the release manifest
and the aggregation output. A generated crease pattern would be a fabricated figure in a paper whose
subject is exact verification, which is the worst place in the literature to put one. The imagegen
skill says the same thing in its own terms: diagrams are "better produced directly in SVG, HTML/CSS,
or canvas". The script prints this rather than assuming it is remembered.

### 16.16 Draft figures are labelled as drafts, in the PDF itself

**Decision.** Every placeholder figure renders a visible banner reading **DRAFT IMAGE: PLACEHOLDER,
NOT FINAL**, with a line saying it will be replaced by a human-authored figure and that drafts come
from OpenAI `gpt-image-2`. Captions carry a `[DRAFT IMAGE]` prefix so the marking also appears in
any list of figures. The same banner is at the top of each `paper/figures/figureN.md` and the README.

**Why in the PDF and not only in the notes.** A placeholder that is only labelled in a side file
becomes a real figure the moment somebody exports a PDF to show a collaborator. The label has to
travel with the artifact. It costs nothing and removes a whole class of accident.

### 16.17 LLM usage is disclosed, per ICLR 2026 policy

**Decision.** A new §13b discloses every use: models as the object of study, Claude Code for the
implementation, partial AI assistance for literature search alongside Google Scholar and alphaXiv,
AI assistance in drafting, and `gpt-image-2` for draft figures.

**The policy, checked rather than assumed.** ICLR 2026 has two policies on LLM use. Policy 1: any
use of an LLM must be disclosed, on the Code of Ethics principle that all contributions to the
research must be acknowledged. Policy 2: authors are ultimately responsible for their contributions
and must not make false or misleading claims. The policy does **not** distinguish a model used as a
research instrument from one used for writing; both must be disclosed.

⚠️ **Disclosure is required in the paper's text *and* in the submission form.** §13b satisfies the
first. The second is a separate field on the OpenReview form and is easy to miss.

The FAQ does not specify a required section, required wording, or whether the disclosure counts
against the page limit. It is written as a full section here on the basis that under Policy 2 the
authors carry responsibility either way, so under-disclosing buys nothing and risks everything.

**Why it is written long rather than minimal.** A disclosure that omits a use is worse than one that
reports a use a reader would have forgiven. The section also names the two verification habits that
exist *because* of the reliance on AI-assisted implementation, the independent corpus checks and the
comparator's negative control, and states that the negative control caught a real defect. That is
the honest form of the disclosure: not a claim that assistance introduced no risk, but a description
of what was put in place to catch it.

### 16.18 The abstract is cut to 282 words, and the result now carries its ending

**Decision.** The abstract is 282 words, down from 443. It ends on the finding rather than on the
scoring protocol.

**Why it was too long.** 443 words is roughly a page-third and reads as a summary of the paper's
mechanism rather than of its contribution. The cause was structural: the abstract was written before
§10 existed, so the middle of it carried mechanism description that was doing the work a result
would otherwise do. Once the numbers existed, most of that description could go.

**What was cut, and on what principle.** Everything that a reader can reach in one page of §1 and
that is not a claim. Gone: the enumeration of refusal types beyond one example, the two named levels
of equality, the crease-set versus folded-state distinction, the per-stratum reporting protocol,
queries-to-solution as a secondary measure, the stratification axes, and the tolerance discussion.
None of that is wrong and all of it survives in §5, §6 and §8; none of it belongs in an abstract
competing with a result for the same 250 words.

**What was kept, and why each earns its place.** The multimodal framing, because it is the reason a
reader at ICLR should care. The task in one sentence. The generate-versus-solve asymmetry with the
NP-hardness, because it is the paper's foundation. Constructed ground truth and seed-rebuilding,
because those are the dataset claims a benchmark reviewer reads for. Environment-as-verifier in two
sentences. The tiers, in one clause. And the three numbers: no solve past easy, 54.7 against 20.4,
48 percent cycling.

**The ending changed, and this is the part that matters most.** The old abstract ended on the
scoring protocol, which tells a reader what we did. It now ends on state cycling, which tells them
what we found. An abstract whose last sentence is a method is a proposal; one whose last sentence is
a finding is a result.

### 16.19 No repository or dataset links in the paper

**Decision.** §13a states the licence and one sentence: code and data are released on publication,
links omitted. No URLs, no DOI, no datasheet, no hosting or maintenance prose.

**Why no links at all.** Two reasons, and either is sufficient on its own. A URL naming the authors'
organisation identifies them in a double-blind submission. And a link committed to in a paper is
fixed at the moment of submission, so naming one before the repository and dataset are actually
published creates a name the project then has to honour. Omitting them removes both problems and
costs nothing at submission time.

**When to add them.** At camera-ready, once the repository and the dataset exist under names that
are not going to change. At that point the paper is the authority and the artifacts are renamed to
match it, rather than the paper being edited to chase them.
