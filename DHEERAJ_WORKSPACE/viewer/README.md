# Local origami run browser

## Sequence playback and verification workspace

`/traces` now defaults to **Sequence playback**. Choose a run and example, then
Play to follow Initial sheet → Thinking → Tool call → Result for every turn.
The current paper stays on the left and the target on the right. Rejections
preserve the displayed paper; remove/restore operations show the changed branch.
Back/Next, Restart, the event slider, and pace controls let you inspect each event.
Space toggles play/pause; arrow keys step events. Playback pauses when the tab is
hidden. These are recorded decision phases, not token streaming or physical
fold-motion animations. The target remains fixed throughout.

Below the images, enable Thinking, Conversation, or Diagnostics independently;
the default shows tools only. Full trace preserves the original detailed view.
Choose Top, Oblique, Reverse, X-ray, or Exploded. Saved PNGs are preferred; missing
views are drawn from saved geometry and labelled as such. No model rerun is
needed. Only reasoning text actually saved by the model backend is available.

`/verification` is a separate workspace, linked from every page. It contains
nine fixtures covering three-of-four-leaf tearing, single-leaf tearing, a legal
connected pair, impossible direction, off-target creases, different sequences
with equivalent terminal states, rotation/translation/turnover, wrong stack
order, and a legal arbitrary-angle crease. Play or scrub the candidate sequence;
compare it with the target and inspect original-sheet connections. Check all
cases compares actual results with explicit expectations, including expected
rejections. Outcomes are not precomputed or presented as passing before a check.

The workspace imports the actual experiment `ToolSession`, `FoldSession`, and
`evaluateSession`/`terminalMatch` modules via the source-asset route. It introduces
no alternative verifier or scorer. Original-sheet diagrams highlight selected
whole faces, not only the moving half-plane. The same engine limitations apply.
The server remains read-only, and fixtures do not modify saved experiment runs.

Restart the server for the new route, then hard-refresh:

```sh
bash run_server.sh --port 8001 --traces CODEX_HARNESS_TESTING/runs
```

Open http://127.0.0.1:8001/traces or http://127.0.0.1:8001/verification.

To rescore saved accepted sequences, preview first and then apply:

```sh
node workspace/rescore_runs.mjs --dry-run
node workspace/rescore_runs.mjs
```

Rescoring now replays `seq.json` against `cp.fold` with the live verifier, then
uses the shared experiment evaluation against `target.fold`. A tearing/legality
failure records its step and error and prevents a solved verdict. It recomputes
CP matching instead of trusting the old flag. Rejected historical proposals are
not part of the saved accepted sequence. The non-dry run updates result files
and `workspace/RESCORE_REPORT.md`; it does not resample a model or alter images.

Verification commands (not run by the assistant):

```sh
node --test DHEERAJ_WORKSPACE/viewer/test_trace_playback.mjs DHEERAJ_WORKSPACE/viewer/test_verification_cases.mjs
.venv/bin/python -m unittest discover -s DHEERAJ_WORKSPACE/viewer -p 'test_trace_store.py'
```

Two pages on one backend: **`/`** plays back saved searches, **`/corpus`** browses
the generated dataset. Neither writes anything.

The Python backend lists saved runs directly from `DHEERAJ_WORKSPACE/exports`.
The browser automatically loads the newest run and offers BFS/DFS selections.
No upload, installation, external CDN, robotics, freeform, or physics service.

## Start

Stop the old `python3 -m http.server` process with Ctrl+C. From FoldOrigami:

```bash
./run_server.sh
```

Open **http://127.0.0.1:8000/**. This replaces the old long viewer URL.
Use **Exported run** to switch algorithms and **Refresh runs** after a new search.
Choose **Solution path** or **Search exploration**, then Play. Drag to orbit,
scroll to zoom, right-drag to pan. Reset camera fits the original paper.

To browse another output directory or use another port:

```bash
./run_server.sh --port 8001 --exports DHEERAJ_WORKSPACE/data
```

The server only reads exports and serves viewer assets. It does not launch
searches. Existing exports are sufficient; do not rerun merely to use this UI.

## Dataset browser (`/corpus`)

The same backend also serves the generated Pureland corpus at
**http://127.0.0.1:8000/corpus**, on its own page. The search playback at `/` is
untouched; the two are linked from the header.

Default dataset folder: `workspace/corpus/out/release` (600 samples across
`all-layers`, `some-layers`). Point it elsewhere with `--corpus <folder>`:

