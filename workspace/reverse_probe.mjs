// Ground-truth test for the reverse machinery. Not a search -- a check that the two new pieces
// agree with states the forward engine actually produced.
//
// The reference sequence in seq.json is replayed forward to get the TRUE state after every
// step, with real original-sheet polygons and real placements. Then:
//
//   RECONSTRUCTION  target_state.mjs is given only the CP and the final frame -- never the
//                   sequence -- and its state must be exactlyKey-identical to the true final
//                   state. terminalMatch would be too weak here: it quotients out a whole-sheet
//                   motion and ignores which part of the sheet a face is, so it would pass a
//                   reconstruction that is wrong in exactly the way that breaks folding.
//
//   COMPLETENESS    walking backwards, the true previous state must appear among the
//                   predecessors enumerateLegalUnfolds proposes. This is the property the
//                   reverse search actually needs and the one tryFold cannot give it: tryFold
//                   guarantees nothing WRONG is listed, never that nothing is MISSING.
//
//   BRANCHING       how many predecessors each true state has, and how often a state has none.
//                   This is the number that decides whether reverse search is worth running.
//
// Using seq.json is legitimate here and only here: it is the test's oracle, not the search's
// input. search_baseline.mjs --strategy reverse never reads it.
//
//   node workspace/reverse_probe.mjs easy-0001 easy-0002
//   node workspace/reverse_probe.mjs --tier easy --limit 40
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {replay, actionFromFold, FoldSession} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {frameLayers} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';
import {targetState} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/target_state.mjs';
import {enumerateLegalUnfolds, exactKey} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_unfolds.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CORPUS = process.env.CORPUS_DIR ?? join(ROOT, 'workspace/corpus/out/release/all-layers/samples');

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv.splice(i, 2)[1];
};
const tier = opt('--tier', null);
const limit = Number(opt('--limit', 1e9));
const verbose = argv.includes('--verbose');
let samples = argv.filter(a => !a.startsWith('--'));
if (tier) samples = readdirSync(CORPUS).filter(d => d.startsWith(`${tier}-`)).sort();
samples = samples.slice(0, limit);
if (!samples.length) { console.error('usage: node workspace/reverse_probe.mjs [--tier easy] [--limit N] <sample-id>...'); process.exit(2); }

function loadTask(id) {
  const dir = join(CORPUS, id);
  const raw = JSON.parse(readFileSync(join(dir, 'cp.fold'), 'utf8'));
  const steps = JSON.parse(readFileSync(join(dir, 'steps.fold'), 'utf8'));
  const final = steps.file_frames.at(-1);
  return {
    cp: {file_spec: 1.1, frame_classes: ['creasePattern'], vertices_coords: raw.vertices_coords,
         edges_vertices: raw.edges_vertices, edges_assignment: raw.edges_assignment},
    target: {file_spec: 1.1, frame_classes: ['foldedForm'], vertices_coords: final.vertices_coords,
             faces_vertices: final.faces_vertices, 'fo:faces_layer': final['fo:faces_layer'],
             'fo:faces_parity': final['fo:faces_parity']},
    folds: JSON.parse(readFileSync(join(dir, 'seq.json'), 'utf8')).folds,
  };
}

const tally = {samples: 0, rebuilt: 0, exact: 0, chains: 0, complete: 0, dead: 0,
               branch: [], worst: null};

for (const id of samples) {
  let row;
  try {
    const {cp, target, folds} = loadTask(id);
    const actions = folds.map(actionFromFold);

    // The truth: every state the forward engine really passed through.
    const truth = [];
    const session = new FoldSession(cp);
    truth.push({faces: session.paper.faces, order: session.paper.order});
    for (const a of actions) {
      const r = session.apply(a);
      if (!r.ok) throw Error(`reference replay rejected: ${r.error}`);
      truth.push({faces: session.paper.faces, order: session.paper.order});
    }
    const trueKeys = truth.map(exactKey);

    const rebuilt = targetState(cp, target);
    row = {id, steps: folds.length, layers: truth.at(-1).order.length,
           rebuilt: rebuilt.ok, consistent: rebuilt.layout_consistent,
           faces: `${rebuilt.cp_faces}/${rebuilt.frame_faces}`};
    tally.samples++;
    if (!rebuilt.ok) { row.note = rebuilt.reason; report(row); continue; }
    tally.rebuilt++;
    row.exact = exactKey(rebuilt.state) === trueKeys.at(-1);
    if (row.exact) tally.exact++;

    // Walk the true sequence backwards. At every step the true predecessor must be proposed.
    let complete = true, dead = 0;
    const widths = [];
    for (let k = truth.length - 1; k >= 1; k--) {
      const step = enumerateLegalUnfolds(truth[k], cp);
      widths.push(step.unfolds.length);
      if (step.dead_end) dead++;
      if (!step.unfolds.some(u => exactKey(u.state) === trueKeys[k - 1])) {
        complete = false;
        if (verbose) console.log(`    ${id} step ${k}: true predecessor NOT proposed ` +
                                 `(${step.unfolds.length} offered, rejected ${JSON.stringify(step.rejected_summary)})`);
        break;
      }
    }
    tally.chains++;
    if (complete) tally.complete++;
    tally.dead += dead;
    tally.branch.push(...widths);
    row.complete = complete;
    row.branching = widths.length ? (widths.reduce((a, b) => a + b, 0) / widths.length).toFixed(2) : '-';
    row.widest = widths.length ? Math.max(...widths) : 0;
    if (!tally.worst || row.widest > tally.worst.widest) tally.worst = row;
  } catch (e) {
    row = {id, error: e.message.slice(0, 90)};
    tally.samples++;
  }
  report(row);
}

function report(r) {
  if (r.error) return console.log(`  ${r.id.padEnd(10)} ERROR  ${r.error}`);
  console.log(`  ${r.id.padEnd(10)} steps=${String(r.steps).padEnd(3)} layers=${String(r.layers).padEnd(3)}` +
    ` rebuilt=${String(r.rebuilt).padEnd(5)} exact=${String(r.exact ?? '-').padEnd(5)}` +
    ` consistent=${String(r.consistent).padEnd(5)} faces=${String(r.faces).padEnd(8)}` +
    ` complete=${String(r.complete ?? '-').padEnd(5)} branch=${r.branching ?? '-'}` +
    ` widest=${r.widest ?? '-'}${r.note ? '  ' + r.note : ''}`);
}

const mean = tally.branch.length ? (tally.branch.reduce((a, b) => a + b, 0) / tally.branch.length) : 0;
console.log(`\nsamples ${tally.samples}` +
  `\n  reconstructed          ${tally.rebuilt}/${tally.samples}` +
  `\n  exact match to truth   ${tally.exact}/${tally.samples}` +
  `\n  full backward chain    ${tally.complete}/${tally.chains}` +
  `\n  mean reverse branching ${mean.toFixed(2)} over ${tally.branch.length} true states` +
  `\n  dead ends on the true path ${tally.dead}` +
  (tally.worst ? `\n  widest ${tally.worst.widest} (${tally.worst.id})` : ''));
