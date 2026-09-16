# Experiments — the operational spec for Track 1 (CP → Seq)

2026-09-14, revised 2026-09-15.

**This file owns how the experiment runs**: the loop, the tools, the conditions, the metrics,
and the protocol that has to be fixed before the first run. It is the design doc the code is
written against.

> **Scope boundary — each fact has exactly one home, so an edit is made once.**
>
> | File | Owns |
> | --- | --- |
> | **this file** | **how the experiment runs** |
> | `DATASET.md` | where the data comes from |
> | `BASELINE_REPRODUCTION.md` | who we compare against |
> | `notes/plan/experiment-spec-checklist.md` | which decisions are frozen, and their status |
> | `notes/plan/research-workflow.md` | phases, discipline, where we are |
>
> Repo-root docs are English (they are shared); `notes/` is Chinese (working notes). The same
> passage is never written in both languages — that guarantees drift.

---

## 1. Dataset

### 1.1 Sources

- **Flat-Folder** examples (`flat-folder/examples/...`) — CPs only. Per
  `notes/tools/flat-folder-capabilities.md`, Flat-Folder has **no concept of a step at all** — it
  solves for terminal flat-folded states, not sequences. So these give us CPs and, at best, a
  terminal state — never a step-by-step ground truth.
- **PurelandFold** — 27<!--fact:purelandfold.sequences--> real fold *sequences* (337<!--fact:purelandfold.frames--> frames), the only genuine bucket-A
  source we found. ⚠️ **Only partly inside this experiment's action space**, contrary to the
  unqualified "reality anchor" this file claimed until 2026-09-16: 7<!--fact:anchor.solved--> of its models are
  foldable under our rules, 12<!--fact:anchor.exhausted--> are *proven* not, 8<!--fact:anchor.timeout--> unknown (`DATASET.md` §2). Use the
  foldable part as the anchor and name it; the rest is a scope-boundary measurement and
  belongs to the some-layers extension tier.
- **Synthesized Pureland corpus** — fold forward from a square with random simple folds, record
  the sequence, unfold to get the CP. **Bucket A by construction, difficulty controlled by step
  count.** This is the main data path (`DATASET.md` §0, `notes/plan/corpus-plan.md`), because
  the audit found no accessible real source with bucket A at scale. ⚠️ Learn2Fold was the last
  candidate and **its dataset was never released** — that line of inquiry is closed.
