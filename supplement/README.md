# FoldOrigami supplementary code and data

This package preserves the repository layout so relative imports continue to work.
It contains the released synthetic corpus, generation and verification code,
folding environment, evaluation harness and prompts, browser viewer, and existing
analysis outputs. The paper-runs variant also includes compact run records. `MANIFEST.json` lists
every packaged source file, its size and SHA-256 hash.

This is a public-release package, not an anonymized review submission. Original
directory names, comments and historical record contents are retained. It does
not contain the paper PDF or LaTeX sources; submit the paper and textual appendix
separately. Historical planning notes are excluded because some describe superseded
protocols.

## Contents

| Path | Purpose |
| --- | --- |
| `workspace/corpus/out/release/` | Full existing release: geometry, reference sequences, metadata, manifests and stored checks |
| `workspace/corpus/` | Generators, fold engines, geometry utilities and corpus checks |
| `DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/` | Environment, renderer, terminal comparator, tool schemas, prompts and observability code |
| `CODEX_HARNESS_TESTING/` | Model and deterministic harnesses, launchers and condition-specific prompts |
| `CODEX_HARNESS_TESTING/runs/` | Paper-runs variant only: configurations, tool schemas, prompts, aggregate results, selected episode results/errors, search records and final sequences |
| `workspace/RESULTS/` | Existing run inventory, ablation selection and CP-distance summaries |
| `workspace/depth_wall*`, `workspace/enum_cost`, `workspace/some_layers` | Existing search and enumeration measurements |
| `workspace/figures/` | Figure-generation scripts; generated figures are omitted |
| `DHEERAJ_WORKSPACE/viewer/` | Dataset, trace and verification interfaces, including vendored JavaScript and its licence |

Both archives exclude environments, installed Python/Node packages, Git history,
credentials files, caches, raw generation batches, external corpora, duplicate
ZIPs, personal notes, paper drafts, full model transcripts, request logs and
per-turn images. Final sequence replay is supported by the included artifacts;
full conversational trace inspection requires the separately retained logs.
Optional `--trace RUN/SAMPLE` selections include decision/tool JSON, not images
or full request/response transcripts. The manifest records these selections.

## Build the package

Python 3.10 or newer is sufficient for the packager; it uses only the standard
library. It does not run experiments or install anything. From the original
repository root, run:

```sh
python3 scripts/package_without_runs.py --dry-run
python3 scripts/package_with_paper_runs.py --dry-run
python3 scripts/package_without_runs.py
python3 scripts/package_with_paper_runs.py
```

The two entry scripts share `scripts/package_supplement.py`. Each builds ZIP and
tar.gz from identical payloads, measures both, verifies the smaller archive,
and discards the larger one. Outputs are `dist/foldorigami-no-runs.zip` or
`.tar.gz`, and `dist/foldorigami-paper-runs.zip` or `.tar.gz`.
Allow temporary disk space for both compressed candidates. The finished archive
must be strictly smaller than **99,000,000 bytes**, leaving room below a decimal
100 MB upload limit. If it exceeds the budget, the build fails without silently
removing any data. Existing output is preserved unless `--force` is supplied,
and even then it is replaced only after archive integrity and payload hashes pass.

The no-runs variant excludes every raw run directory while retaining the saved
analysis tables. The paper-runs variant selects episodes from the earlier and
exploratory completed inventory, exact ablation selections and associated errors,
and every attempt in the paper's saved CP-distance scan. That scan alone covers
1,422 attempts, including BFS: a paper-based selection is therefore still sizable.
Selection uses `workspace/RESULTS/run-inventory/report.json` and
`workspace/RESULTS/cp-distance/attempts.json`, not a scan of all current runs.
`MANIFEST.json` records the reason for each selected episode. Whole run-level
configurations and aggregate results are retained as provenance and can refer
to other samples in the same run; episode files are restricted to the selection.
The two omitted planned ablation cases remain documented in the saved inventory;
no missing episode is fabricated.

To include a specific qualitative episode, use its actual run and sample names:

