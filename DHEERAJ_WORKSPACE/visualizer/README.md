# Dataset viewer

From the repository root, run:

```sh
node DHEERAJ_WORKSPACE/visualizer/serve.mjs
```

Open **http://127.0.0.1:8080**. No install or build is required. Stop with Ctrl-C.
If the port is busy, use `PORT=8081 node DHEERAJ_WORKSPACE/visualizer/serve.mjs`.

The read-only server discovers datasets on page reload and loads geometry only when a sample
is selected. It does not generate, delete, verify, or alter any dataset or experiment files.

- **Generated sets:** every directory under `workspace/corpus/out` containing `cp.fold`
  and `steps.fold`, including release sets, named models, and scratch batches. Display the CP,
  recorded ground-truth frames, final frame, and the corresponding `seq.json` action.
- **Failure snapshots:** listed as their own sets under `workspace/corpus/failures-snapshot`.
  Inclusion does not mean the sample passed validation.
- **Pureland:** steps discovered from `DHEERAJ_WORKSPACE/data/pureland/seq`, instruction JPGs,
  and compiled geometry from `pureland/viz`. CP changes with the selected step. A missing or
  unsuccessful compilation displays no folded geometry; it is never replaced by the CP.
- **Saved runs:** result directories under `data`, `experiments`, and `exports`. These are
  explicitly labeled solver outputs. Runs without `sequence.fold` show their result metadata
  without inventing a sequence. Reference and solver sets remain separately selectable.

Use Play, the slider, arrow buttons, or thumbnails to browse discrete stored frames. X-ray
reveals overlapping faces. All panels are 2D projections of stored coordinates, independently
fitted to their bounds. This is dataset inspection, not a physics simulator or continuous 3D
fold animation. Synthetic layer order is used where recorded; otherwise face order is used.
Pureland uses its compiled depth ordering, which is not a physical validation of a trajectory.
Repeated samples in different sets remain visible with their full source paths.

## Manual checks

1. Open `release/all-layers / easy-0001`: the CP, initial sheet, four folds, and final
   state should appear. Select the first folded frame and inspect its recorded action.
2. Select `some-verified-d3 / layers-0001` and play through its recorded partial folds.
3. Select Pureland `bird`: seven steps, changing CP, compiled state, and original JPG.
4. Select `python-smoke-run1 / bfs`: it should say solver output and display saved frames.
5. Select a run without a sequence: status and result link should appear without frames.
6. Switch samples quickly during playback: the latest selection should remain displayed.

Runtime validation is pending; the implementation was inspected without executing Node,
Python, package installers, or browser automation.
