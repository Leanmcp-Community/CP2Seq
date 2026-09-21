// Is the unfold COMPLETE? Soundness is free -- every candidate is verified by folding it
// forward -- but a generator that silently misses predecessors would make a bidirectional
// search incomplete, and an incomplete search reports "unsolvable" for samples that are not.
// That failure is invisible unless it is tested for directly.
//
// The test: walk each sample's reference sequence. At every step i, unfold state S_i and
// check that S_{i-1}, the state the reference actually came from, is in the result. A miss
// is a hole in the generator; a hit at every step on every sample is the evidence needed
// before building anything on top of it.
//
//   node workspace/check_unfold.mjs easy-0001 easy-0003 mid-0001
//   node workspace/check_unfold.mjs --budget 120 mid-0003
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FoldSession, actionFromFold} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {predecessors, stateKey} from './unfold.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CORPUS = process.env.CORPUS_DIR ?? join(ROOT, 'workspace/corpus/out/release/all-layers/samples');
const argv = process.argv.slice(2);
const flag = (n, f) => { const i = argv.indexOf(n); return i === -1 ? f : Number(argv.splice(i, 2)[1]); };
const budget = flag('--budget', 180);
const samples = argv.filter(a => !a.startsWith('--'));
if (!samples.length) { console.error('usage: node workspace/check_unfold.mjs [--budget S] <sample-id>...'); process.exit(2); }

const pad = (v, n) => String(v).padEnd(n);
let totalSteps = 0, hits = 0, misses = 0, predCounts = [];

for (const id of samples) {
  const raw = JSON.parse(readFileSync(join(CORPUS, id, 'cp.fold'), 'utf8'));
  const cp = {file_spec: 1.1, frame_classes: ['creasePattern'], vertices_coords: raw.vertices_coords,
              edges_vertices: raw.edges_vertices, edges_assignment: raw.edges_assignment};
  const actions = JSON.parse(readFileSync(join(CORPUS, id, 'seq.json'), 'utf8')).folds.map(actionFromFold);

  // Every state along the reference path, so step i can be checked against step i-1.
  const session = new FoldSession(cp);
  const chain = [{paper: session.paper}];
  for (const a of actions) {
    if (!session.apply({...a}).ok) break;
    chain.push({paper: session.paper});
  }

  console.log(`\n${id}  reference ${actions.length} folds, replayed ${chain.length - 1}`);
  console.log(`  ${pad('step', 6)}${pad('layers', 8)}${pad('predecessors', 14)}${pad('true one found', 16)}ms`);
  const started = Date.now();
  for (let i = 1; i < chain.length; i++) {
    if ((Date.now() - started) / 1000 > budget) { console.log(`  [budget ${budget}s reached at step ${i}]`); break; }
    const t0 = performance.now();
    const preds = predecessors(chain[i].paper, cp);
    const ms = performance.now() - t0;
    const wanted = stateKey(chain[i - 1].paper);
    const found = preds.some(p => stateKey(p.paper) === wanted);
    totalSteps++; found ? hits++ : misses++;
    predCounts.push(preds.length);
    console.log(`  ${pad(i, 6)}${pad(chain[i].paper.order.length, 8)}${pad(preds.length, 14)}` +
                `${pad(found ? 'yes' : 'NO  <<<<', 16)}${ms.toFixed(0)}`);
  }
}

const mean = predCounts.reduce((a, b) => a + b, 0) / Math.max(1, predCounts.length);
console.log(`\n  ${hits}/${totalSteps} steps recovered the true predecessor` +
            `${misses ? `, ${misses} MISSED` : ''}`);
console.log(`  mean predecessors per state: ${mean.toFixed(2)}` +
            `  (the backward branching factor a bidirectional search would face)`);
console.log(misses
  ? '\n  The generator is incomplete. A bidirectional search on it would miss solutions.'
  : '\n  Complete on every state tested: the backward half of a bidirectional search is sound here.');
process.exit(misses ? 1 : 0);
