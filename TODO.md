# TODO — dataset generator: collapse each sample to a single self-contained `.fold`

2026-09-17. Owns: what has to change in `workspace/corpus/` generation and output.
Where the data comes from is `DATASET.md`; how the experiment runs is `EXPERIMENTS_SETUP.md`.

---

## 0. What is NOT changing

The generation procedure stays exactly as it is. To be explicit, because the change below
touches the same functions:

- **Random forward sequence generation stays.** Start from the square, apply random simple
  folds forward. This is the right structure — generation is trivial, the inverse problem
  (CP → Seq) is the hard one.
- **Complete the sequence first, then recover the CP by unfolding.** Unchanged.
- **Ground truth stays bucket A by construction.** The (CP, sequence) pair is built, not
  labelled.
- Strata, seeds, quotas, isomorphic-duplicate rejection, byte-identical rebuild from seed —
  all unchanged.

The change is **only in how the result is written to disk.**

## 1. The problem

Every sample is currently spread across four files in its own directory:

```
samples/<id>/
    cp.fold         the crease pattern, planarised
    seq.json        every fold: line, direction, creases made, coupling
    steps.fold      CP + folded state after each step (multi-frame FOLD)
    meta.json       difficulty metrics, degeneracy flags, provenance
```

Written at `workspace/corpus/generate.mjs:226-236` and `generate-layers.mjs:237-257`.

This is four files carrying one logical object, and `cp.fold` is fully redundant — it is
already frame 0 of `steps.fold`. A consumer has to open a directory, know four names, and
keep them in sync. Samples cannot be passed around, diffed, or handed to a model as one unit.

## 2. The target

**One sample = one `.fold` file.** Nothing else on disk per sample.

```
samples/<id>.fold
```

The FOLD format already supports this and we are already doing most of it. The sequence goes
*inside* the file:

- **The CP is the key frame** (top-level `vertices_coords` / `edges_vertices` /
  `edges_assignment`) — this is what `sequenceFile()` already does.
- **Each fold step is a frame** in `file_frames`, with `frame_parent: 0`,
  `frame_inherit: false`, `frame_title: "step k"`.
- **The per-fold records from `seq.json`** (line, direction, creases made, coupling) move into
  each frame as a custom field.
- **The metrics and provenance from `meta.json`** move to the file level as custom fields.

FOLD permits custom fields as long as they are namespaced with a colon prefix, so these must
be spelled e.g. `fo:fold` on a frame and `fo:meta` / `fo:seed` / `fo:stratum` at file level.
Pick the prefix once and use it everywhere.

Procedure per sample, unchanged in substance: generate the random sequence, fold forward
recording each state, unfold to get the CP, then **assemble the single `.fold`** — CP as key
frame, every intermediate state as a frame, sequence and metadata as custom fields.

## 3. Work items

### 3.1 Generation
- [ ] Extend `sequenceFile()` (`workspace/corpus/planarize.mjs:234`) to take the fold records
      and the meta object, and emit them as namespaced custom fields. It already builds the
      CP-as-key-frame + `file_frames` structure, so this is an extension, not a rewrite.
- [ ] `generate.mjs`: replace the four `writeFileSync` calls (lines 226-236) with one write to
      `samples/<id>.fold`. Drop the per-sample `mkdirSync` (line 225).
- [ ] `generate-layers.mjs`: same at lines 237-257.
- [ ] Remove the `--export-steps` flag, or make it always-on. Step frames are no longer
      optional — they are the point of the file. If a CP-only variant is ever needed it should
      be a separate export, not a generation mode.
- [ ] Update the output-layout comment block at the top of `generate.mjs` (lines 28-32).

### 3.2 Consumers to update
These all read the old four-file layout and will break:

- [ ] `workspace/corpus/verify-exact.mjs` (488 lines — the strict verifier, most important)
- [ ] `workspace/corpus/verify-replay.mjs`
- [ ] `workspace/corpus/build-index.mjs`
- [ ] `workspace/corpus/build-showcase.mjs`
- [ ] `workspace/corpus/snapshot-failures.mjs`
- [ ] `workspace/corpus/merge-release.mjs` (globs sample dirs)
- [ ] `workspace/corpus/browser.html`
- [ ] `workspace/corpus/models.mjs`
- [ ] `workspace/tools/flatfolder-check.mjs`
- [ ] `workspace/tools/fold-loop.mjs`
- [ ] `DHEERAJ_WORKSPACE/visualizer/serve.mjs` and `viewer.js`
- [ ] `DHEERAJ_WORKSPACE/baseline_python/model.py`