```sh
python3 scripts/package_with_paper_runs.py --trace RUN_DIRECTORY/SAMPLE_ID --output dist/supplement-with-trace
```

Stop experiment writers before creating a release snapshot. The packager detects
changes to selected files during packaging, but it cannot freeze running jobs or
guarantee that independently saved files belong to one consistent experiment
snapshot. A narrow credential-pattern check is included; it is not an anonymity
audit or a guarantee that arbitrary secrets are absent.

## Offline checks and analysis

After extracting, change into `foldorigami-supplement`. A modern Node.js runtime
is needed for the JavaScript commands below. The corpus checks and analysis
scripts below use built-in modules and do not require npm installation.
These commands are provided for execution by the recipient; the packaging step
does not execute them.

```sh
node workspace/corpus/verify-replay.mjs workspace/corpus/out/release
node workspace/corpus/verify-state.mjs workspace/corpus/out/release
```

The checks above update the extracted corpus check reports. The analysis commands
below require the paper-runs variant:

```sh
node workspace/report_run_inventory.mjs --runs CODEX_HARNESS_TESTING/runs --out reproduced/run-inventory
node workspace/score_cp_distance.mjs --runs CODEX_HARNESS_TESTING/runs --out reproduced/cp-distance
python3 workspace/aggregate_results.py --runs CODEX_HARNESS_TESTING/runs --out reproduced/results
```

These outputs may differ from individual saved tables because the archive contains
the union of several paper cohorts, and run-level aggregates preserve their full
original membership. Compare cohort membership and selected attempts, not just totals.
The inventory script reports completion-based rates; the paper's recent Luna
ablation uses all 360 planned cases, including five unsuccessful protocol cases.
Do not substitute solved/completed for solved/planned. CP-distance summaries pool
attempts and exclude unscorable states explicitly; they are not matched model
comparisons. The original saved outputs are retained unchanged for comparison.

A small offline BFS example is:

```sh
node workspace/search_baseline_stateful.mjs --seconds 1 --max-states 1000 --selection all easy-0001
```

Generation scripts and configurations are included, but reproducing the current
dataset does not require regenerating it: the actual release is packaged.
Replay checks share the generator's folding engine and do not independently
establish physical validity.

## Rendering and new model runs

The Python browser harness imports Playwright and Pillow. To prepare an environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install playwright pillow
.venv/bin/python -m playwright install chromium
```

These are setup instructions, not a historically verified dependency lock.
Use contemporaneous software provenance in saved records where available.
Historical records may lack exact versions; installing current packages does not
reconstruct the original environment. Optional Tinker/Anthropic branches have
additional dependencies and are not needed for offline scoring or Codex runs.

New Codex experiments also require an installed, authenticated Codex CLI and
access to the model identifier requested by the launcher. Availability depends
on the recipient's account. Bash wrappers may require `jq`. Review run settings
before starting inference. For the matched easy-group launchers:

```sh
bash CODEX_HARNESS_TESTING/luna_groups/easy.sh
bash CODEX_HARNESS_TESTING/luna6groups/easy.sh
bash CODEX_HARNESS_TESTING/luna6high/easy.sh
```

Each launcher runs multiple conditions and may consume paid service resources.
Saved configurations record actual settings and take precedence over old script
defaults. Historical absolute corpus/executable paths must be replaced with
local paths when rerunning. Packaging preserves records rather than modifying
their provenance. Exact outputs from hosted models are not guaranteed to repeat.

## Before publication

- Reconcile the saved result snapshot with the final paper and keep failed and
  missing planned cases in the stated denominators.
- Add the agreed project licence and copyright holder. The paper specifies BSD
  3-Clause; the packager includes a root licence when present but does not invent
  ownership information. The vendored viewer licence is retained separately.
- Run the offline commands above and record their results and runtime versions.
- For double-blind review, prepare an anonymized variant: this public package
  retains author-identifying paths and potentially identifying text in records.

The package build verifies archive integrity and file hashes. It does not certify
experimental correctness, dependency completeness for every historical branch,
licensing readiness, or agreement between saved results and the final paper.
