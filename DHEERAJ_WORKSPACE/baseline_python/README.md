# Python CP + target state → folding sequence

This is a new, standard-library-only Python implementation of BFS and DFS.
It imports no JavaScript or probe code. Python 3.10 or newer is required.

The inputs are an unfolded crease pattern encoded as FOLD JSON and **one target
snapshot**. Search starts from the flat sheet. For Pureland, the last `cp.fold`
contains both the material-coordinate CP and target fold angles / layer orders,
so the same file can supply both inputs. Intermediate demonstration frames are
not read by the solver. CP SVG images and ORIPA `.cp` text are not accepted;
provide the corresponding CP `.fold` mesh.

The output is a candidate action sequence, a multi-frame `sequence.fold`, and
individual folded frames. Every successful path is replayed and checked against
the target before it is saved. This is replay with the same transition model,
not independent physical validation. No benchmark results are claimed here:
the Python tests and dataset experiments have **not been executed** by the agent.

## Run

From the repository root:

```bash
python3 -m unittest discover -s DHEERAJ_WORKSPACE/baseline_python -v
```

A real Pureland snapshot is included for a dependency-free smoke run, even
before downloading the dataset (see `fixtures/README.md` for attribution):

```bash
python3 DHEERAJ_WORKSPACE/baseline_python/run.py solve \
  --cp DHEERAJ_WORKSPACE/baseline_python/fixtures/ladybug_step_04.fold \
  --target DHEERAJ_WORKSPACE/baseline_python/fixtures/ladybug_step_04.fold \
  --algorithm both --max-depth 2 \
  --out DHEERAJ_WORKSPACE/data/python-smoke-run1
```

If the extracted data is missing, the existing extractor can prepare it. These
commands are for the user to execute; the search itself needs no dependencies.
Skip installation if `pyarrow` is already available.

```bash
mkdir -p DHEERAJ_WORKSPACE/data/pureland
curl --fail -L 'https://huggingface.co/datasets/mayaweiz/PurelandFold/resolve/main/data/train-00000-of-00001.parquet?download=true' -o DHEERAJ_WORKSPACE/data/pureland/train.parquet
python3 -m pip install pyarrow
python3 DHEERAJ_WORKSPACE/pureland/extract.py
```

Run one target (the audit lists `yacht` as having five keyframes):

```bash
python3 DHEERAJ_WORKSPACE/baseline_python/run.py solve \
  --cp DHEERAJ_WORKSPACE/data/pureland/seq/yacht/step_05.fold \
  --target DHEERAJ_WORKSPACE/data/pureland/seq/yacht/step_05.fold \
  --algorithm both --max-depth 24 --max-queries 100000 \
  --max-states 50000 --seconds 60 \
  --out DHEERAJ_WORKSPACE/data/python-yacht-run1
```

Run all extracted Pureland sequences with identical per-algorithm limits:

```bash
python3 DHEERAJ_WORKSPACE/baseline_python/run.py benchmark \
  --algorithm both --max-depth 24 --max-queries 400000 \
  --max-states 100000 --seconds 120 \
  --out DHEERAJ_WORKSPACE/data/python-pureland-run1
```

Use `--sequence yacht cup` to select models. `--data` accepts a different
directory with the existing `seq/<name>/step_NN.fold` layout. Each run needs a
new output directory; existing results are never overwritten. A 27-model run
at 120 seconds per algorithm can take roughly 108 minutes, plus loading/export.

Replay a **solved** result, without searching:

```bash
python3 DHEERAJ_WORKSPACE/baseline_python/run.py replay \
  --result DHEERAJ_WORKSPACE/data/python-yacht-run1/bfs/result.json
```

For your own files, supply `--cp path/to/cp.fold --target path/to/target.fold`.
The two must share vertex, edge, and face IDs and the same tessellation. A target
may omit topology arrays if its IDs already refer to the CP. Multi-frame inputs
must first be resolved to a single frame. Standard FOLD files should use
`--convention fold`; the default is the Pureland exporter convention.

## What a search state and move mean

The final CP divides the sheet into rigid polygonal faces. Initially every face
is in its original position, all hinges are flat, and no crease has been made.
A state records each face's planar rigid transform, a bottom-to-top layer stack,
and the set of edges that have actually been creased. Using the final subdivision
does not mean all these edges have already been folded.

For each current image of a CP hinge line, the simulator cuts the face adjacency
graph along all hinges on that line. It enumerates nonempty unions of components
lying on one side of the line, with both over and under directions. Moving
components must be exposed wherever they overlap stationary faces. The move
reflects them across the hinge, reverses their internal stacking, and places
them above or below the stationary paper. It rejects folds that detach shared
vertices beyond the distance tolerance. A fold may move one flap, multiple
flaps, or all layers on one side. Unfolds and subsequent reverse folds are
allowed; crease history persists when an edge becomes flat again.

