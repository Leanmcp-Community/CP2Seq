# FoldOrigami supplementary code and data

This package preserves the repository layout so relative imports continue to work.
It contains the released synthetic corpus, generation and verification code,
folding environment, evaluation harness and prompts, browser viewer, and existing
analysis outputs. The paper-runs variant also includes compact run records. `MANIFEST.json` lists
every packaged source file, its size and SHA-256 hash.

The packager replaces personal workspace names with `AUTHOR_WORKSPACE` in archive
paths and all text, including imports, browser URLs, scripts and saved records.
It also replaces the author's name and username, converts current repository
absolute paths to relative paths, and replaces other home directories with
`/home/author`. Manifest hashes describe the transformed files. Original source
files stay unchanged. These targeted replacements are not a comprehensive
review of affiliations or identifying information in arbitrary prose. The archive does
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

The two entry scripts share `scripts/package_supplement.py`. Both output ZIP
for submission-system compatibility. Outputs are `dist/foldorigami-no-runs.zip`
and `dist/foldorigami-paper-runs.zip`. The finished archive
must be strictly smaller than **99,000,000 bytes**, leaving room below a decimal
100 MB upload limit. If it exceeds the budget, the build fails without silently
removing any data. Both scripts replace existing output by default;
use `--no-force` to refuse replacement. Replacement happens only after archive integrity
and payload hashes pass.

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

### Recommended setup and verification

From the extracted package root (the folder containing `pyproject.toml`), run:

```sh
uv sync
uv run --locked python -m playwright install chromium
bash scripts/verify_supplement.sh
```

On Linux, Chromium may additionally require system libraries; use
`uv run --locked python -m playwright install --with-deps chromium` there.
Node.js must also be installed and available as `node`. No npm dependencies are
needed for these checks. Setup downloads dependencies; the verification script
makes no model-service requests.

`pyproject.toml` pins the browser harness dependencies observed in the original
local environment on 25 September 2026. `.python-version` requests Python 3.12.4.
These pins do not establish the environment of every historical experiment.
Before publishing, run `uv lock` in the original repository and rebuild the
archive so recipients receive the resolved `uv.lock`. The packager includes it
when present. No lockfile or successful environment resolution is claimed until
that command has been run.

The verification script checks original manifest hashes, selected simulator and
browser regression tests, every released reference sequence and terminal state,
mutated-state rejection, and a small BFS execution. A timed BFS smoke run need
not solve the sample to complete. Corpus checks run on a copy so the original
manifest stays valid. With runs included, the script also regenerates saved-run
summaries. Output and runtime versions go to `reproduced/check-*/`.
Inspect failures and analysis warnings; the script does not compare every paper
table automatically. A successful script is software/data validation, not proof
that all reported numbers have been reproduced.

To inspect the dataset interactively:

```sh
uv run --locked python DHEERAJ_WORKSPACE/viewer/server.py --port 8000
```

Open `http://127.0.0.1:8000/corpus`. Stop the server with Ctrl-C.

### Individual commands

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

The Python browser harness imports Playwright and Pillow. Use the pinned environment:

```sh
uv sync
uv run --locked python -m playwright install chromium
```

Use contemporaneous software provenance in saved records where available.
Historical records may lack exact versions; the supplied pins describe the
inspected local environment. Optional Tinker/Anthropic branches have
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
- For double-blind review, inspect the transformed package for any identifying
  prose or links beyond the names and paths covered by the replacements.

The package build verifies archive integrity and file hashes. It does not certify
experimental correctness, dependency completeness for every historical branch,
licensing readiness, or agreement between saved results and the final paper.
