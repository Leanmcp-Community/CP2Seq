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
