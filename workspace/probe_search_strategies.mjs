// Four cheap probes, one per strategy that might get search past the depth wall.
//
// Exhaustive search cannot be rescued by speed: at an effective base of 12.4, a 10x speedup
// buys 0.9 levels and hard-0001 is 16 levels short, so closing the gap would need 3e17x.
// Only a strategy that changes the SHAPE of the search helps. Each of the four below is a
// real implementation project, so the point of this file is to estimate the payoff of each
// BEFORE building it. Nothing here implements a new search; every probe reads the reference
// sequences and the existing enumerator.
//
//   node workspace/probe_search_strategies.mjs easy-0003 mid-0001
//   node workspace/probe_search_strategies.mjs --probe 2 --budget 120 mid-0001 mid-0003
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FoldSession, replay, tryFold, actionFromFold} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalFolds} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs';
import {frameLayers} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';
import {compareToTarget} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/compare_target.mjs';
import {currentPolys} from './corpus/fold-engine-layers.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CORPUS = process.env.CORPUS_DIR ?? join(ROOT, 'workspace/corpus/out/release/all-layers/samples');

const argv = process.argv.slice(2);
const flag = (n, f) => { const i = argv.indexOf(n); return i === -1 ? f : Number(argv.splice(i, 2)[1]); };
const budget = flag('--budget', 120);
const only = flag("--probe", 0);
// Which heuristic probe 2 scores with: 1 the counting score compare_to_target already has,
// 2 the continuous geometric one. Both are measured the same way, so they are comparable.
const hVersion = flag("--heuristic", 2);
const selection = (() => { const i = argv.indexOf('--selection'); return i === -1 ? 'any' : argv.splice(i, 2)[1]; })();
const samples = argv.filter(a => !a.startsWith('--'));
if (!samples.length) { console.error('usage: node workspace/probe_search_strategies.mjs [--probe 1..4] [--budget S] [--selection any|all] <sample-id>...'); process.exit(2); }

const pad = (v, n) => String(v).padEnd(n);
const load = id => {
  const raw = JSON.parse(readFileSync(join(CORPUS, id, 'cp.fold'), 'utf8'));
  const cp = {file_spec: 1.1, frame_classes: ['creasePattern'], vertices_coords: raw.vertices_coords,
              edges_vertices: raw.edges_vertices, edges_assignment: raw.edges_assignment};
  const final = JSON.parse(readFileSync(join(CORPUS, id, 'steps.fold'), 'utf8')).file_frames.at(-1);
  const target = frameLayers({file_spec: 1.1, frame_classes: ['foldedForm'],
    vertices_coords: final.vertices_coords, faces_vertices: final.faces_vertices,
    'fo:faces_layer': final['fo:faces_layer'], 'fo:faces_parity': final['fo:faces_parity']});
  const folds = JSON.parse(readFileSync(join(CORPUS, id, 'seq.json'), 'utf8')).folds;
  return {cp, target, folds, actions: folds.map(actionFromFold)};
};
const stateKey = layers => JSON.stringify(layers.map(l =>
  l.par + ':' + l.poly.map(p => `${Math.round(p[0] / 2e-6)},${Math.round(p[1] / 2e-6)}`).join(' ')));
const opts = {max_results: 500, selection_filter: selection};

/* ======================= PROBE 1: is bidirectional search worth building? ==================
 * Searching forward from the flat sheet and backward from the target meets at b^(d/2) instead
 * of b^d -- a 1e10 saving at hard-0001's numbers. The unknown is the BACKWARD branching
 * factor: how many different (state, fold) pairs produce the same state. If it is much
 * smaller than the forward one, the backward half is nearly free and the payoff is larger
 * still; if it is much larger, the backward half becomes the bottleneck.
 *
 * It can be measured without implementing unfolding at all. A forward BFS already generates
 * the same state from several parents and throws the duplicates away; counting them instead
 * gives the in-degree of each state, which IS the backward branching factor.
 */