The goal requires all CP hinge edges to have been creased, the target M/V/flat
assignments to match, reconstructed target geometry to match (when assignments
are resolved), and every supplied layer constraint to hold. `U` without a fold
angle is a wildcard; a target containing those does not fully determine geometry.
`F` means a crease that ends flat and must have been made and unfolded; `J`
means an artificial subdivision that must not be folded. Boundary edges are `B`.

BFS uses a queue and finds the fewest moves in the implemented unit-cost graph.
DFS uses a stack of lazy child iterators and finds the first solution in its
fixed move order. It reopens states reached at a shallower depth so depth limits
do not make its visited set unsound. Both use identical move generation, goal
tests, and numerical deduplication. Both retain a visited table; DFS's **total
memory is not O(depth)** even though its live traversal stack is.

## Target conventions

Pureland `cp.fold` stores unfolded material coordinates, not folded positions.
The loader reconstructs folded geometry from the 0/±180-degree angles and checks
closure around the face graph. An explicitly tagged standard `foldedForm` also
has its supplied 2D positions checked against that reconstruction. Whole-model
pose is factored out by fixing face 0; camera flips and translations are not
reported as fold actions.

The dataset's `cp.fold` face-order pairs are antisymmetric world above/below
relations, and its material front is +Z despite clockwise face winding. This
was inspected in the public `ladybug`, step 4 sample. The default `pureland`
mode handles this convention. The optional `flat_folder` compile output is not
an input, and its ordering data should not be substituted for `cp.fold` orders.

Standard FOLD has a different convention: `[f,g,s]` uses the folded normal of
face `g`, derived from vertex winding. `--convention fold` implements this.
Exported frames always use standard FOLD conventions, including conversion of
M/V signs for clockwise Pureland material faces. Source specifications:
[FOLD specification](https://github.com/edemaine/fold/blob/main/doc/spec.md),
[PurelandFold dataset](https://huggingface.co/datasets/mayaweiz/PurelandFold).

## Results and limits

Each `result.json` records input SHA-256 hashes, algorithm, limits, tolerance,
convention, elapsed time, attempted moves (`queries`), accepted transitions,
unique visited states, peak frontier, depth reached, actions, and replay status.
Actions contain a current-frame hinge line `nx*x + ny*y = d`, moving face IDs,
hinge edge IDs, and an over/under direction. Each saved frame is canonicalized
to face 0, so replay action coordinates belong to the preceding saved frame.

`benchmark.json` aggregates outcomes and includes reference keyframe counts.
The runner reads **only the terminal file's contents** for each model. Other
filenames are used to identify that terminal file and count reference steps.
Human keyframes can include duplicates, pose changes, or multiple actions; their
count is not an optimal fold count. The dataset does not contain action labels,
so exact action accuracy or edit-distance metrics are not asserted.

| Status | Meaning |
| --- | --- |
| `SOLVED` | Goal reached and replay passed in this model |
| `EXHAUSTED_MODEL` | Search closed under this numerical transition model |
| `DEPTH_LIMIT` | At least one branch reached the configured depth cap |
| `QUERY_LIMIT` | Attempted-move budget reached |
| `STATE_LIMIT` | Unique-state cap reached (or allocation failed) |
| `TIME_LIMIT` | Time limit reached at a search checkpoint |
| `UNSUPPORTED_INPUT` | Benchmark frame failed input/model validation |

`solve` exits 0 if every requested algorithm solves, 2 for a search that does not
solve, and 1 for an input/IO error. `benchmark` exits 0 when its report is written,
including when it contains unsolved/unsupported cases; inspect the report.

This is a baseline with explicit restrictions, not a complete Pureland solver:

- Only flat 180-degree simple folds about existing final-CP edges are searched.
  No bending through face interiors, partial-angle poses, cuts, or simultaneous
  multi-axis vertex folds are supported.
- A single global layer stack cannot represent cyclic local layer order.
  Exposed flaps land wholly above/below the stationary stack; insertion into
  internal pockets and general tuck/sink moves are outside this model.
- Same-side exposed rotation is a geometric collision restriction, not a
  general continuous collision/contact simulator. Zero thickness, hinge
  contacts, and rounded input coordinates remain modeling approximations.
- Line clustering and state quantization are approximate. Default distance
  tolerance is 0.004 for unit-sized Pureland sheets; test sensitivity with
  `--tolerance 0.002` and `--tolerance 0.006`. Tolerance is not scale invariant.
  Exhaustion is **not proof that the origami is physically impossible**.
- Component-subset enumeration and BFS memory can grow exponentially. A time
  budget is checked between generated candidates; one geometry operation can
  overrun the deadline. Model loading and exporting are outside search time.

Tests cover search ordering, shallower DFS revisits, cycles, resource verdicts,
known one-fold targets, crease history, fold/unfold precreasing, blocked layer
motion, target topology, angle rejection, layer conventions, and concave faces.
