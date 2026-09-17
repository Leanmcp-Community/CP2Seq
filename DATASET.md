# Data inventory for the VLM folding experiment

**Owns: data sources and available annotations.** Admission, action scope, and
scoring live in `EXPERIMENTS_SETUP.md`. Updated 2026-09-17.

## 1. Existing synthetic corpus

`workspace/corpus/` contains generators, all-layers and some-layers engines, named
recipes, replay utilities, and generated artifacts. Retain these for building the
small scored pilot. Inspect each chosen release's manifest and files rather than
combining counts from different historical batches.

Relevant entry points include `workspace/corpus/generate.mjs`,
`workspace/corpus/generate-layers.mjs`, `workspace/corpus/models.mjs`, and
`workspace/corpus/verify-replay.mjs`. Check their supported schemas and shared
implementation dependencies before using their output as ground truth.

A scored sample needs initial state, CP, target, declared move rules, and a
replay-checked reference route. Generation establishes a proposed witness, not
independent physical validation. Reference length is not a certified minimum.
Existing search labels do not determine admission to the new experiment.

## 2. PurelandFold

Source: https://huggingface.co/datasets/mayaweiz/PurelandFold

The repository's audit describes ordered state snapshots connected by sequence and
step identifiers, not explicit action labels. Extract and validate the transitions
before treating a trajectory as a reference action sequence.

Export/tooling: `workspace/data/export_purelandfold_models.py` and
`DHEERAJ_WORKSPACE/pureland/`. The exports serve different layouts and metadata needs;
check frame selection, coordinates, and assignment conventions before merging them.
Record source precision and any preprocessing. Tolerant search or vertex snapping
is not evidence that the unmodified source has a verified action sequence.

Historical solved/exhausted counts are not labels of physical feasibility and do
not establish that human sequences require a particular layer-selection model.

## 3. Flat-Folder CP examples

These provide CPs and terminal-state tooling, not executable step-by-step folding
sequences. See `notes/tools/flat-folder-capabilities.md`. Use as exploratory inputs
until a target and admission evidence are supplied. Archived Probe A/B/C outputs
must not be used as VLM correctness labels or a general foldability ceiling.

## 4. Other sources

- GamiBench: the repository audit finds image-based question-answering data rather
  than reusable fold geometry or action sequences. Use only as related-work/metric
  context; details in `DHEERAJ_WORKSPACE/GAMIBENCH_AUDIT.md`.
- Creasy: historical worked examples and step-graph context, documented in
  `notes/reading/creasy-cp-to-seq.md`; not assumed to match our action schema.
- Learn2Fold: no usable released dataset was obtained in the repository's prior
  audit. It is not an input to the current pilot.

## 5. Before admitting a release

- Freeze source revision, license/attribution, sample IDs, action schema and precision.
- Inspect CP/target pairs and reference actions; independently replay the selected items.
- Record exclusions as data or scope decisions, not conclusions from a failed search.
- Split development and held-out samples; remove answer-revealing names and metadata.
- Record observed feature distributions and reference lengths without calling them
  proven difficulty or optimality measures.

Historical generation reports and probe artifacts remain available for provenance.
They do not automatically become experimental results under the revised protocol.
