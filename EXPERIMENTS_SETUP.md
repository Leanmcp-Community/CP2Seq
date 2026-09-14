# Experiments Setup — Tool-Augmented VLM for CP → Fold Sequence

2026-09-14. Operational design for the plan sketched in `notes/experiment-spec-checklist.md`
("Experiment Plan" section). That file has the hypothesis, metrics, and ablation *definitions*;
this file is the concrete loop, tools, and dataset audit needed to actually run it.

Scope: Track 1 (CP → Seq) only, per `notes/track1-surface-simulator.md`.

---

## 1. Dataset

### 1.1 Sources

- **Flat-Folder** examples (`flat-folder/examples/...`) — CPs only. Per
  `notes/flat-folder-capabilities.md`, Flat-Folder has **no concept of a step at all** — it
  solves for terminal flat-folded states, not sequences. So these give us CPs and, at best, a
  terminal state — never a step-by-step ground truth.
- **Learn2Fold** dataset — this is where a `(CP, final result)` pair is most likely to exist in
  a form we can reuse directly. Needs an audit (below) to confirm the exact format of "final
  result" it ships (`.fold` state, rendered image, or 3D mesh — TBD, check their repo/paper).
- **Creasy / Akitaya 2013** worked examples — per `notes/creasy-cp-to-seq.md`, a handful of
  classic models (crane, frog base) have a **fully computed step-graph**, i.e. genuine
  step-by-step ground truth, sometimes tens of thousands of nodes deep. Useful as reference
  sequences for the few models it covers; not a source of new CPs (GPL-3, unmaintained since
  2022 — we don't reproduce it, see that file).

### 1.2 The real shape of the data: pairs are common, sequences are rare

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
| B | CP + final result only, no intermediate steps | ACCEPT/REJECT loop (this doc's main experiment) |
| C | CP only, no ground truth of any kind | Not usable for scored experiments — exploration/pilot only |

### 1.3 Action item before running anything

- [ ] Write an audit script over every dataset source that buckets each CP into A/B/C above and
      records, for bucket A, exactly how many intermediate steps exist.
- [ ] Report bucket sizes before doing the dev/test split (group G in the checklist depends on
      knowing how many samples are actually scorable).
- [ ] For Learn2Fold specifically: confirm the exact file format of "final result" (`.fold` /
      image / mesh) since the simulator's comparison step (§4) needs to know what it's diffing
      against.

---

## 2. The model under test: a VLM

**VLM = an LLM with vision input.** Nothing more exotic than that — it takes the same text
context (CP description, prompt, history) as a plain LLM, plus it can also consume the images
the simulator renders. Every "LLM" reference in the Experiment Plan section of
`notes/experiment-spec-checklist.md` becomes a VLM call the moment the visual feedback channel
is turned on, because a text-only model literally cannot read the rendered fold-state images.

Candidate models (no training/fine-tuning on any of them — inference and tool-calling only, per
PR #2): **Gemini Flash** (free credits), **Nemotron**, and other off-the-shelf VLMs opportunistically.

---

## 3. Tools given to the VLM

### 3.1 Surface simulator — the core tool, must be built

- **Input**: a `.fold` file — either a full state, or the previous state plus one candidate next
  fold applied to it.
- **Output on success**: a 3D representation of that state — either (a) a three.js scene, or
  (b) 3–4 static images rendered from different camera angles.
- **Output on failure**: a structured **error**, not images — the candidate fold is illegal
  because the paper would have to pass through itself ("penetrate"). This is the same class of
  check as Flat-Folder's four constraint types (`taco-taco` / `taco-tortilla` /
  `tortilla-tortilla` / `transitivity` — see `notes/flat-folder-capabilities.md`), but applied to
  **one candidate step**, not a global terminal state.
- This is the piece the rest of the notes call the **surface simulator**. Flat-Folder does not
  provide it — Flat-Folder has no notion of "step," full stop — so it has to be built from
  scratch. This is the actual engineering deliverable of Track 1.

### 3.2 Hamiltonian-path tool (Prof. Yi's suggestion) — to attempt

- Intended purpose (still being scoped): search over / verify a traversal order on the crease
  graph, to help the VLM propose an ordering instead of deriving one from scratch every step.
- Status: **not implemented yet.** Either build a minimal version or find an existing
  open-source implementation that does the equivalent job — needs its own short scoping note
  before it's added to the tool belt for real. Don't let it block the surface simulator work.

### 3.3 Image-generation tool — optional, experimental

- Purpose: given a `.fold` file, generate a picture of the folded state directly (candidates:
  **Nano Banana**, a **GPT Imagen-2-class** model), as an alternative to the simulator's
  geometrically exact render.
- ⚠️ **Accuracy is unverified.** An image generator is not a geometry solver — it can produce a
  plausible-looking image of a fold that is actually illegal. Treat this strictly as an
  **ablation arm** ("does a fast-but-unverified image help or hurt vs. the simulator's exact
  render?"), never as a substitute for the simulator's correctness guarantee.

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
            │ candidate next .fold step    │
            ▼                             │
      ┌────────────────────┐              │
      │  SURFACE SIMULATOR  │              │
      │   (+ optional tools) │              │
      └─────────┬───────────┘              │
           ok   │   illegal fold           │
           ▼    ▼                          │
        IMAGES  ERROR ──────────────────────┘
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
- **Compare**: the VLM's final `.fold` is diffed against the dataset's `FINAL RESULT` (format
  depends on source — §1.1) → **ACCEPT** if it matches, **REJECT** if it doesn't.

---

## 5. Experiment conditions

| Condition | Tools available | What it measures |
| --- | --- | --- |
| **Full tool belt** | surface simulator + Hamiltonian tool (if ready) + optional image-gen | upper bound — how well the loop does with everything |
| **No tools, prompt-only** | none — plain VLM prompting, no simulator calls | memorization control (per PR #2's Experiment Plan) — is the model reasoning through the loop or just recalling the fold from pretraining/dataset exposure |

Same VLM, same CP set, same query budget across both conditions — this is the direct A/B that
answers "how would it behave and what's the accuracy without these tools."

---

## 6. Metrics

- **% of dataset solved** — fraction of bucket-B-or-better CPs where the loop's final `.fold`
  matches `FINAL RESULT`, computed for both conditions in §5. This is the headline number: "out
  of the dataset, how many did the experiment actually solve."
- **Queries to solve** — number of simulator/tool calls per solved CP (ties to the query
  efficiency claim in `notes/experiment-spec-checklist.md`).
- **Sequence-level metrics** (edit distance to ground-truth sequence, group F) — only computable
  on bucket A, since it's the only bucket with a real intermediate sequence to compare against.

---

## 7. Error analysis

Every simulator rejection already comes labeled with which constraint class it violated
(Flat-Folder's four types, §3.1) — reuse the failure taxonomy in group E of
`notes/experiment-spec-checklist.md` rather than inventing a new one. This is what turns a REJECT
into a diagnosis instead of a dead end.

---

## 8. Output

Numbers from §6 + the error breakdown from §7, for both conditions in §5, get written up as the
Track 1 paper (framing per `notes/track1-surface-simulator.md`).