- **Creasy / Akitaya 2013** worked examples — per `notes/reading/creasy-cp-to-seq.md`, a handful of
  classic models (crane, frog base) have a **fully computed step-graph**, i.e. genuine
  step-by-step ground truth, sometimes tens of thousands of nodes deep. Useful as reference
  sequences for the few models it covers; not a source of new CPs (GPL-3, unmaintained since
  2022 — we don't reproduce it, see that file).

### 1.2 The foldability ceiling: this corpus is almost entirely out of reach

Probe C is complete (`notes/probes/probe-c-screen.md`). Three independent layers of evidence,
each a proof rather than an estimate, rule out most of the corpus:

| | | |
| --- | --- | --- |
| Fails the spanning-line necessary condition | 125<!--fact:probeC.screenFail--> | 34.2%<!--fact:probeC.screenFailPct--> |
| Carries a pre-crease (a flat crease simple folding cannot make) | 46<!--fact:probeC.preCrease--> | 12.6%<!--fact:probeC.preCreasePct--> |
| **Full search EXHAUSTED the space without a solution** | **156**<!--fact:probeC.exhausted--> | **42.6%**<!--fact:probeC.exhaustedPct--> |
| **PROVEN not simple-foldable** | **327**<!--fact:probeC.provenNot--> **/ 366**<!--fact:corpus.instagram.total--> | **89.3%**<!--fact:probeC.provenNotPct--> |
| Search timed out — status genuinely unknown | 37<!--fact:probeC.timeout--> | 10.1%<!--fact:probeC.timeoutPct--> |
| **Confirmed foldable** | **2**<!--fact:probeC.solved--> | **0.5%**<!--fact:probeC.solvedPct--> |

The action space is fixed to simple folding (Pureland), so those 327 CPs **have no solution in
our action space at all**. A flat "% of dataset solved" over 366 has a ceiling of **10.7%**, and
everything below that ceiling is the task definition, not the model.

⚠️ **0.5% is a floor, not the true rate.** The search cannot get past roughly 8 folds, while
real Pureland sequences run 5-21 steps, so the 37 timeouts likely contain foldable CPs. The
honest statement is that the true share lies somewhere in **0.5%-10.7%**.

⚠️ EXHAUSTED carries one asterisk, stated rather than buried: the search rejects any fold that
creases a line against the assignment the CP demands, so it means "no simple-fold sequence that
never folds a crease against its final direction".

**Therefore every dataset-level number in §6 is reported in four strata, never pooled:**

| Stratum | n | How a run on it is read |
| --- | --- | --- |
| **Confirmed foldable** | 2 | the only stratum where %solved is a model score |
| **Timeout / unknown** | 37 | scored separately; a wrong answer here is not provably wrong |
| **Proven not foldable** | 327 | reported, never scored — a correct model should *refuse* these |
| **Pooled** | — | **never**. One percentage over 366 is the fastest way to make this indefensible |

**This forces a change of plan, and it is worth more than the plan it replaces.** With 2 solved
CPs there is no query-efficiency distribution to report, so the pure-search baseline in §5 is
not a curve — it is a **failure rate**: exhaustive search solves 2 of 195 candidates. That is a
stronger argument for a heuristic than any query count would have been, and it is what
Akitaya's own future-work paragraph predicted (`notes/reading/creasy-cp-to-seq.md`).

⚠️ **Consequence for §1.3: the instagram corpus cannot carry the main experiment.** 39 CPs are
in play at the absolute best, 2 at worst. The synthesized corpus (`DATASET.md` §0) is no longer
a supplement to it — it is the only viable source of scored samples.

### 1.3 The real shape of the data: pairs are common, sequences are rare

Every sample we can use has at minimum a **`(CP, final result)` pair** — that's the
non-negotiable minimum, since it's the ground truth the loop's ACCEPT/REJECT check needs.

What's *not* guaranteed is the middle: the full `.fold`-by-`.fold` sequence connecting CP to
final result. Some sources (Creasy's step-graphs) give sequences hundreds of steps long for a
few classic models. Most CPs in the wild give us only the two endpoints — no intermediate
`.fold` files exist at all.

⚠️ **Consequence**: this splits the dataset into three usable buckets, and not every experiment
can run on every bucket:

| Bucket | Has | Usable for |
| --- | --- | --- |
| A | CP + full step sequence | Sequence-level metrics (edit distance, group F of the checklist) |



These buckets are **orthogonal** to the four strata of §1.2: a CP can be bucket B *and*
proven-not-foldable. Bucket says what ground truth exists; stratum says whether a solution
exists at all.

### 1.4 Action item before running anything


- [ ] Generate the first batch of the synthetic corpus and inspect its step / degeneracy
      distribution **before** fixing the sampling design (`notes/plan/corpus-plan.md`). - For Lu
      the data set will have CP(.CP) & ONE .fold (along with Sequence: Frame1, Frame 2...), 
      Just final Steps or with all Steps.

- [ ] Confirm PurelandFold's frame format converts to the per-step `.fold` shape the simulator
      (§3.1) expects, since the comparison step (§4) needs to know what it is diffing against.

---

## 2. The model under test: a VLM 

**VLM = an LLM with vision input.** Nothing more exotic than that — the same text context (CP
description, prompt, history) as a plain LLM, plus the images the simulator renders. **Every
"LLM" in this file means a VLM** the moment the visual feedback channel is on, because a
text-only model cannot read a rendered fold-state image.

⚠️ **No model is trained or fine-tuned** — inference and tool-calling only. Candidates:
**Gemini Flash** (free credits), **Nemotron**, other off-the-shelf VLMs opportunistically. The
model is held fixed between the tool-augmented arm and the no-tools control; comparing across
models would confound the ablation. Running the whole pipeline on two models tells us whether
the effect is model-specific or general.

- [ ] We need to list the models and tests
---

## 3. Tools given to the VLM

### 3.1 Surface simulator — the core tool, must be built - for Dheeraj

- **Input**: a `.fold` file — either a full state, or the previous state plus one candidate next
  fold applied to it.
- **Output on success**: a 3D representation of that state — either (a) a three.js scene, or
  (b) 3–4 static images rendered from different camera angles. X ray
- **Output on failure**: a structured **error**, not images — the candidate fold is illegal
  because the paper would have to pass through itself ("penetrate"). This is the same class of
  check as Flat-Folder's four constraint types (`taco-taco` / `taco-tortilla` /
  `tortilla-tortilla` / `transitivity` — see `notes/tools/flat-folder-capabilities.md`), but applied to
  **one candidate step**, not a global terminal state.
- This is the piece the rest of the notes call the **surface simulator**. Flat-Folder does not
  provide it — Flat-Folder has no notion or Motion of "step," full stop 

### 3.2 Hamiltonian-path tool (Prof. Yi's suggestion) — to attempt - Both Dheeraj and Jialu

- Intended purpose (still being scoped): search over / verify a traversal order on the crease
  graph, to help the VLM propose an ordering instead of deriving one from scratch every step.
- Status: **not implemented yet.** Either build a minimal version or find an existing
  open-source implementation that does the equivalent job — needs its own short scoping note
  before it's added to the tool belt for real. Don't let it block the surface simulator work.


---

## 4. The loop

```
   (CP, FINAL RESULT)                 ← dataset pair (§1)
            │ CP
            ▼
      ┌───────────┐
      │  PROMPT   │◄──────────────────────┐
      └─────┬─────┘                       │
            ▼                             │
      ┌───────────┐                       │
      │    VLM    │                       │
      └─────┬─────┘                       │
            │ candidate next .fold step   │
            ▼                             │
      ┌────────────────────┐              │
      │  SURFACE SIMULATOR  │              │
      │   (+ optional tools)│              │
      └─────────┬───────────┘              │
           ok   │   illegal fold           │
           ▼    ▼                          │
         3D    ERROR ──────────────────────┘
           │
           │  (VLM marks its own step "final")
           ▼
      FINAL .fold  ──►  compare to FINAL RESULT  ──►  ACCEPT / REJECT
```

- **Dataset pair**: `(CP, FINAL RESULT)` from a bucket-B-or-better sample (§1.2).
- **PROMPT**: the running context — CP, task instructions, and the full history of
  step → images/error exchanges so far. This is what actually grows each iteration; the VLM box
  itself is stateless per call.
- **VLM**: proposes the next `.fold` step, or declares the sequence complete.
- **Surface simulator**: the verifier (§3.1) — renders images on success, returns a structured
  error on an illegal (self-intersecting) fold. Optional tools (§3.2, §3.3) sit alongside it.
- **Loop**: images or error get folded back into the prompt for the next VLM call. This repeats
  until the VLM emits a step it marks as final.
- **Compare**: ⚠️ **a CP can have many valid terminal states** (`notes/tools/flat-folder-capabilities.md`),
  so an exact diff against the one stored `FINAL RESULT` marks correct answers wrong. ACCEPT is
  therefore defined on the **equivalence class**, not on byte equality: the final `.fold` is
  accepted if (a) it is a valid flat-folded state of the CP, and (b) it matches `FINAL RESULT`
  up to the symmetries we declare in advance — paper rotation/reflection, and the layer-order
  variants Flat-Folder itself reports as equally valid. `DATASET.md` already flags that picking
  one terminal state is our experimental choice and not a label from the source; this is the
  line where that choice has to be paid for.

---

## 5. Experiment conditions

| Condition | Tools available | What it measures |
| --- | --- | --- |
| **Full tool belt** | surface simulator + 3D + Hamiltonian tool (if ready) | upper bound — how well the loop does with everything |
| **No vision** | same tools, the rendered-image channel dropped | the value of visual/geometric feedback specifically |
| **Verifier only** | pass/fail from the simulator; no filter | the value of the filter step on top of raw verification |
| **No tools, prompt-only** | none — plain VLM prompting, no simulator calls | memorization control — is the model reasoning through the loop, or recalling the fold from pretraining/dataset exposure |

> If the no-vision or no-tools arm performs nearly as well as the full arm, **that is a finding,
> not a failed experiment** — it means the gain is not where we assumed.

Same VLM, same CP set, same query budget across both conditions — this is the direct A/B that
answers "how would it behave and what's the accuracy without these tools."

**Protocol, fixed before the first run:**

- **Input anonymization.** CP filenames in this corpus carry the model's name
  (`009_ku_Unassigned_Triangle_Pleat`). The no-tools arm is a *memorization* control — if the
  model can read that name it recalls instead of reasoning, and then **both** arms measure
  recall and the A/B measures nothing. Strip filenames and all metadata; feed geometry only.
- **Query budget.** One fixed number N of simulator/tool calls per CP, identical across arms.
  Exhausting it is a **Timeout** (§1.2), not a REJECT — the two mean different things.
- **Repeats and seeds.** k runs per CP with recorded seeds; report median and spread, never a
  single run. VLM sampling is not deterministic and a single run is not a measurement.
- **Stratified sampling.** Probe A found the explosion lives in the tail, not the median
  (`notes/probes/probe-a-explosion.md`), so the CP set is sampled across difficulty strata
  rather than uniformly.

---

## 6. Metrics

**Primary — sequence-level metrics** (edit distance / step-count ratio against the ground-truth
sequence, group F). Probe B measured that the terminal-state problem is near search-free — the
propagation oracle has 0% false positives because reaching *a* valid state is not the hard part
(`notes/probes/probe-b-oracle.md`). **The difficulty lives in the sequence layer**, so that is
where the headline number has to come from.

> ⚠️ Sequence metrics are computable only on bucket A. 27 real PurelandFold sequences cannot
> carry a headline, which is exactly why `DATASET.md` now has to supply a **synthesized**
> bucket-A corpus at scale.

**Gate — terminal match (ACCEPT rate).** Retained as an admission criterion — "did it produce a
legal terminal state at all" — reported per stratum (§1.2), never pooled. This is no longer the
headline; Probe B showed it is the easy half of the problem.

**Queries to solve** — reported over **all** attempts, not only the solved ones. Conditioning on
success hides precisely the long-tail blowup Probe A measured. Report the full within-budget
distribution plus the timeout fraction (ties to the query-efficiency claim in
`notes/plan/experiment-spec-checklist.md`).

---

## 7. Error analysis

Every simulator rejection already comes labeled with which constraint class it violated
(Flat-Folder's four types, §3.1) — reuse the failure taxonomy in group E of
`notes/plan/experiment-spec-checklist.md` rather than inventing a new one. This is what turns a REJECT
into a diagnosis instead of a dead end.

---

## 9. Contributions this is meant to produce

- A reproducible **baseline ladder** on one CP set and one query definition (`BASELINE_REPRODUCTION.md`)
  — missing from the current literature comparison.
- A tool-augmented VLM loop scored on **query efficiency and pruning/backtracking quality**, not
  raw success rate.
- A **memorization control** — same model, same CPs, tools removed — separating "reasons better
  with tools" from "already knew the answer". Most LLM-for-planning papers skip this.
- A **visual-feedback ablation**: does rendering the state back to the model measurably change
  pruning or backtracking quality? This speaks to the Spa3R vs. "I Know About Up!" mental-imagery
  debate (group D of the checklist).
- A **measured scope boundary**: 89.3%<!--fact:probeC.provenNotPct--> of real crease patterns provably lie outside
  all-layers simple folding (§1.2). The action space is bounded by evidence, not by assertion.
- **A partial fold is almost never available at random, and that is a finding about origami,
  not about our sampler.** Allowing a fold to move only some layers sounds like a loosening of
  the action space; measured, it is a tightening. A randomly proposed partial fold succeeds
  **11.9%** of the time, and the rate falls as the stack thickens — 20.0% at one or two layers,
  **3.8% at seventeen to thirty-two** — because a thicker stack pins each sheet in more places,
  and moving a run of layers that is pinned elsewhere tears the paper. **81.3% of every rejected
  proposal is a tear** (`notes/plan/corpus-plan.md`, pilot of 2026-09-16).
  **Read the other way, this is the substantive claim: the partial folds in real origami are not
  arbitrary — they are the small set that does not tear.** Connectivity constrains this action
  space far more tightly than "some layers may move" suggests, and an agent working in it
  searches a space whose legal moves are rare and get rarer with depth. That is a property of
  the problem, not of our code, and it is also why a corpus for this tier cannot simply dial up
  the fraction of partial folds it contains.

> ⚠️ **No model is trained or fine-tuned.** Every arm is an off-the-shelf VLM driven by prompting
> and tool-calling. The contribution is the harness — tools, verifier, ablation design — not a model.

---

## 10. Output

Numbers from §6 + the error breakdown from §7, for both conditions in §5, get written up as the
Track 1 paper (framing per `notes/plan/track1-surface-simulator.md`).