### 3.3 Docs
- [ ] `DATASET.md` — the layout section and any per-file references.
- [ ] `EXPERIMENTS_SETUP.md`
- [ ] `notes/plan/corpus-plan.md`
- [ ] `DHEERAJ_WORKSPACE/visualizer/README.md`, `baseline_python/README.md`,
      `baseline_python/fixtures/README.md`

### 3.4 Verify
- [ ] `run-regenerate.sh` end-to-end still passes `verify-exact.mjs` with the same verdicts as
      before the change. Same seeds in, same verdicts out — the file layout changed, the data
      did not. Any verdict that moves is a bug in the migration.
- [ ] Confirm the single file still opens in standard FOLD viewers. Custom namespaced fields
      should be ignored by readers that do not know them; if a viewer chokes, the namespacing
      is wrong.

## 4. Open question

The spoken note said the final `.fold` is generated "using the AR" — that did not come through
clearly and I have not guessed at it. If it names a specific library, script, or representation
for the assembly step, say which and this section becomes a work item; otherwise the assembly
is just `sequenceFile()` extended as in 3.1.

---

# TODO — legal-fold enumeration (`list_legal_folds`)

2026-09-19, branch `dheeraj/legal-fold-enumeration`. Owns: the follow-up work on the
enumerator added in `DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs`. What was built and
why is in `EXPERIMENT_SETUP/VERIFICATION.md`; the model-facing contract is in
`CODEX_HARNESS_TESTING/codex_fold_prompt_legal_folds.md`.

## What landed

`engine.mjs` now exposes `tryFold(paper, cp, action)`, the whole fold verifier as a pure
function. `FoldSession.apply` is `tryFold` plus a commit, and `enumerateLegalFolds` is
`tryFold` run over candidates generated from the CP's own crease lines. One verifier, so a
listed fold cannot be one that `add_fold` then rejects. The Codex loop gates the tool behind
`--tools legal-folds`; `--tools base` is the untouched original condition.

## 1. Soundness test — not yet written

This is the test that decides whether anything above is true, and it does not exist yet.

- [ ] For `easy-0001` through `easy-0008`, walk the reference sequence. At every prefix
      state, call `enumerateLegalFolds`, then apply **every** listed action to a freshly
      replayed session and assert each one is accepted. A listed fold that `add_fold`
      rejects means the enumerator and the verifier have drifted apart, which is the one
      failure mode the shared-`tryFold` design exists to prevent.
- [ ] At the same prefixes, assert the reference's own next action appears in the list, up
      to the effect-deduplication (compare resulting folded states, not argument spellings:
      the enumerator may legitimately return an equivalent action with different arguments).
      If the reference fold is missing, candidate generation has a gap and every downstream
      claim about the list being complete is false.
- [ ] Assert `list_legal_folds` leaves `revision`, `state_id`, and the accepted sequence
      unchanged.
- [ ] Place it next to `test_partial_folds.mjs` as `test_legal_folds.mjs`, same node:test
      style, and add it to whatever runs the `.mjs` tests.

## 2. Benchmark comparability — explain to Lu Xian before any shared numbers

**Talk to Lu Xian about this before putting `--tools legal-folds` results next to existing
results.** The enumerator changes what the benchmark measures, and the change is easy to miss
from a results table.

Baseline condition: the model must *derive* a legal fold from CP geometry and images. It has
to relate a current-coordinate fold line back through earlier reflections to the original
sheet, and get the M/V consequence right. That derivation is most of the task, and
`OUTSIDE_TARGET_CP` at 86 percent of tool calls is mostly that derivation failing.

Enumerator condition: the model *selects* from a menu that is already known to be legal and
on-target. It isolates search and planning — which of the legal folds leads to the target's
layer order — from the geometric reasoning. That is a legitimate and interesting ablation.
It is not the same task, and its numbers are not comparable to the baseline's.

