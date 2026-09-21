// Write each target layer's original-sheet polygon into the corpus, without regenerating it.
//
// WHY IT IS NEEDED
// A backward or bidirectional search has to start from the target as an ENGINE state: faces
// in original sheet coordinates plus a transform each. The target frame in steps.fold gives
// folded coordinates only, and shape cannot recover the rest -- all 128 of mid-0001's folded
// faces are congruent to each other, and 3208 of hard-0001's 3504 fall in one class. Half of
// what is missing comes free, because flat folding fixes every face's transform from the M/V
// assignment alone (verified: T_g = R(T_f) on 249 of 249 adjacent pairs). The half that does
// not is which sheet region sits at which layer, and that is the flat-folding problem itself.
//
// WHY NO REGENERATION
// The information was never lost, only unwritten. seq.json holds the reference sequence, and
// replaying it reproduces the engine state exactly -- FoldSession.observation() already
// returns sheet_polygon per layer, which is precisely this field. The simulator hands it to
// the model for the CURRENT state every single turn; only the TARGET lacks it. So this is a
// read-replay-write pass over the existing corpus, and it changes no geometry.
//
// WHAT IT DOES NOT SETTLE
// terminalMatch compares folded polygons and parity only, so two states it calls equal can
// hold different parts of the sheet in the same places. Provenance is therefore STRONGER
// than the goal test: a solver that reaches a terminalMatch-equal target by another route
// may have different provenance, and a backward search seeded from this field would not find
// that route. Sound, not complete. Keep the goal test as it is and treat this as a hint for
// the backward direction, or tighten the goal test deliberately -- but not by accident.
//
//   node workspace/backfill_target_provenance.mjs --dry-run easy-0001 mid-0001
//   node workspace/backfill_target_provenance.mjs --out workspace/corpus_provenance easy-0001
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FoldSession, actionFromFold} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {frameLayers, terminalMatch} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CORPUS = process.env.CORPUS_DIR ?? join(ROOT, 'workspace/corpus/out/release/all-layers/samples');
const argv = process.argv.slice(2);
const pick = (n, f) => { const i = argv.indexOf(n); return i === -1 ? f : argv.splice(i, 2)[1]; };
const outDir = pick('--out', null);
const dryRun = argv.includes('--dry-run') || !outDir;
const samples = argv.filter(a => !a.startsWith('--'));
if (!samples.length) { console.error('usage: node workspace/backfill_target_provenance.mjs [--dry-run] [--out DIR] <sample-id>...'); process.exit(2); }

const pad = (v, n) => String(v).padEnd(n);
console.log(dryRun ? 'dry run: nothing is written\n' : `writing to ${outDir}\n`);
console.log(`  ${pad('sample', 12)}${pad('ref folds', 11)}${pad('layers', 8)}${pad('replay==target', 16)}status`);

let ok = 0, bad = 0;
for (const id of samples) {
  const dir = join(CORPUS, id);
  const raw = JSON.parse(readFileSync(join(dir, 'cp.fold'), 'utf8'));
  const cp = {file_spec: 1.1, frame_classes: ['creasePattern'], vertices_coords: raw.vertices_coords,
              edges_vertices: raw.edges_vertices, edges_assignment: raw.edges_assignment};
  const steps = JSON.parse(readFileSync(join(dir, 'steps.fold'), 'utf8'));
  const folds = JSON.parse(readFileSync(join(dir, 'seq.json'), 'utf8')).folds;

  const session = new FoldSession(cp);
  let failed = null;
  for (const f of folds) {
    const r = session.apply({...actionFromFold(f)});
    if (!r.ok) { failed = r.error; break; }
  }
  if (failed) { console.log(`  ${pad(id, 12)}${pad(folds.length, 11)}${pad('-', 8)}${pad('-', 16)}replay failed: ${failed}`); bad++; continue; }

  // The replayed state must BE the target, or the provenance would belong to something else.
  const target = frameLayers(steps.file_frames.at(-1));
  const matches = terminalMatch(session.layers, target);
  const obs = session.observation().layers_bottom_to_top;

  console.log(`  ${pad(id, 12)}${pad(folds.length, 11)}${pad(obs.length, 8)}${pad(matches ? 'yes' : 'NO', 16)}` +
              (matches ? 'ok' : 'refusing to write'));
  if (!matches) { bad++; continue; }
  ok++;
  if (dryRun) continue;

  // One array, bottom to top, parallel to fo:faces_layer: the region of the flat sheet that
  // each layer is. Written on the final frame only, where a solver's target comes from.
  const frames = steps.file_frames.map(f => ({...f}));
  frames[frames.length - 1]['fo:faces_sheet_polygon'] = obs.map(l => l.sheet_polygon);
  const dest = join(outDir, id);
  mkdirSync(dest, {recursive: true});
  for (const name of ['cp.fold', 'seq.json', 'meta.json']) {
    if (existsSync(join(dir, name))) writeFileSync(join(dest, name), readFileSync(join(dir, name)));
  }
  writeFileSync(join(dest, 'steps.fold'), JSON.stringify({...steps, file_frames: frames}));
}

console.log(`\n  ${ok} ready, ${bad} skipped`);
console.log(dryRun ? '  (pass --out DIR to write a provenance-carrying copy; the originals are never modified)' : '');
