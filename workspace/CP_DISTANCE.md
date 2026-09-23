# CP edit distance

Run from repository root:

```sh
node workspace/score_cp_distance.mjs
```

For additional run roots (comma separated):

```sh
node workspace/score_cp_distance.mjs --runs CODEX_HARNESS_TESTING/runs,OTHER_RUN_ROOT --out workspace/RESULTS/cp-distance
```

Outputs: `attempts.jsonl` and `attempts.json` (one record per attempt), `per-attempt/*.json` (individual records), `index.json` (current per-attempt file mapping), `summary.json` (overall and model/tool/effort/stratum means), and `paper-table.tex` (model aggregates included by the paper). The index identifies the current scan; files from larger previous scans may remain. Existing run artifacts are not modified. Repeated runs count as separate attempts.

The metric is insertion/deletion distance on merged mountain/valley crease intervals in original-sheet coordinates. Boundaries are excluded. Matching uses the repository's line quantization (1/4096), merge gap (1e-5), and endpoint tolerance (2e-6). Maximum bipartite matching determines the number of matching intervals. Distance = missing + extra; normalization divides by the number of target merged intervals. Values may exceed 1. Zero-target normalization is null.

This is not Levenshtein distance between action lists, graph edit distance, geometric length error, or a continuous measure of overlap. A partially matching interval counts as one missing and one extra interval. Mountain/valley substitution also costs two. It inherits the comparator's quantization limits.

The script prefers final `seq.json` crease records. If unavailable, it replays the latest saved tool-response sequence snapshot with the current engine and marks that recovery method. Missing or malformed artifacts are unscored, never silently assigned zero. It does not treat folded `final.fold` coordinates as a crease pattern. Discovered aggregate entries lacking artifacts are retained as unscored. Run roots outside the defaults must be supplied explicitly.

Execution and numerical validation are pending. Check known complete, empty, partially completed, and wrong-assignment cases before using aggregate scores in the paper.
