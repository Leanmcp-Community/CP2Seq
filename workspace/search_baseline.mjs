// Deterministic breadth-first search over exactly the moves the model is offered.
//
// WHY THIS IS THE NUMBER THAT MATTERS
// list_legal_folds evaluates about 2010 candidate actions per state and returns a mean of 3.51
// that are legal AND stay inside the target CP -- measured over 73750 enumerations from the
// saved runs. That is a ~570x prune, performed by the simulator rather than by the model. Once
// branching is 3.5, an easy sample of five folds is a tree of a few hundred states.
//
// So the question a reviewer will ask is not "can the model do this" but "how much was left to
// do". If exhaustive search over the same enumerated actions solves the easy tier outright,
// then the enumerator arm's 20-26 percent is not measuring origami reasoning; it is measuring a
// model losing to breadth-first search on a tree its own tool already pruned. This answers that
// with no model calls and no quota.
//
// It is like-for-like on purpose: the SAME enumerator the model sees for expansion, and the
// SAME terminalMatch that decides `solved` for the goal test. baseline_python/model.py could
// not serve here -- it needs a faced CP the corpus does not contain, and its action space
// (arbitrary same-side component unions) is broader than this engine's contiguous runs.
//
//   node workspace/search_baseline.mjs easy-0001 easy-0002 easy-0003
//   node workspace/search_baseline.mjs --seconds 30 --max-states 200000 easy-0001
//   node workspace/search_baseline.mjs $(sh workspace/pending_samples.sh easy | tr ' ' '\n' | head -20)
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FoldSession, replay} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalFolds} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs';
import {frameLayers, terminalMatch} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CORPUS = process.env.CORPUS_DIR ?? join(ROOT, 'workspace/corpus/out/release/all-layers/samples');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  return Number(argv.splice(i, 2)[1]);
};
const seconds = flag('--seconds', 60);
const maxStates = flag('--max-states', 500000);
const maxDepth = flag('--max-depth', 24);
const samples = argv;
if (!samples.length) {
  console.error('usage: node workspace/search_baseline.mjs [--seconds N] [--max-states N] <sample-id>...');
  process.exit(2);
}

// Same split capture_fold.load_task uses: the CP file, and the last frame of steps.fold as the
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

// Two routes to the same folded paper are the same node. Same quantisation the harness uses for
// its cycle detection, so the search cannot count as progress what the harness calls a repeat.
const positionKey = session => JSON.stringify(session.layers.map(l =>
  l.par + ':' + l.poly.map(p => `${Math.round(p[0] / 2e-6)},${Math.round(p[1] / 2e-6)}`).join(' ')));

function bfs(cp, targetLayers) {
  const started = Date.now();
  const root = new FoldSession(cp);
  if (terminalMatch(root.layers, targetLayers)) return {status: 'solved', depth: 0, expanded: 0, actions: []};
  let frontier = [[]];
  const seen = new Set([positionKey(root)]);
  let expanded = 0, generated = 0;
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = [];
    for (const path of frontier) {
      if ((Date.now() - started) / 1000 > seconds) return {status: 'timeout', depth, expanded, generated};
      if (seen.size > maxStates) return {status: 'state_limit', depth, expanded, generated};
      const session = replay(cp, path);
      expanded++;
      for (const entry of enumerateLegalFolds(session, {max_results: 500}).legal_folds) {
        // replay() feeds each stored action straight back to parseAction, which requires the
        // tool field; the enumerator strips it before returning.
        const move = {tool: 'apply_fold', ...entry.action};
        const child = replay(cp, path);
        if (!child.apply(move).ok) continue;
        const key = positionKey(child);
        if (seen.has(key)) continue;
        seen.add(key);
        generated++;
        const actions = [...path, move];
        if (terminalMatch(child.layers, targetLayers)) {
          return {status: 'solved', depth: depth + 1, expanded, generated, actions,
                  seconds: (Date.now() - started) / 1000};
        }
        next.push(actions);
      }
    }
    if (!next.length) return {status: 'exhausted', depth, expanded, generated,
                              seconds: (Date.now() - started) / 1000};
    frontier = next;
  }
  return {status: 'depth_limit', expanded, generated, seconds: (Date.now() - started) / 1000};
}

let solved = 0;
for (const id of samples) {
  let r;
  try {
    const {cp, target, referenceSteps} = loadTask(id);
    r = bfs(cp, frameLayers(target));
    r.reference = referenceSteps;
  } catch (e) {
    console.log(`  ${id.padEnd(10)} error        ${e.message.slice(0, 70)}`);
    continue;
  }
  if (r.status === 'solved') solved++;
  console.log(`  ${id.padEnd(10)} ${r.status.padEnd(12)} depth=${r.depth ?? '-'}/${r.reference}` +
    ` expanded=${String(r.expanded).padEnd(7)} generated=${String(r.generated).padEnd(7)}` +
    ` ${(r.seconds ?? seconds).toFixed(1)}s`);
}
console.log(`\ndeterministic BFS solved ${solved} of ${samples.length}`);