- [ ] Explain the above to Lu Xian, including that `--tools base` is byte-identical in
      prompt and action schema to every run recorded before this branch, so old runs stay
      valid as the baseline arm.
- [ ] Decide how the two arms are reported: `result.json` now carries `tools`, so they are
      separable, but the write-up has to name the distinction explicitly rather than leave
      it to a column.
- [ ] Decide whether the Tinker loop gets the same flag. Right now `tinker_fold_loop.py` and
      `check_tinker_protocol.py` are pinned to `tools_for("base")` so the Tinker condition is
      unchanged by this branch.

### 2a. The turn budget is a confound in its own right

Observed on `easy-0001` with `--tools legal-folds`: the model spends one turn on
`list_legal_folds` and one on `add_fold`, so a four-fold sample needs eight turns before it
can call `finish`. The baseline arm does not pay that. At equal `--max-turns` the enumerator
arm is handicapped; at unequal `--max-turns` the arms differ in two things at once.

Settled 2026-09-19: `MAX_TURNS` is 80 for both arms, set once in
`CODEX_HARNESS_TESTING/_common.sh`. A budget generous enough for both keeps the comparison
about the tool rather than about the budget. Changing it for one arm only reintroduces the
confound, so change it for both or neither.

- [ ] State the shared budget next to any published numbers, so a reader does not have to
      infer that the arms were not budget-matched by accident.
- [ ] Consider measuring turns-to-first-crease and tool calls per accepted fold alongside
      `solved`, so the two arms can be compared on something the budget does not distort.

## 2b. What else is failing — measured 2026-09-19 over 103 saved episodes

Counted across every `CODEX_HARNESS_TESTING/runs/*/results.json`. 8 of 103 episodes solved.

| termination | episodes |
| --- | --- |
| `turn_budget` | 51 |
| `finished` | 26 (only 8 solved) |
| `repetition_detected` | 17 |
| `error` (Codex CLI exit 1) | 9 |

**Thrash is the dominant cost.** 813 of 2812 turns, 29 percent, are spent AFTER an episode's last
accepted fold. 30 episodes waste more than ten such turns; the worst wasted 39 of 39 and never
landed a single fold. That is what `legal_folds_now` and the dead-end stop target, and easy-0003
went from 80 turns unsolved to 20 turns solved once it landed.

**A second failure the enumerator cannot see.** Of the 26 episodes that called `finish`, ten had
`cp_match: true` with `terminal_reference_match: false`: every crease correct, every M/V correct,
wrong layer stack. `list_legal_folds` filters on CP compatibility alone, so a fold can be legal
and on-target and still put the model in a stack from which the target is unreachable. Nothing in
the loop tells it so, and `finish` reports the mismatch only after the episode is over.

- [ ] Decide whether the loop should expose a stack comparison against the target before
      `finish`. The target is already in the prompt, so computing the comparison adds no
      information the model was not given, the same argument that justifies the enumerator. It
      is still a change to the task and needs the Lu Xian conversation in section 2.
- [ ] Consider ranking `legal_folds` by whether the resulting stack keeps the target reachable
      rather than only by new crease length. This is the expensive version and may be its own
      search problem.
- [ ] Report turns-after-last-accepted-fold alongside `solved`. It separates "could not find the
      fold" from "found folds but stopped making progress", which `solved` alone hides.
- [ ] Look at the 9 `error` episodes: all are `Codex exited 1`, none retried by the transient
      classifier, so the cause is not rate limiting.

## 3. hard-0001 budget — deferred, Dheeraj to check

Not done, deliberately. `hard-0001` has 5468 CP edges and 5340 M/V edges. Line deduplication
should collapse those to a manageable number of distinct lines, but that is an expectation,
not a measurement.

- [ ] Measure `enumerateLegalFolds` wall time on `hard-0001` at several prefix depths,
      where the state carries hundreds of faces and `foldLayers`' tearing check is O(faces²),
      all inside one Playwright `page.evaluate` round trip.
- [ ] If it is slow, add a wall-clock budget that returns partial results with
      `truncated: true` rather than hanging the turn. The result shape already carries
      `truncated`, so only the enumerator loop needs to change.
- [ ] Until then, do not enable `--tools legal-folds` on `hard-*` samples in an unattended
      batch.
