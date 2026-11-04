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
import {enumerateLegalUnfolds, exactKey} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_unfolds.mjs';
import {targetState} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/target_state.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CORPUS = process.env.CORPUS_DIR ?? join(ROOT, 'workspace/corpus/out/release/all-layers/samples');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  return Number(argv.splice(i, 2)[1]);
};
const seconds = flag('--seconds', 60);
const weight = flag('--weight', 1);
const maxStates = flag('--max-states', 500000);
const maxDepth = flag('--max-depth', 24);
// --json makes this consumable by deterministic_fold_loop.py, which replays the winning
// action list through the real ToolSession so the run lands in the UI like any other.
const asJson = argv.includes('--json');
const strategyAt = argv.indexOf('--strategy');
// bfs stays the default so every number already published reproduces unchanged.
const strategy = strategyAt === -1 ? 'bfs' : argv.splice(strategyAt, 2)[1];
if (!['bfs', 'astar', 'reverse'].includes(strategy)) {
  console.error(`unknown --strategy ${strategy}; use bfs, astar or reverse`);
  process.exit(2);
}
const samples = argv.filter(a => a !== '--json');
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

const segLength = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Total M/V crease length in the CP. cp_match requires every one of them, so what is left
// unlaid is a direct measure of how much folding remains.
function targetCreaseLength(cp) {
  let total = 0;
  cp.edges_vertices.forEach((e, i) => {
    const a = cp.edges_assignment[i];
    if (a === 'M' || a === 'V') total += segLength(cp.vertices_coords[e[0]], cp.vertices_coords[e[1]]);
  });
  return total;
}

const laidLength = session => session.creases.reduce((sum, c) => sum + segLength(c.P, c.Q), 0);

// A child one fold on from its parent, without rebuilding from the flat sheet. replay() costs
// O(depth) applies, so at depth 10 a node paid ~38 redundant fold applications and A* -- which
// dives deep fast -- ran at 2.6 nodes/s against BFS's 18. apply() replaces paper/layers rather
// than mutating them in place, so sharing those references is safe; the arrays it appends to
// are the ones that must be copied.
function fork(session) {
  const child = Object.create(Object.getPrototypeOf(session));
  Object.assign(child, session);
  child.creases = [...session.creases];
  child.actions = [...session.actions];
  child.states = [...session.states];
  return child;
}

// Folds still required, estimated two ways; the larger wins because both are lower bounds on
// the same quantity and neither dominates.
//
//   crease  every target crease must be laid, so what is unlaid divided by the largest single
//           fold contribution seen is a fold count. The scale is measured, not derived, so
//           this is not provably admissible.
//   layers  a fold cuts each selected layer at most once, so the stack can at most double.
//           Going from C layers to the target's T therefore needs at least log2(T/C) folds.
//           This one IS admissible, and it is exactly tier-1 compare_to_target information.
function heuristic(session, totalCrease, targetCount, scale) {
  const crease = Math.max(0, totalCrease - laidLength(session)) / scale;
  const layers = session.layers.length < targetCount
    ? Math.log2(targetCount / session.layers.length) : 0;
  return Math.max(crease, layers);
}

