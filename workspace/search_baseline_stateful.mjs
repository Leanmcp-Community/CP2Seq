// Same breadth-first search as search_baseline.mjs, with the per-node replay removed.
//
// WHAT CHANGED, AND WHY IT IS ONLY A CONSTANT
// The original expands a node by calling replay(cp, path), which re-folds the whole path from
// a flat sheet, and then calls replay(cp, path) AGAIN per child before apply(). A node at
// depth d therefore costs d folds to reach, and each of its children costs another d + 1 --
// so the search does O(d * b^d) fold operations where O(b^d) is enough.
//
// tryFold is already pure: it does not touch the paper it is given and it returns the
// resulting state. So a node can simply carry its own state, and a child's state is the one
// tryFold just produced. No replay, and no recomputation.
//
// This is worth doing -- it is a real ~d-fold speedup, confirmed by --benchmark below -- but
// it does NOT move the wall. Depth grows as log_b(work), so multiplying throughput by k buys
// log_b(k) extra levels: at b = 3.5, a 15x speedup is +2.1 levels. The easy tier sits at
// depth ~5 and the hard tier at 15-20. Only a better-informed search (best-first on the
// compare distance) changes that.
//
// MEMORY IS THE TRADE. The original stores a path per frontier node (cheap) and pays to
// reconstruct the state. This stores the state (faces + order + creases so far), which is
// larger per node. --max-states bounds it, and the two engines agree node-for-node, so the
// choice is purely time against memory.
//
//   node workspace/search_baseline_stateful.mjs easy-0001 easy-0002 easy-0003
//   node workspace/search_baseline_stateful.mjs --benchmark easy-0001 easy-0003
//   node workspace/search_baseline_stateful.mjs --engine replay easy-0003
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FoldSession, replay, tryFold} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalFolds} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs';
import {frameLayers, terminalMatch} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';
import {currentPolys} from './corpus/fold-engine-layers.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CORPUS = process.env.CORPUS_DIR ?? join(ROOT, 'workspace/corpus/out/release/all-layers/samples');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  return Number(argv.splice(i, 2)[1]);
};
const pick = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  return argv.splice(i, 2)[1];
};
const seconds = flag('--seconds', 60);
const maxStates = flag('--max-states', 500000);
const maxDepth = flag('--max-depth', 24);
const engine = pick('--engine', 'stateful');
const benchmark = argv.includes('--benchmark');
const asJson = argv.includes('--json');
const samples = argv.filter(a => !a.startsWith('--'));
if (!samples.length) {
  console.error('usage: node workspace/search_baseline_stateful.mjs [--seconds N] [--max-states N]' +
                ' [--engine stateful|replay] [--benchmark] [--json] <sample-id>...');
  process.exit(2);
}
if (!['stateful', 'replay'].includes(engine)) {
  console.error(`--engine must be stateful or replay, got ${engine}`);
  process.exit(2);
}

// Unchanged from search_baseline.mjs: the CP file, and the last frame of steps.fold as the
// target. No reference sequence is read.
function loadTask(id) {
  const dir = join(CORPUS, id);
  const raw = JSON.parse(readFileSync(join(dir, 'cp.fold'), 'utf8'));
  const steps = JSON.parse(readFileSync(join(dir, 'steps.fold'), 'utf8'));
  const final = steps.file_frames.at(-1);
  const cp = {file_spec: 1.1, frame_classes: ['creasePattern'],
    vertices_coords: raw.vertices_coords, edges_vertices: raw.edges_vertices,
    edges_assignment: raw.edges_assignment};
  const target = {file_spec: 1.1, frame_classes: ['foldedForm'],
    vertices_coords: final.vertices_coords, faces_vertices: final.faces_vertices,
    'fo:faces_layer': final['fo:faces_layer'], 'fo:faces_parity': final['fo:faces_parity']};
  return {cp, target, referenceSteps: JSON.parse(readFileSync(join(dir, 'seq.json'), 'utf8')).folds.length};
}

// Identical key to search_baseline.mjs, so the two searches visit and prune the same nodes.
const layerKey = layers => JSON.stringify(layers.map(l =>
  l.par + ':' + l.poly.map(p => `${Math.round(p[0] / 2e-6)},${Math.round(p[1] / 2e-6)}`).join(' ')));

// enumerateLegalFolds reads exactly four fields off its argument: paper, cp, creases and
// actions.length. A node satisfies that contract without being a FoldSession, which is what
// lets a node BE its state instead of a recipe for rebuilding one.
const nodeView = node => ({paper: node.paper, cp: node.cp, creases: node.creases,
                          actions: node.actions});