function probeBidirectional(id, {cp}) {
  const started = Date.now();
  const root = new FoldSession(cp);
  let frontier = [{paper: root.paper, creases: root.creases, actions: []}];
  const parents = new Map([[stateKey(root.layers), new Set()]]);
  // Three different counts, and conflating two of them was the first version's bug:
  //   expanded      nodes this search actually opened
  //   forwardEdges  successful folds tried, i.e. edges followed
  //   parents.size  distinct states reached
  // The FORWARD branching factor is new states per expansion, generated/expanded, which is
  // what makes the frontier grow. The BACKWARD one is the mean in-degree, edges/states: how
  // many different predecessors a state has, which is what a backward search would face.
  // Dividing edges by states gives the second for both and makes them identical by
  // construction, which is exactly the 1.22/1.22 the first run printed.
  let depth = 0, forwardEdges = 0, expanded = 0;
  outer: for (; depth < 24; depth++) {
    const next = [];
    for (const node of frontier) {
      if ((Date.now() - started) / 1000 > budget) break outer;
      expanded++;
      const view = {paper: node.paper, cp, creases: node.creases, actions: node.actions};
      for (const e of enumerateLegalFolds(view, opts).legal_folds) {
        const move = {tool: 'apply_fold', ...e.action};
        const v = tryFold(node.paper, cp, move);
        if (!v.ok) continue;
        forwardEdges++;
        const layers = currentPolys(v.fold.state), key = stateKey(layers);
        const seenBefore = parents.has(key);
        if (!seenBefore) parents.set(key, new Set());
        parents.get(key).add(stateKey(currentPolys(node.paper)));
        if (!seenBefore) next.push({paper: v.fold.state, creases: [...node.creases, ...v.fold.made],
                                    actions: [...node.actions, move]});
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  const inDeg = [...parents.values()].map(s => s.size).filter(n => n > 0);
  const mean = inDeg.reduce((a, b) => a + b, 0) / Math.max(1, inDeg.length);
  return {depth, states: parents.size, expanded, edges: forwardEdges,
          b_forward: (parents.size - 1) / Math.max(1, expanded),
          b_backward: mean, max_in_degree: Math.max(0, ...inDeg)};
}

/* ======================= PROBE 2: is compare_to_target a usable heuristic? =================
 * Best-first search is only as good as its ordering. The question is not whether the score
 * correlates with anything in general, but a sharper one: at each state along a known
 * solution, where does the CORRECT next fold rank among the legal ones when they are sorted
 * by the heuristic? If it ranks first, a greedy walk solves the sample with no search at all.
 * If it ranks third out of twenty, best-first behaves like branching 3 rather than 20, and
 * 3^19 against 20^19 is the whole difference.
 *
 * The score: layers short of the target, plus mismatched ranks. Both come from
 * compare_to_target, which reads the target state only and never the reference sequence, so
 * a search using it stays inside what the benchmark gives a solver.
 */
// v1: the score compare_to_target already computes -- layers short, plus the NUMBER of ranks
// that disagree. It is a counting score, so two candidates whose layers all disagree tie at
// the maximum and the ordering between them is noise. Measured, it ranks the correct fold
// only 5-39% better than random, and worse than blind search on mid-0003.
const heuristicV1 = (layers, target) => {
  const c = compareToTarget(layers, target, 2);
  return Math.max(0, target.length - layers.length) + (c.mismatched_ranks?.length ?? 0);
};

// v2: the same idea made continuous. Instead of asking HOW MANY ranks disagree, ask BY HOW
// MUCH. Two candidates that both mismatch every rank still differ in how close their layers
// are to the target's, and that difference is what an ordering needs.
//
// Three geometric terms, all cheap and all scale-free:
//   area      per rank, |area(now) - area(target)|, summed. A fold that produces layers of
//             the right sizes is closer than one that does not, even when nothing lines up.
//   centroid  per rank, the distance between layer centroids after aligning both stacks on
//             their own overall centroid, so a pure translation costs nothing.
//   count     layers still to be created, which is the part v1 already had right.
// Ranks are compared bottom-up as far as the shorter stack goes; the stacks are compared in
// both directions and the better one kept, because terminalMatch accepts a turnover.
const polyArea = poly => {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
};
const polyCentroid = poly => {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
};
const stackCentroid = layers => {
  const cs = layers.map(l => polyCentroid(l.poly));
  return [cs.reduce((s, c) => s + c[0], 0) / cs.length, cs.reduce((s, c) => s + c[1], 0) / cs.length];
};

const heuristicV2 = (layers, target) => {
  const short = Math.max(0, target.length - layers.length);
  const oc = stackCentroid(layers), tc = stackCentroid(target);
  const score = (reversed) => {
    const mine = reversed ? [...layers].reverse() : layers;
    const depth = Math.min(mine.length, target.length);
    let s = 0;
    for (let i = 0; i < depth; i++) {
      const a = mine[i], b = target[i];
      s += Math.abs(polyArea(a.poly) - polyArea(b.poly));
      const ca = polyCentroid(a.poly), cb = polyCentroid(b.poly);
      s += Math.hypot((ca[0] - oc[0]) - (cb[0] - tc[0]), (ca[1] - oc[1]) - (cb[1] - tc[1]));
      if (a.par !== b.par) s += 0.05;   // a parity flip is a real difference, but a small one
    }
    return s / Math.max(1, depth);
  };
  // `short` dominates: a stack with the wrong number of layers is further away than any
  // arrangement of the right number, and the geometry breaks ties inside a layer count.
  return short + Math.min(score(false), score(true));
};

const heuristic = (layers, target, version) => {
  // Each fold at most doubles the layers, so log2(target/now) folds are still REQUIRED --
  // an admissible lower bound, independent of either score and far too weak on its own.
  const floor = layers.length > 0 ? Math.log2(Math.max(1, target.length / layers.length)) : 0;
  return {score: version === 1 ? heuristicV1(layers, target) : heuristicV2(layers, target),
          admissible_floor: Math.ceil(floor)};
};

function probeHeuristic(id, {cp, target, actions}) {
  const rows = [];
  const started = Date.now();
  for (let d = 0; d < actions.length; d++) {
    if ((Date.now() - started) / 1000 > budget) break;
    const session = replay(cp, actions.slice(0, d).map(a => ({...a})));
    const listed = enumerateLegalFolds(session, opts).legal_folds;
    if (!listed.length) { rows.push({d, n: 0, rank: null}); continue; }
    // Score every child, and find where the reference's own next state lands.
    const wanted = stateKey(replay(cp, actions.slice(0, d + 1).map(a => ({...a}))).layers);
    // The enumerator merges actions that reach the same paper up to a rigid motion and
    // returns one representative, so the reference's own next state often sits under an
    // entry's equivalent_actions rather than its representative. Matching only the
    // representative silently drops those steps -- on easy-0001 it found 1 of 4. An entry
    // counts as "the reference move" if ANY of its spellings reaches the reference state.
    const scored = [];
    for (const e of listed) {
      let key = null, isRef = false;
      for (const spelling of [e.action, ...(e.equivalent_actions ?? [])]) {
        const v = tryFold(session.paper, cp, {tool: 'apply_fold', ...spelling});
        if (!v.ok) continue;
        const k = stateKey(currentPolys(v.fold.state));
        if (key === null) key = k;
        if (k === wanted) { isRef = true; break; }
      }
      if (key === null) continue;
      // Score the representative: it is the node a search would actually expand.
      const v0 = tryFold(session.paper, cp, {tool: 'apply_fold', ...e.action});
      if (!v0.ok) continue;
      scored.push({isRef, ...heuristic(currentPolys(v0.fold.state), target, hVersion)});
    }
    scored.sort((a, b) => a.score - b.score);
    const rank = scored.findIndex(s => s.isRef) + 1;
    rows.push({d, n: scored.length, rank: rank || null,
               floor: heuristic(currentPolys(session.paper), target, hVersion).admissible_floor,
               remaining: actions.length - d});
  }
  return rows;
}

/* ======================= PROBE 3: can zero-progress folds be pruned? ======================
 * The enumerator already reports new_crease_length -- how much crease a fold lays down that
 * the sequence has not laid down already. A fold with zero is legal and on-target but adds
 * nothing to the crease pattern being reproduced. Pruning those would cut the branching for
 * free, but only if no reference solution ever needs one. That is directly checkable.
 */
function probeZeroProgress(id, {cp, actions}) {
  let listedTotal = 0, listedZero = 0, refZero = 0;
  const started = Date.now();
  for (let d = 0; d < actions.length; d++) {
    if ((Date.now() - started) / 1000 > budget) break;
    const session = replay(cp, actions.slice(0, d).map(a => ({...a})));
    const listed = enumerateLegalFolds(session, opts).legal_folds;
    listedTotal += listed.length;
    listedZero += listed.filter(e => e.new_crease_length <= 2e-6).length;
    // Does the reference's own next fold make new crease?
    const v = tryFold(session.paper, cp, {tool: 'apply_fold', ...actions[d]});
    if (v.ok) {
      const made = v.fold.made.reduce((s, c) => s + Math.hypot(c.Q[0] - c.P[0], c.Q[1] - c.P[1]), 0);
      if (made <= 2e-6) refZero++;
    }
  }
  return {listedTotal, listedZero, refZero,
          prunable_share: listedTotal ? listedZero / listedTotal : 0};
}

/* ======================= PROBE 4: how much structure is there to abstract? ================
 * A pleat is several parallel folds at evenly spaced offsets. Treating one as a single macro
 * move divides the DEPTH, and depth sits in the exponent, so dividing it by three beats any
 * constant speedup. The probe asks what fraction of each reference sequence belongs to a run
 * of folds sharing a line direction at regularly spaced offsets.
 */
function probePleats(id, {folds}) {
  const dir = f => f.angle_index ?? Math.round((f.angle_deg ?? 0) * 1e6) / 1e6;
  const groups = new Map();
  folds.forEach((f, i) => {
    const k = String(dir(f));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({i, offset: f.offset});
  });
  let inRun = 0;
  const runs = [];
  for (const [k, items] of groups) {
    if (items.length < 3) continue;
    const off = items.map(x => x.offset).sort((a, b) => a - b);
    // Longest stretch of equal consecutive gaps: an arithmetic progression of offsets.
    let best = 1, cur = 1;
    for (let i = 2; i < off.length; i++) {
      const g1 = off[i] - off[i - 1], g0 = off[i - 1] - off[i - 2];
      cur = Math.abs(g1 - g0) < 1e-6 ? cur + 1 : 1;
      best = Math.max(best, cur + 1);
    }
    if (best >= 3) { inRun += best; runs.push(`dir ${k}: ${best} folds`); }
  }
  return {folds: folds.length, inRun, share: inRun / folds.length, runs};
}

/* ======================= PROBE 5: how much symmetry is there to quotient out? =============
 * A symmetry of the crease pattern maps solutions to solutions. If g is one of the square's
 * eight dihedral motions and the CP maps to itself under g, then folding along g(line) at
 * every step produces g(state) at every step, and g(final) satisfies terminalMatch because
 * that test already allows a rigid motion and a turnover. So the whole subtree under a fold
 * is isomorphic to the subtree under its g-image, and exploring one of each orbit is exact --
 * no solution is lost.
 *
 * This is the only prune that bites at the TOP of the tree, where the target-state heuristic
 * has no signal because every candidate is equally far from the target. It is also exact,
 * unlike a heuristic, so it costs nothing in solution quality.
 *
 * Two kinds of symmetry count. One preserves the M/V labels. The other swaps them, which is
 * the paper turned over -- also fine, because terminalMatch accepts a turnover.
 *
 * The probe reports the group size and then the thing that actually matters: at depth 1, how
 * many of the legal folds are distinct once the orbits are collapsed.
 */
const SQUARE_MOTIONS = [
  {name: 'identity',   f: ([x, y]) => [x, y]},
  {name: 'rot90',      f: ([x, y]) => [1 - y, x]},
  {name: 'rot180',     f: ([x, y]) => [1 - x, 1 - y]},
  {name: 'rot270',     f: ([x, y]) => [y, 1 - x]},
  {name: 'flip-x',     f: ([x, y]) => [1 - x, y]},
  {name: 'flip-y',     f: ([x, y]) => [x, 1 - y]},
  {name: 'diag',       f: ([x, y]) => [y, x]},
  {name: 'antidiag',   f: ([x, y]) => [1 - y, 1 - x]},
];

function probeSymmetry(id, {cp, target, actions}) {
  const q = v => Math.round(v / 2e-6);
  const edgeKey = (a, b, assign) => {
    const ka = `${q(a[0])},${q(a[1])}`, kb = `${q(b[0])},${q(b[1])}`;
    return (ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`) + `#${assign}`;
  };
  const creaseSet = (swap) => {
    const s = new Set();
    cp.edges_vertices.forEach((e, i) => {
      const a = cp.edges_assignment[i];
      if (a !== 'M' && a !== 'V') return;
      s.add(edgeKey(cp.vertices_coords[e[0]], cp.vertices_coords[e[1]],
                    swap ? (a === 'M' ? 'V' : 'M') : a));
    });
    return s;
  };
  const base = creaseSet(false);
  const kept = [];
  for (const m of SQUARE_MOTIONS) {
    for (const swap of [false, true]) {
      const mapped = new Set();
      cp.edges_vertices.forEach((e, i) => {
        const a = cp.edges_assignment[i];
        if (a !== 'M' && a !== 'V') return;
        mapped.add(edgeKey(m.f(cp.vertices_coords[e[0]]), m.f(cp.vertices_coords[e[1]]),
                           swap ? (a === 'M' ? 'V' : 'M') : a));
      });
      const same = mapped.size === base.size && [...mapped].every(k => base.has(k));
      if (same) { kept.push(m.name + (swap ? ' +MV-swap' : '')); break; }
    }
  }

  // What it buys at depth 1: collapse the legal folds into orbits under the kept motions.
  const root = new FoldSession(cp);
  const listed = enumerateLegalFolds({paper: root.paper, cp, creases: root.creases, actions: []}, opts).legal_folds;
  const orbits = new Map();
  const motions = SQUARE_MOTIONS.filter(m => kept.some(k => k.startsWith(m.name)));
  for (const e of listed) {
    const v = tryFold(root.paper, cp, {tool: 'apply_fold', ...e.action});
    if (!v.ok) continue;
    const layers = currentPolys(v.fold.state);
    // Canonical form: the smallest key over the symmetry group, so two folds in the same
    // orbit land on the same entry whichever one is seen first.
    const keys = motions.map(m => JSON.stringify(layers.map(l =>
      l.par + ':' + l.poly.map(p => { const g = m.f(p); return `${q(g[0])},${q(g[1])}`; }).sort().join(' ')).sort()));
    const canon = keys.sort()[0];
    orbits.set(canon, (orbits.get(canon) ?? 0) + 1);
  }
  return {group: kept, listed: listed.length, orbits: orbits.size};
}

/* ================================================================================= report */
for (const id of samples) {
  const task = load(id);
  console.log(`\n${id}  (reference ${task.actions.length} folds, selection_filter=${selection})`);

  if (!only || only === 1) {
    const r = probeBidirectional(id, task);
    console.log(`  [1] bidirectional   forward b=${r.b_forward.toFixed(2)} (new states per expansion)` +
                `  backward b=${r.b_backward.toFixed(2)} (mean in-degree, max ${r.max_in_degree})`);
    console.log(`      ${r.expanded} expanded, ${r.states} distinct states, ${r.edges} edges, to depth ${r.depth}`);
    const d = task.actions.length;
    const one = Math.pow(r.b_forward, d);
    const two = Math.pow(r.b_forward, d / 2) + Math.pow(Math.max(1.01, r.b_backward), d / 2);
    console.log(`      nodes: one-directional ${one.toExponential(1)} -> bidirectional ${two.toExponential(1)}` +
                `  (${(one / two).toExponential(1)}x)`);
  }

  if (!only || only === 2) {
    const rows = probeHeuristic(id, task);
    const ranked = rows.filter(r => r.rank);
    const mean = ranked.reduce((s, r) => s + r.rank, 0) / Math.max(1, ranked.length);
    const top1 = ranked.filter(r => r.rank === 1).length;
    const top3 = ranked.filter(r => r.rank <= 3).length;
    console.log(`  [2] heuristic v${hVersion}    reference fold ranks ${ranked.map(r => `${r.rank}/${r.n}`).join(' ')}`);
    console.log(`      mean rank ${mean.toFixed(2)} over ${ranked.length} steps;` +
                ` first ${top1}, top-3 ${top3}` +
                `  -> best-first behaves like branching ~${mean.toFixed(1)}`);
    const floors = rows.filter(r => r.floor != null);
    const admissible = floors.every(r => r.floor <= r.remaining);
    console.log(`      admissible floor log2(target/now) never exceeded the true remaining depth: ${admissible}`);
  }

  if (!only || only === 3) {
    const r = probeZeroProgress(id, task);
    console.log(`  [3] zero-progress   ${r.listedZero}/${r.listedTotal} listed folds add no new crease` +
                ` (${(100 * r.prunable_share).toFixed(0)}%);` +
                ` reference uses one ${r.refZero} time${r.refZero === 1 ? '' : 's'}` +
                `  -> ${r.refZero === 0 ? 'safe to prune' : 'NOT safe to prune'}`);
  }

  if (!only || only === 5) {
    const r = probeSymmetry(id, task);
    const factor = r.orbits ? r.listed / r.orbits : 1;
    console.log(`  [5] CP symmetry     group of ${r.group.length}: ${r.group.join(', ')}`);
    console.log(`      depth-1 legal folds ${r.listed} -> ${r.orbits} distinct orbits` +
                `  (${factor.toFixed(2)}x narrower at the top, exactly, losing no solution)`);
  }

  if (!only || only === 4) {
    const r = probePleats(id, task);
    console.log(`  [4] pleat structure ${r.inRun}/${r.folds} folds sit in an evenly spaced run` +
                ` (${(100 * r.share).toFixed(0)}%)${r.runs.length ? '  [' + r.runs.join('; ') + ']' : ''}`);
  }
}