```bash
./run_server.sh --corpus workspace/corpus/out/release/all-layers
```

Each sample folder holds four files, all read-only:

| file | what the page does with it |
| --- | --- |
| `meta.json` | stratum, seed, `cp_hash`, difficulty metrics, degeneracy flags |
| `cp.fold` | the crease pattern drawn in the left panel (M/V/B) |
| `seq.json` | the fold sequence: angle index, offset, side, over/under, creases |
| `steps.fold` | the shipped folded frames, used only to check the replay |

`GET /api/corpus` lists samples from `index.json` at the dataset root, falling
back to a folder walk for `meta.json` + `seq.json`. `GET /api/corpus/sample?dir=…`
returns the four files of one sample. Both are confined to the corpus root the
same way run loading is, capped at 24 MiB per sample and 5,000 listed samples.

### How the folding is produced

The page does **not** read poses out of `steps.fold` — those are only the
discrete resting states, so nothing moves between them. `fold-replay.mjs`
replays `seq.json` using the generator's own algebra (`workspace/corpus/fold-engine.mjs`,
`geom.mjs`): a fold is one of four exact lines (angle index + offset), the moving
half of every layer is clipped off, reflected by an exact `{0,±1}` matrix, its
internal order reversed, and dropped on top when `over` and underneath when not.
Between two states the moving layers swing around the fold line through a half
turn — at `t = 1` the rotation *is* the reflection, so playback lands exactly on
the stored state rather than near it. Faces are coloured by parity, so you can
see which side of the paper is up. Layers adds a small visual gap; it is not
paper thickness.

Left panel: the whole crease pattern sits faint, creases light up in
mountain/valley as the sequence makes them, and the fold being made is green.
Those crease segments come from `seq.json` in flat-sheet coordinates, which is
why a 135° fold can show up as a 45° crease — earlier reflections carried it there.

The sidebar reports whether the replay matched `steps.fold` (state count, layer
count at every step, final silhouette within 1e-6) and what the corpus's own
`replay` verdict was. A mismatch is shown in red rather than hidden.

## Export another search

```bash
python3 DHEERAJ_WORKSPACE/baseline_python/run.py solve \
  --cp DHEERAJ_WORKSPACE/baseline_python/fixtures/ladybug_step_04.fold \
  --target DHEERAJ_WORKSPACE/baseline_python/fixtures/ladybug_step_04.fold \
  --algorithm both --max-depth 2 --max-states 20000 --seconds 30 \
  --trace-events 20000 \
  --out "DHEERAJ_WORKSPACE/exports/ladybug/$(date +%Y%m%d-%H%M%S)"
```

Recording caps are constants in `baseline_python/search_trace.py`: 2,000 states,
20,000 events plus the final stop event, and 16 MiB. The first cap stops recording,
not the search. Search has separate state/query/depth/time budgets; time checks
are between candidates. Solutions live in `sequence.fold` and `result.json`,
not duplicated in the trace. The UI reports omitted exploration history.

Backend caps in `server.py`: 500 listed runs, 10,000 scanned entries, eight
levels of directories, 1 MiB result metadata, and 24 MiB total input per loaded
run. Missing or malformed runs report errors. Paths and symlinks must resolve
inside the configured exports directory. The server binds to localhost only.

## Interpretation

Accepted folds animate rigid hinge rotation with face 0 fixed, matching the
baseline's canonical coordinates. If face 0 belongs to the moving group, its
complement rotates through the inverse motion. Layers adds a small visual gap;
it is not paper thickness. Green identifies selected faces. Final states come
from the solver; intermediate animation is not independent collision validation.
Rejected and duplicate candidates show parent geometry. BFS queue switches and
DFS backtracking are navigation jumps, not folds. Old results without traces
only provide solution playback and final statistics.

The hinge approach follows the sibling main studio's `src/motion.js`. Only
Three.js and OrbitControls are vendored, with their MIT license in vendor/LICENSE.

## Verification (run yourself)

```bash
python3 -m unittest discover -s DHEERAJ_WORKSPACE/viewer -p 'test_*.py' -v
python3 -m unittest discover -s DHEERAJ_WORKSPACE/baseline_python -v
node workspace/check-viewer-replay.mjs
```

The node check replays every `seq.json` in the dataset with the exact module the
browser page imports and compares it against the shipped `steps.fold`: state
count, per-step layer count, and the final polygons. It exits non-zero on any
disagreement and writes nothing.