// Binary heap: the frontier reaches tens of thousands of nodes, so re-sorting on every pop
// would cost more than the search.
class Heap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items;
    a.push(item);
    for (let i = a.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// Informed search over the same enumerated actions.
//
// h estimates the folds still required from how much target crease is still unlaid, scaled by
// the largest single-fold contribution seen so far. That scale is measured rather than derived,
// so h is NOT provably admissible and a solution found here is not guaranteed to be the
// shortest -- which is why bfs remains the published floor. What it buys is direction: a branch
// that stops laying new crease sinks in the queue instead of being expanded exhaustively.
function astar(cp, targetLayers) {
  const started = Date.now();
  const total = targetCreaseLength(cp);
  const root = new FoldSession(cp);
  if (terminalMatch(root.layers, targetLayers)) return {status: 'solved', depth: 0, expanded: 0, generated: 0, actions: []};
  let scale = 1e-9;
  const open = new Heap();
  open.push({session: root, path: [], g: 0, f: 0});
  const seen = new Set([positionKey(root)]);
  let expanded = 0, generated = 0;
  while (open.size) {
    if ((Date.now() - started) / 1000 > seconds) return {status: 'timeout', expanded, generated, seconds: (Date.now() - started) / 1000};
    if (seen.size > maxStates) return {status: 'state_limit', expanded, generated, seconds: (Date.now() - started) / 1000};
    const node = open.pop();
    if (node.path.length >= maxDepth) continue;
    expanded++;
    for (const entry of enumerateLegalFolds(node.session, {max_results: 500}).legal_folds) {
      const move = {tool: 'apply_fold', ...entry.action};
      const child = fork(node.session);
      if (!child.apply(move).ok) continue;
      const key = positionKey(child);
      if (seen.has(key)) continue;
      seen.add(key);
      generated++;
      const path = [...node.path, move];
      if (terminalMatch(child.layers, targetLayers)) {
        return {status: 'solved', depth: path.length, expanded, generated, actions: path,
                seconds: (Date.now() - started) / 1000};
      }
      scale = Math.max(scale, entry.new_crease_length || 0);
      open.push({session: child, path, g: path.length,
                 f: path.length + weight * heuristic(child, total, targetLayers.length, scale)});
    }
  }
  return {status: 'exhausted', expanded, generated, seconds: (Date.now() - started) / 1000};
}

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

// REVERSE: unfold the target back to the flat sheet.
//
// Same graph as bfs, walked the other way. Three things differ, and they are the reasons to
// have it:
//
//   ROOT.   The target as the corpus stores it is not a runnable state -- the final frame keeps
//           folded polygons and nothing else. target_state.mjs derives the missing original
//           coordinates and placements from the CP and checks the result with terminalMatch, so
//           a target that cannot be reconstructed is reported, never searched from.
//   MOVES.  Unfolding only removes creases, so every state it reaches is inside the CP by
//           construction. The forward search spends most of its budget on OUTSIDE_TARGET_CP;
//           this side never asks the question.
//   DEPTH.  A fold makes at least one crease, so it splits at least one face, so it strictly
//           increases the layer count. Unfolding strictly decreases it, and the search is
//           bounded by the target's own stack height. `exhausted` here is a PROOF that no
//           sequence reaches this target through this action space, not a budget running out.
//
// CP-consistency is not reachability, and that is deliberate. A predecessor can be perfectly
// consistent with the CP and still have no folding history of its own; such a branch simply
// never reaches the flat sheet. It costs time, not correctness, because the only path that
// counts is one that terminates at one layer -- and every edge on it was confirmed by tryFold.
function reverse(cp, target, targetLayers) {
  const started = Date.now();
  const elapsed = () => (Date.now() - started) / 1000;
  const rebuilt = targetState(cp, target);
  const stats = () => ({expanded, generated, dead_ends: deadEnds,
                        successors, seconds: elapsed(),
                        reconstruction: {cp_faces: rebuilt.cp_faces, frame_faces: rebuilt.frame_faces,
                                         layout_consistent: rebuilt.layout_consistent,
                                         alignments_tried: rebuilt.alignments_tried}});
  let expanded = 0, generated = 0, deadEnds = 0, successors = 0, mismatches = 0;
  if (!rebuilt.ok) return {status: 'reconstruction_failed', reason: rebuilt.reason, ...stats()};
  const root = rebuilt.state;
  if (root.order.length === 1) return {status: 'solved', depth: 0, actions: [], ...stats()};

  // The path a node carries is the FORWARD sequence from that node to the target, so an unfold
  // prepends its own forward action. Reaching one layer therefore yields the sequence already
  // in fold order, with no reversal step to get backwards.
  let frontier = [{state: root, path: []}];
  const seen = new Set([exactKey(root)]);
  const bound = Math.min(maxDepth, root.order.length - 1);
  for (let depth = 0; depth < bound; depth++) {
    const next = [];
    for (const node of frontier) {
      if (elapsed() > seconds) return {status: 'timeout', depth, ...stats()};
      if (seen.size > maxStates) return {status: 'state_limit', depth, ...stats()};
      expanded++;
      const step = enumerateLegalUnfolds(node.state, cp);
      if (step.dead_end) deadEnds++;
      successors += step.unfolds.length;
      for (const u of step.unfolds) {
        const key = exactKey(u.state);
        if (seen.has(key)) continue;
        seen.add(key);
        generated++;
        const path = [{tool: 'apply_fold', ...u.action}, ...node.path];
        if (u.state.order.length > 1) { next.push({state: u.state, path}); continue; }
        // One layer is the flat sheet. Before claiming it, replay the whole sequence forward
        // from `new FoldSession(cp)` through the ordinary verifier and score it with the SAME
        // terminalMatch bfs uses. Nothing about the reverse construction is taken on trust.
        let session;
        try { session = replay(cp, path); } catch (e) { mismatches++; continue; }
        if (!terminalMatch(session.layers, targetLayers)) { mismatches++; continue; }
        return {status: 'solved', depth: path.length, actions: path,
                cp_match: session.evaluate().cp_match, forward_replay_mismatches: mismatches,
                ...stats()};
      }
    }
    if (!next.length) return {status: 'exhausted', depth, forward_replay_mismatches: mismatches, ...stats()};
    frontier = next;
  }
  return {status: 'depth_limit', forward_replay_mismatches: mismatches, ...stats()};
}

let solved = 0;
const report = [];
for (const id of samples) {
  let r;
  try {
    const {cp, target, referenceSteps} = loadTask(id);
    const targetLayers = frameLayers(target);
    r = strategy === 'reverse' ? reverse(cp, target, targetLayers)
      : (strategy === 'astar' ? astar : bfs)(cp, targetLayers);
    r.strategy = strategy;
    r.reference = referenceSteps;
  } catch (e) {
    report.push({sample_id: id, status: 'error', error: e.message});
    if (!asJson) console.log(`  ${id.padEnd(10)} error        ${e.message.slice(0, 70)}`);
    continue;
  }
  if (r.status === 'solved') solved++;
  report.push({sample_id: id, ...r});
  if (!asJson) console.log(`  ${id.padEnd(10)} ${r.status.padEnd(12)} depth=${r.depth ?? '-'}/${r.reference}` +
    ` expanded=${String(r.expanded).padEnd(7)} generated=${String(r.generated).padEnd(7)}` +
    ` ${(r.seconds ?? seconds).toFixed(1)}s`);
}
if (asJson) console.log(JSON.stringify(report));
else console.log(`\ndeterministic BFS solved ${solved} of ${samples.length}`);
