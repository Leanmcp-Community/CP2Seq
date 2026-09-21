# Which region of the flat sheet each target layer is

One file per sample, `<sample-id>.json`, holding `fo:faces_sheet_polygon`: the original-sheet
polygon of every layer of that sample's target, bottom to top, parallel to `fo:faces_layer`.

## Why it exists

A backward or bidirectional search needs the target the way the simulator holds it: faces in
ORIGINAL sheet coordinates plus a transform each. The target frame in `steps.fold` gives
folded coordinates only, and shape cannot recover the rest -- every one of mid-0001's 128
folded faces is congruent to every other, and 3208 of hard-0001's 3504 fall in one class.

Half of what is missing is free: flat folding fixes each face's transform from the M/V
assignment alone, verified on 249 of 249 adjacent face pairs. The half that is not is which
sheet region sits at which layer, and that is the flat-folding problem itself. So it is
recorded rather than derived.

## Why a sidecar and not a second corpus

`backfill_target_provenance.mjs --out` writes a whole provenance-carrying copy, which is
47 MB. Of that, 22 MB -- `cp.fold`, `seq.json`, `meta.json` -- is byte-identical to the
corpus already in the tree, and the field itself is 11.4 MB. So the field is what is
versioned. `target_state.mjs` attaches it to the original frame:

    import {loadTargetState} from './workspace/target_state.mjs';
    const paper = loadTargetState('workspace/corpus/out/release/all-layers/samples/mid-0001');

A corpus that already carries the field works unchanged; the sidecar is only read when the
frame does not have it.

## Regenerating

    node workspace/backfill_target_provenance.mjs --out <dir> $(ls <corpus>)

It replays each sample's reference sequence, which reproduces the engine state exactly, and
refuses to write unless the replayed state satisfies terminalMatch against the target.

## It is not part of the goal test

terminalMatch compares folded polygons and parity only, so two states it calls equal can
hold different parts of the sheet in the same places. Measured on nine solved instances, 7
of 9 match the reference's provenance and 2 do not -- and those two are a solution SHORTER
than the reference (easy-0007, seven folds against eight) and one using the same sheet
regions in a different order (mid-0004). Requiring provenance would mark both wrong.
FINDINGS_search_cost.md section 7a records the decision to leave the goal test alone.