After starting the backend, verify automatic loading, switch BFS/DFS, play and
scrub both playback modes, toggle layers, and reset the camera. Refresh should
retain the selected run. A missing exports directory should show an explicit
empty state. A capped trace should show omitted events and the final verdict.
Runtime tests and browser checks have not been run by the agent because the
user executes Python and Node commands.

## Automatic experiment library

The default library now combines `DHEERAJ_WORKSPACE/experiments` and the older
`DHEERAJ_WORKSPACE/exports`. The run list updates every ten seconds while the
page is visible without restarting current playback. Restart the backend once
after updating its code. `--exports <folder>` overrides these default roots.

Search commands no longer need `--out` or `--trace-events`: each solved run
always saves its full sequence under a unique experiment directory. Optional
traces only control whether you can inspect explored branches. The server lists
a run after its artifacts have been written. Select Solution path to watch the
complete saved sequence, including when exploration recording was capped.
# PNG capture and X-ray

For model conversations, open **http://127.0.0.1:8000/traces** after starting
`server.py`. Select a run, example and turn to inspect inputs/images, Qwen-emitted
thinking, outputs, tool results, timing and exact token records. The page polls
active runs every five seconds. The default trace root is
`DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/runs`; override it with `--traces <folder>`.

Both playback pages have **Capture PNG views** and **X-ray** buttons. Pause at a
completed step, capture, and click a preview to download its PNG. Capture includes
top and two oblique views; X-ray is a top projection where overlapping layers
darken the image. The dataset page also includes the CP. If the slider is between
steps, capture uses the preceding completed step.

`window.captureFoldStep(step)` returns PNG data URLs for a completed step without
moving playback. `capture.js` is shared with the Python/Tinker experiment bridge.
See [the folding pilot guide](../EXPERIMENT_SETUP/TINKER_FOLD_USAGE.md) for local
capture commands, image size options, generated-sequence playback, and inference.

## Complete model conversations

The `/traces` page browses runs, examples, turns, and the full saved
conversation for each turn. Each part of a turn is its own card; expand the
sections you care about, and Refresh pulls newer content without collapsing
what you opened. Both Tinker flat turn artifacts and
Codex turn directories are supported. Codex turns include exact prompts, all
attached image thumbnails and labels, exposed reasoning summaries, responses,
tool actions/results, feedback images, CLI commands, usage events, and stderr.
Text is not truncated. Private reasoning absent from the saved logs cannot be
shown. Initial/final galleries and raw sample artifacts are also available.

To show Codex runs, restart the viewer with:

```sh
bash run_server.sh --port 8001 --traces CODEX_HARNESS_TESTING/runs
```

Open http://127.0.0.1:8001/traces and hard-refresh after a viewer update.
No model experiment needs to be rerun to inspect its saved conversation.

The assistant has not executed Python/Node tests or started the server. To run
the trace discovery and artifact API checks yourself:

```sh
.venv/bin/python -m unittest discover -s DHEERAJ_WORKSPACE/viewer -p 'test_trace_store.py'
```

### Layout and navigation

The trace page drills down through three lists into the conversation. The left
sidebar stacks Runs over Examples, each with its own filter box and count; a
narrow Turns rail sits beside it; the conversation fills the rest. Nothing is a
dropdown: click a run to populate Examples, click an example to populate Turns,
click a turn to open it. One toggle button at the far left of the top bar opens
and closes the Runs/Examples sidebar, the standard way, same button both ways,
with `[` as its keyboard shortcut. There are no per-panel close buttons and no
draggable dividers.

Each example row carries an outcome badge (Solved / Unsolved / Error / Running)
and its turn count. Prev/Next and the left/right arrow keys step turns; Collapse
all and Expand all fold the saved input, reasoning, tool results, and CLI
diagnostics of the open turn. The top bar keeps the run count, a Live toggle for
the 5 second refresh, and Refresh.

The page loads `style.css` and `corpus.css` first, so its palette, header, nav,
buttons, and list rows are the same as the playback and dataset pages. On narrow
screens the sidebar overlays the page and closes itself once you pick an example.

This browser stores the selected run, the example and turn for each run, sidebar
visibility, scroll positions of all three lists, and expanded conversation details in localStorage.
Collapsing the sidebar does not clear selections. Reloading or reopening the page
restores that location. Saved state is specific to the browser and URL origin,
including port. Refresh updates saved logs while retaining your selected turn.

Restart the server and hard-refresh to load these viewer changes. Python and
Node checks have not been executed by the assistant under the workspace rule.
