# Existing Metrics in AI Origami — Related Work Draft (EN)

Drafted 2026-09-11. Chinese version in `2026-09-11-states-and-simulator.md`.
This is the argument for *why the state-ranking problem has not been studied*.

---

## The claim

> **Every existing metric in this literature compares a produced artifact against a
> target. None of them ranks among the N valid folded states of a single crease
> pattern.**

This is not an oversight to be argued around: a target is *required* to compute any
of them. The absence is structural.

---

## Table: metrics currently in use

| Source | Metric | Definition | What it compares |
| --- | --- | --- | --- |
| **OrigamiBench** | Query Efficiency (QE) | Fraction of fold steps that contribute to the final origami | How much the agent wandered |
| | Geometric Similarity | IoU(M_A, M_B) = \|M_A ∩ M_B\| / \|M_A ∪ M_B\| | Output vs. target |
| | Semantic Similarity | Cosine similarity of fine-tuned CLIP embeddings | Output vs. target |
| **OrigamiSpace** | Multiple-choice / sequence accuracy | Standard accuracy | Answer vs. ground truth |
| | Compilation success rate | Whether the generated CP code compiles | Binary |
| | Topological / geometric / constraint / shape similarity | Each scored 0–1, weighted average | Output vs. target |
| **GamiBench** | Accuracy | Standard accuracy | Answer vs. ground truth |
| | Viewpoint Consistency (VC) | Conditional re-test accuracy after a viewpoint change | Model self-consistency |
| | Impossible Fold Selection Rate (IFSR) | Rate of labelling valid folds as impossible | Model bias |
| **Learn2Fold** | Precision / Recall / F1 | At the level of structured action tokens | Predicted vs. expert sequence |
| | Category Success Rate | Fraction of targets completed | Binary |
| | Edge-IoU | IoU over the set of affected edges | Output vs. target |
| **FoldingAgent** | Topology / geometry / constraint satisfaction | Separately defined | Reconstruction vs. ground truth |
| | Human preference | 84% preference rate | Subjective, A vs. B |
| **COrigami** | Flat-foldability | Boolean | Valid or not |
| | VLM aesthetic score | 0.811 agreement with human judgement | Subjective |
| **Flat-Folder** (outputs, not metrics) | states / components / variables / four constraint counts / solve_sec | See `instagram_data.csv` | **Problem size, not quality** |

**Note on the last row.** Flat-Folder reports *how many states exist and how hard they
were to compute*, never *which state is better*. The solver has no preference function,
because it has no physics: in its model the sheet has zero thickness, no mass and no
material. This is the gap the present work addresses.

---

## Four dimensions along which states could be ranked

| Dimension | Metric exists? | Where it breaks down |
| --- | --- | --- |
| **Mechanical performance** | Yes, and mature — stiffness K, multistable energy landscapes, energy absorption, all computable with bar-and-hinge models (MERLIN2, SWOMPS) | **Never connected to state selection.** The mechanics literature compares different CP designs; the AI literature does not touch mechanics at all |
| **Number of steps** | No | The closest is OrigamiBench's QE, which measures *how many queries the agent wasted*, not *how many steps the state intrinsically requires*. A perfect agent on a state that genuinely needs 20 steps scores QE = 100%; the step count is still 20 |
| **Hand-foldability** | Theoretically defined, and **deciding it is NP-hard** | No quantitative measure. The AI literature avoids the dimension by restricting the dataset rather than measuring it |
| **Robot executability** | No | Entirely absent in origami. The nearest analogue is LeHome's keypoint-threshold binary success criterion, which evaluates *one execution* rather than *how hard a state is to execute*, and concerns cloth rather than paper |

---

## Theoretical grounding for hand-foldability

> Arkin, Bender, Demaine, Demaine, Mitchell, Sethia & Skiena,
> **"When Can You Fold a Map?"**, *Computational Geometry: Theory and Applications*
> 29(1):23–46, 2004.
> https://erikdemaine.org/papers/MapFolding/ · https://arxiv.org/abs/cs/0011026

The paper studies **simple folds**: rotating a portion of the sheet about a single
crease by ±180°, which is the motion a human hand naturally performs. The central
question is whether a mountain/valley-assigned crease pattern admits a sequence of
simple folds that flat-folds it. The result is that map folding and several variants
are polynomial, while slight generalisations are NP-complete.

Three consequences for this work:

1. It turns "can a human fold this" from intuition into a **precisely defined
   computational problem**.
2. Because deciding it is NP-hard in general, it is **exactly the kind of predicate a
   learned surrogate is needed for**.
3. **Pureland origami is defined by admitting only simple folds.** FoldingAgent's
   restriction to Pureland therefore *avoids* this dimension by construction rather
   than measuring it — and the "simultaneous compound actions" failure mode it reports
   is what leaks through at the boundary of that avoidance.

So the dimension is not unconsidered. Theory defined it and proved it hard; the AI
literature routed around it. Nothing quantitative sits in between.
