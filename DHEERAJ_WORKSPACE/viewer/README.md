# Local origami run browser

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
```

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
