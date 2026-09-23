# ICLR improvement review

Reviewed 22 September 2026. The requested Positioning section and its obsolete title-selection comments were removed from `iclr2026_conference.tex`. The suggestions below are recommendations, not changes to the paper's claims or experiments.

The benchmark has useful ingredients: executable solutions, reproducible generation, explicit state equivalence, and an informative cycling diagnostic. The largest weakness is that the experiments do not yet establish a reliable measure of spatial reasoning. ICLR's reviewer guide emphasizes supported claims, experimental rigor, reproducibility, and new knowledge; a new state-of-the-art model is not required. [ICLR reviewer guide](https://iclr.cc/Conferences/2026/ReviewerGuide)

## 1. Make the main comparison controlled

Locations: Results / Headline, What the tools contribute, Threats to these results.

The headline compares 366/669 easy BFS attempts with 59/289 model attempts. The aggregate covers 256 distinct samples and 1,211 attempts, so repeated samples receive unequal weight. These totals do not establish a paired performance difference. Likewise, 20.4% versus 6.2% is an observed difference between run collections, not yet evidence that filtering causes a 3.3-fold improvement.

Use a fixed common sample manifest, identical repeat counts, and declared resource budgets. Report per-sample mean success and uncertainty that accounts for repeated attempts on the same sample. Separate API/harness errors from valid task failures, while retaining an end-to-end reliability measure. Distinguish tool calls, internal verifier evaluations, tokens, and wall-clock cost: five BFS tool calls need not represent less work than 23.5 model calls.

Correct the beyond-easy denominators: the table contains 67 mid and 26 hard identified model attempts. The prose's 70 and 27 include three mid and one hard attempts whose model is unknown and which terminated in error. Also replace “beats every model tested”: the 1/1 row cannot support that comparison, and the paper itself acknowledges inadequate coverage.

## 2. Establish what capability the benchmark measures

Locations: Progressive tiers of tool assistance, Results / Failure taxonomy, Limitations.

Prioritize a matched low-versus-high reasoning-effort experiment for the best-covered model, followed by adequate coverage for other models. Complete the no-vision and verifier-only conditions if their effects remain part of the contribution. Specify exactly which input images and feedback images disappear in each condition.

Add an external visited-state memory condition with the same action interface. Cycling may reflect memory management, prompt design, or the stopping rule as well as spatial reasoning. Check whether legitimate undo/backtracking triggers the detector. An intervention is stronger evidence than attributing all cycling to inability to recognize a state.

Calibrate difficulty on a development set and freeze a separate evaluation set. Near-zero performance on every harder stratum currently gives little model discrimination. BFS success on easy instances does not establish that they measure no origami reasoning; it establishes a competitive algorithmic baseline. Stripping filenames also does not establish absence of memorization. Fresh seeds and geometric transformations offer more direct controls.

## 3. Repair the novelty comparison

Locations: Related work / Origami benchmarks, The structural gap, Table `tab:closest`.

The assertion that none of the listed benchmarks executes proposals is too broad. OrigamiBench explicitly describes iterative fold proposals with physical-validity and target-similarity feedback. Include it in the direct comparison table and verify differences in input, action space, feedback, target equivalence, and sequence recovery against its full paper. Its abstract alone does not establish every implementation detail. [OrigamiBench](https://arxiv.org/abs/2603.13856)

The draft's own Changes appendix already identifies this issue. A narrower potential contribution is sequence recovery from both endpoints with a declared state-equivalence protocol and reproducible difficulty strata. Confirm each distinction before claiming it.

## 4. Make task, scoring, and budget definitions agree

Locations: Problem formulation / The task, Scoring, Experimental setup / The pipeline.

The abstract supplies both a crease pattern and final state; the formal task supplies only a crease pattern. Define both inputs, allowable actions, state transitions, stopping conditions, and success criteria together. Explain whether success requires both Level 1 crease equality and Level 2 terminal equality, or whether they are separate reported outcomes. The results currently do not separate the two promised levels.

The episode pseudocode bounds `len(seq)`, but refusals do not increase it even though the prose says refusals consume budget. Use an explicit query counter and specify charges for inspection, enumeration, undo, and submission. Explain what “no tools” means when the table still reports calls.

Clarify how the agent receives original face identities: the scoring section says stored frames lack identities that replay recovers. If those identities affect correctness, the supplied target must contain enough information to specify the desired answer.

## 5. Narrow the complexity and exactness arguments

Locations: Abstract, Introduction, Problem formulation, Environment / Division of labour.

Worst-case NP-hardness of a related foldability problem does not by itself prove hardness for this generator's guaranteed-solvable instances with a supplied final state. State the assumptions of the cited result and either establish applicability or use it only as motivation. “Cannot search ... even in principle” does not follow from NP-hardness. Absence of a closed-form counting formula also does not establish enumeration cost.

The shared engine validates replay consistency but cannot independently establish physical correctness; the paper correctly acknowledges this later. Add independent small-instance legality checks and comparator controls for valid rotations/reflections, face identity, parity, layer order, and tolerance boundaries. Reserve exactness claims for properties actually established by the implementation and arithmetic.

## 6. Remove draft contradictions and compress the argument

Locations: Introduction, Experimental setup, Figures, Reference notes, disclosure.

Remove stale `[TO RUN]` statements for completed BFS runs; fill model versions, budgets, repeats, and settings. Move the objection-by-objection discussion into relevant methods and limitations paragraphs. Cut repeated generator/verifier explanations. Replace placeholder figures with an actual sample showing inputs and a withheld solution, plus a controlled results plot.

`Reference notes` remains visible even with `draftnotesfalse`. It contains editorial instructions and claims citations are missing although the bibliography contains them. The assistance-tier section also references `app:changes`, which is hidden in that mode and can therefore produce an unresolved reference. The disclosure says every result is a model output despite the BFS results, and claims all citations were verified despite unresolved bibliography notes. Align these statements with what was actually checked.

The bibliography contains an extra standalone closing brace after `corigami`, authorless entries, and editorial `VERIFIED` notes that may print. Audit and clean it before submission. Confirm the intended conference year before using this template for a new submission; the folder name alone is not evidence of the target cycle.

## Verification scope

Headline fractions, run totals, and termination counts were cross-checked against `workspace/RESULTS/results.md`; raw-run correctness and aggregation logic were not independently validated. OrigamiBench's abstract and the official reviewer guide were checked online. This was not a full verification of every citation, theorem, or empirical claim. No experiments, Python/Node commands, or LaTeX build were run.

To rebuild the PDF yourself:

```sh
cd /Users/ddod/LEANMCP/ROBOTICS/FoldOrigami/PAPER_FINAL/iclr2026
latexmk -pdf -interaction=nonstopmode -halt-on-error iclr2026_conference.tex
```