function statefulBfs(cp, targetLayers) {
  const started = Date.now();
  const root = new FoldSession(cp);
  if (terminalMatch(root.layers, targetLayers)) return {status: 'solved', depth: 0, expanded: 0, generated: 0, actions: []};
  let frontier = [{cp, paper: root.paper, layers: root.layers, creases: root.creases, actions: []}];
  const seen = new Set([layerKey(root.layers)]);
  let expanded = 0, generated = 0, folds = 0;
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = [];
    for (const node of frontier) {
      if ((Date.now() - started) / 1000 > seconds) return {status: 'timeout', depth, expanded, generated, folds};
      if (seen.size > maxStates) return {status: 'state_limit', depth, expanded, generated, folds};
      expanded++;
      for (const entry of enumerateLegalFolds(nodeView(node), {max_results: 500}).legal_folds) {
        const move = {tool: 'apply_fold', ...entry.action};
        // The one fold this child costs. tryFold does not mutate node.paper, so siblings all
        // expand from the same untouched state and nothing has to be undone.
        const verdict = tryFold(node.paper, cp, move);
        folds++;
        if (!verdict.ok) continue;
        const paper = verdict.fold.state;
        const layers = currentPolys(paper);
        const key = layerKey(layers);
        if (seen.has(key)) continue;
        seen.add(key);
        generated++;
        const child = {cp, paper, layers, creases: [...node.creases, ...verdict.fold.made],
                       actions: [...node.actions, move]};
        if (terminalMatch(layers, targetLayers)) {
          return {status: 'solved', depth: depth + 1, expanded, generated, folds,
                  actions: child.actions, seconds: (Date.now() - started) / 1000};
        }
        next.push(child);
      }
    }
    if (!next.length) return {status: 'exhausted', depth, expanded, generated, folds,
                              seconds: (Date.now() - started) / 1000};
    frontier = next;
  }
  return {status: 'depth_limit', expanded, generated, folds, seconds: (Date.now() - started) / 1000};
}

// The original strategy, kept here so --benchmark compares like with like in one process:
// same loader, same key, same clock, same machine state.
function replayBfs(cp, targetLayers) {
  const started = Date.now();
  const root = new FoldSession(cp);
  if (terminalMatch(root.layers, targetLayers)) return {status: 'solved', depth: 0, expanded: 0, generated: 0, actions: []};
  let frontier = [[]];
  const seen = new Set([layerKey(root.layers)]);
  let expanded = 0, generated = 0, folds = 0;
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = [];
    for (const path of frontier) {
      if ((Date.now() - started) / 1000 > seconds) return {status: 'timeout', depth, expanded, generated, folds};
      if (seen.size > maxStates) return {status: 'state_limit', depth, expanded, generated, folds};
      const session = replay(cp, path);
      folds += path.length;
      expanded++;
      for (const entry of enumerateLegalFolds(session, {max_results: 500}).legal_folds) {
        const move = {tool: 'apply_fold', ...entry.action};
        const child = replay(cp, path);
        folds += path.length;
        if (!child.apply(move).ok) continue;
        folds++;
        const key = layerKey(child.layers);
        if (seen.has(key)) continue;
        seen.add(key);
        generated++;
        const actions = [...path, move];
        if (terminalMatch(child.layers, targetLayers)) {
          return {status: 'solved', depth: depth + 1, expanded, generated, folds, actions,
                  seconds: (Date.now() - started) / 1000};
        }
        next.push(actions);
      }
    }
    if (!next.length) return {status: 'exhausted', depth, expanded, generated, folds,
                              seconds: (Date.now() - started) / 1000};
    frontier = next;
  }
  return {status: 'depth_limit', expanded, generated, folds, seconds: (Date.now() - started) / 1000};
}

const ENGINES = {stateful: statefulBfs, replay: replayBfs};
const pad = (v, n) => String(v).padEnd(n);

if (benchmark) {
  // Both engines must agree on status and depth, or the speedup is meaningless.
  console.log(`  ${pad('sample', 11)}${pad('status', 12)}${pad('depth', 7)}` +
              `${pad('replay s', 11)}${pad('stateful s', 12)}${pad('speedup', 9)}folds saved`);
  for (const id of samples) {
    const {cp, target} = loadTask(id);
    const layers = frameLayers(target);
    const a = replayBfs(cp, layers), b = statefulBfs(cp, layers);
    const agree = a.status === b.status && a.depth === b.depth &&
        JSON.stringify(a.actions ?? null) === JSON.stringify(b.actions ?? null);
    const ta = a.seconds ?? seconds, tb = b.seconds ?? seconds;
    console.log(`  ${pad(id, 11)}${pad(a.status, 12)}${pad(a.depth ?? '-', 7)}` +
                `${pad(ta.toFixed(2), 11)}${pad(tb.toFixed(2), 12)}` +
                `${pad((ta / tb).toFixed(1) + 'x', 9)}${a.folds} -> ${b.folds}` +
                (agree ? '' : '   *** ENGINES DISAGREE ***'));
  }
} else {
  let solved = 0;
  const report = [];
  for (const id of samples) {
    let r;
    try {
      const {cp, target, referenceSteps} = loadTask(id);
      r = ENGINES[engine](cp, frameLayers(target));
      r.reference = referenceSteps;
      r.engine = engine;
    } catch (e) {
      report.push({sample_id: id, status: 'error', error: e.message});
      if (!asJson) console.log(`  ${pad(id, 11)}error        ${e.message.slice(0, 70)}`);
      continue;
    }
    if (r.status === 'solved') solved++;
    report.push({sample_id: id, ...r});
    if (!asJson) console.log(`  ${pad(id, 11)}${pad(r.status, 13)}depth=${r.depth ?? '-'}/${r.reference}` +
      ` expanded=${pad(r.expanded, 8)}generated=${pad(r.generated, 8)}folds=${pad(r.folds, 9)}` +
      `${(r.seconds ?? seconds).toFixed(1)}s`);
  }
  if (asJson) console.log(JSON.stringify(report));
  else console.log(`\n${engine} BFS solved ${solved} of ${samples.length}`);
}
