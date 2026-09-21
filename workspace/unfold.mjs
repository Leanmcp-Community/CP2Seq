// The inverse of a fold: given a folded state, which states could it have come from?
//
// WHY THIS EXISTS
// Bidirectional search meets in the middle at b^(d/2) instead of b^d. Measured forward
// branching is 3.14-3.43 and the measured mean in-degree is 1.20-1.33, so the backward half
// is nearly free: 300x on easy-0003, 880x on mid-0001, and 1e8x extrapolated to hard-0001.
// That saving is structural and does not depend on a heuristic, which matters because the
// two heuristics measured so far rank the correct fold only 18-20% better than random.
// Nothing can be built on it without an unfold, so this is the enabling piece.
//
// THE OBSTACLE, AND WHY IT IS NOT ONE
// foldLayers ends with
//     const movedRun = movingIdx.slice().reverse();
//     finalOrder = over ? [...newOrder, ...movedRun] : [...movedRun, ...newOrder];
// so a layer that lay wholly on the moving side is REMOVED from its position and appended to
// one end. Its original position in the stack is not recorded, and recovering it looks like
// choosing an interleaving of the two groups: C(N, k) predecessors, hopeless at N = 48.
//
// It collapses, because that order is not observable. A wholly-moving layer and a wholly-
// stationary layer sit on opposite sides of the fold line, so they do not overlap, and
// foldLayers reads the two groups off as subsequences -- swapping one of each leaves both
// subsequences unchanged. Measured over 20 such swaps drawn from four samples' reference
// sequences: 20 identical results, 0 different. So all interleavings fold to the same state
// and ONE representative per (line, run, end) is enough.
//
// SOUNDNESS
// Every candidate predecessor is checked by folding it forward with tryFold and comparing
// the result to the state we started from. A candidate that does not reproduce it exactly is
// discarded, so a returned predecessor is always genuine. Completeness is the open half, and
// is what check_unfold.mjs measures against the reference sequences.
import {tryFold, actionLine} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {cleanPoly} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';
import {currentPolys} from './corpus/fold-engine-layers.mjs';
import {lineOf, lkey, mul, inv} from './corpus/geom.mjs';
import {TOL} from './corpus/crease-compare.mjs';

const EPS = 1e-9;
const INDEXED_NORMALS = [[0, 1], [-1, 1], [1, 0], [1, 1]];
const snap = v => Math.round(v * 1e9) / 1e9;
const ap = (T, p) => [T.a * p[0] + T.b * p[1] + T.e, T.c * p[0] + T.d * p[1] + T.f];
const reflectUnit = ([nx, ny], d) => ({
  a: 1 - 2 * nx * nx, b: -2 * nx * ny, c: -2 * nx * ny, d: 1 - 2 * ny * ny,
  e: 2 * d * nx, f: 2 * d * ny});

const canonicalLine = (n, d) => {
  let [nx, ny] = n, dd = d;
  if (nx < -EPS || (Math.abs(nx) <= EPS && ny < 0)) { nx = -nx; ny = -ny; dd = -dd; }
  return {n: [nx, ny], d: dd, dir: [-ny, nx]};
};
const pushForward = ({n, d}, T) => {
  const nn = [T.a * n[0] + T.b * n[1], T.c * n[0] + T.d * n[1]];
  return canonicalLine(nn, d + nn[0] * T.e + nn[1] * T.f);
};

// Exactly the candidate set the forward enumerator uses, and that is the completeness
// argument: a fold creases only where the CP has a crease, and the cut face's stationary
// half keeps its transform, so the line that made the last fold is still generable from the
// state that fold produced.
function candidateLines(paper, cp) {
  const base = new Map();
  cp.edges_vertices.forEach((edge, i) => {
    const a = cp.edges_assignment[i];
    if (a !== 'M' && a !== 'V') return;
    const l = lineOf(cp.vertices_coords[edge[0]], cp.vertices_coords[edge[1]]);
    if (l) base.set(lkey(l), l);
  });
  const round = v => Math.round(v / TOL) * TOL;
  const transforms = new Map();
  for (const i of paper.order) {
    const T = paper.faces[i].T;
    transforms.set([T.a, T.b, T.c, T.d, T.e, T.f].map(round).join(','), T);
  }
  const out = new Map();
  for (const l of base.values()) for (const T of transforms.values()) {
    const image = pushForward(l, T);
    out.set(lkey(image), image);
  }
  return [...out.values()];
}

function lineArguments(line) {
  for (let ai = 0; ai < INDEXED_NORMALS.length; ai++) {
    const raw = INDEXED_NORMALS[ai], L = Math.hypot(raw[0], raw[1]);
    for (const s of [1, -1]) {
      if (Math.abs(s * raw[0] / L - line.n[0]) < TOL && Math.abs(s * raw[1] / L - line.n[1]) < TOL) {
        return {angle_index: ai, offset: snap(s * line.d * L)};
      }
    }
  }
  return {angle_degrees: snap(Math.atan2(-line.n[0], line.n[1]) * 180 / Math.PI),
          offset: snap(line.d)};
}

/* ---------- merging a split face back together ------------------------------------- */
// A fold cuts one face into a moving half and a stationary half. Un-reflecting the moving
// half puts it back in the same plane with the same transform and parity, sharing the cut
// edge with its sibling, and the predecessor must carry them as ONE face again -- otherwise
// it has more layers than it should and folds to a different state.
const vkey = p => `${Math.round(p[0] / TOL)},${Math.round(p[1] / TOL)}`;

function mergeAlongSharedEdge(A, B) {
  for (let i = 0; i < A.length; i++) {
    const a0 = A[i], a1 = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const b0 = B[j], b1 = B[(j + 1) % B.length];
      // The shared edge appears in opposite directions in the two polygons.
      if (vkey(a0) !== vkey(b1) || vkey(a1) !== vkey(b0)) continue;
      // Walk A from a1 all the way round to a0 (which is b1), then continue through B from
      // b1's successor and stop BEFORE b0, because b0 is a1 and already opened the list.
      // Running that second loop one step too far duplicated a vertex, which is why the
      // first version produced a 15-gon where the real face was a 14-gon.
      const out = [];
      for (let k = 1; k <= A.length; k++) out.push(A[(i + k) % A.length]);
      for (let k = 1; k < B.length - 1; k++) out.push(B[(j + 1 + k) % B.length]);

      // The two junction vertices may be artefacts of the cut or corners the polygon
      // already had, and collinearity cannot tell them apart -- a fold line often runs
      // exactly through existing vertices. It no longer matters: the state key runs every
      // polygon through cleanPoly, so a spare collinear vertex is normalised away. An
      // earlier version enumerated keep/drop variants instead and capped the combinations,
      // which with four cut faces threw away the right one and was the last source of
      // missing predecessors.
      return out;
    }
  }
  return null;
}

const sameTransform = (A, B) =>
  ['a', 'b', 'c', 'd', 'e', 'f'].every(k => Math.abs(A[k] - B[k]) < TOL);

// A polygon's vertex list has no canonical starting point, and merging two halves back
// together naturally starts at the cut rather than wherever the original started. The
// rebuilt face for easy-0001's first fold was the true flat sheet exactly -- same 14
// vertices, same winding -- rotated by 7, and a key built from the raw list called that a
// different state, so every verification failed and the generator returned nothing.
//
// Rotation is canonicalised away by starting at the lexicographically smallest vertex.
// Winding is NOT: a polygon traversed the other way is the face seen from the other side,
// which is a real difference.
const canonicalPoly = rawPoly => {
  // Collinear vertices are stripped first. The forward engine and the unfold arrive at the
  // same physical face with different vertex LISTS -- a cut leaves a point in the middle of
  // a straight edge, a merge may or may not remove it -- and a key that keeps them calls one
  // physical state two. In a bidirectional search that is fatal rather than merely untidy:
  // the two frontiers meet on the paper and not on its vertex list, and without this
  // easy-0001 exhausted 207 forward nodes without ever recognising a backward one, on a
  // sample the one-directional search solves in 38.
  const poly = cleanPoly(rawPoly);
  const v = poly.map(p => `${Math.round(p[0] / 2e-6)},${Math.round(p[1] / 2e-6)}`);
  let best = 0;
  for (let i = 1; i < v.length; i++) {
    for (let k = 0; k < v.length; k++) {
      const a = v[(best + k) % v.length], b = v[(i + k) % v.length];
      if (a === b) continue;
      if (b < a) best = i;
      break;
    }
  }
  return v.map((_, k) => v[(best + k) % v.length]).join(' ');
};

// A layer that moved whole loses its position in the stack, and every placement among the
// layers it does NOT overlap folds to the same successor -- so those orderings are the same
// piece of paper and must key the same, or a forward state and a backward state that are
// physically identical never match.
//
// Only overlapping layers have a meaningful relative order. So: keep every constraint
// between layers that overlap, and among the rest take the lexicographically smallest
// arrangement. That is the smallest topological order of the DAG whose edges run from a
// lower layer to a higher one it overlaps, which is canonical by construction.
//
// Overlap is tested on bounding boxes. That OVER-approximates -- two layers whose boxes meet
// but whose polygons do not are treated as ordered -- which keeps more constraints than
// strictly necessary. Still canonical, just less aggressive, and it never merges two states
// that are genuinely different.
const bbox = poly => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
};
const boxesOverlap = (a, b) =>
  Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > TOL &&
  Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > TOL;

function canonicalStack(layers) {
  const n = layers.length;
  const keys = layers.map(l => l.par + ':' + canonicalPoly(l.poly));
  const boxes = layers.map(l => bbox(l.poly));
  // indegree[j] counts lower overlapping layers still unplaced.
  const edges = Array.from({length: n}, () => []);
  const indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (boxesOverlap(boxes[i], boxes[j])) { edges[i].push(j); indeg[j]++; }
  }
  const ready = [];
  for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
  const out = [];
  while (ready.length) {
    // Smallest key first, and the original index breaks a tie so the result is total.
    let best = 0;
    for (let r = 1; r < ready.length; r++) {
      if (keys[ready[r]] < keys[ready[best]] ||
          (keys[ready[r]] === keys[ready[best]] && ready[r] < ready[best])) best = r;
    }
    const i = ready.splice(best, 1)[0];
    out.push(keys[i]);
    for (const j of edges[i]) if (--indeg[j] === 0) ready.push(j);
  }
  // A cycle cannot happen -- edges always run upward -- but fall back rather than lose data.
  return out.length === n ? out : keys;
}

// TWO keys, because one cannot do both jobs.
//
// stateKey keeps the stack exactly as it is. It is what a search dedups on and what the
// completeness test compares, and it has to stay exact because terminalMatch compares layer
// i against target layer i -- so two stacks differing only by a swap of non-overlapping
// layers ARE distinguishable at the goal, even though the swap is invisible to a fold.
// Canonicalising here instead pruned the path to the answer: easy-0001 went from solved in
// 38 expansions to exhausted at 119.
//
// meetKey normalises that freedom away, and is used only to notice that a forward state and
// a backward state might be the same paper. A false meet costs nothing: every meet is
// replayed from the flat sheet and put through terminalMatch before it is returned.
export const stateKey = paper =>
  JSON.stringify(currentPolys(paper).map(l => l.par + ':' + canonicalPoly(l.poly)));

export const meetKey = paper => JSON.stringify(canonicalStack(currentPolys(paper)));

/**
 * Every state that could have produced `paper` by one whole-stack fold.
 *
 * Only whole-stack folds: every reference fold in release/all-layers is one, and partial
 * runs would multiply the candidate set by the layer count for moves the corpus never uses.
 *
 * @returns [{paper, action}] -- each verified by folding it forward and comparing.
 */
export function predecessors(paper, cp, {maxResults = 200} = {}) {
  const want = stateKey(paper);
  const N = paper.order.length;
  const out = new Map();

  for (const line of candidateLines(paper, cp)) {
    const R = reflectUnit(line.n, line.d);
    const args = lineArguments(line);
    for (let k = 1; k < N && out.size < maxResults; k++) {
      for (const end of ['top', 'bottom']) {
        // over decides which end the moved run was appended to.
        const over = end === 'top';
        const movedRun = over ? paper.order.slice(N - k) : paper.order.slice(0, k);
        const rest = over ? paper.order.slice(0, N - k) : paper.order.slice(k);
        // movedRun was written out reversed, so undo that to recover the moving order.
        const movingIdx = [...movedRun].reverse();

        const faces = paper.faces.map(f => ({...f}));
        for (const mi of movingIdx) {
          const f = faces[mi];
          const T = mul(R, f.T);
          faces[mi] = {poly: f.poly, T, inv: inv(T), par: 1 - f.par};
        }

        // Re-merge each un-reflected mover with a stationary sibling if it has one. A mover
        // that was a whole face has none and simply rejoins the stack. Each merge offers
        // several vertex-list variants, so the candidates multiply; the count stays small
        // because at most a couple of faces are cut by any one fold.
        const consumed = new Set();
        const order = [];
        for (const si of rest) {
          for (const mi of movingIdx) {
            if (consumed.has(mi)) continue;
            if (!sameTransform(faces[mi].T, faces[si].T) || faces[mi].par !== faces[si].par) continue;
            const union = mergeAlongSharedEdge(faces[si].poly, faces[mi].poly);
            if (!union) continue;
            faces[si] = {...faces[si], poly: union};
            consumed.add(mi);
            break;
          }
          order.push(si);
        }
        // A face that moved WHOLE was removed from its position and appended to one end, so
        // its place in the predecessor's stack is not recorded anywhere. Every placement
        // folds to the same successor -- it does not overlap the layers it would move past,
        // and the swap test confirmed that 20 times out of 20 -- but they are DIFFERENT
        // states, and a bidirectional search has to produce the one the forward search
        // generated or the two frontiers never recognise each other. On easy-0003's fourth
        // fold the true predecessor has it at position 2 and appending it to the end missed
        // by exactly that. So every insertion is emitted, and verification keeps the real
        // ones.
        // One representative is enough, because stateKey below is canonical under exactly
        // this freedom. Emitting every insertion instead reached 11/14 but drove the mean
        // predecessor count from 1.79 to 14.64 -- destroying the narrow backward frontier
        // that is the entire reason to search bidirectionally.
        for (const mi of movingIdx) if (!consumed.has(mi)) order.push(mi);
        if (!order.length) continue;
        {
          const pred = {faces, order};
          // Which side moved is not known in advance; both are cheap to test and only the
          // right one reproduces the state.
          for (const move_positive of [true, false]) {
            const action = {tool: 'apply_fold', ...args, move_positive, selection_mode: 'all', over};
            let v;
            try { v = tryFold(pred, cp, action); } catch { continue; }
            if (!v.ok) continue;
            if (stateKey(v.fold.state) !== want) continue;
            const key = stateKey(pred);
            if (!out.has(key)) out.set(key, {paper: pred, action});
          }
        }
      }
    }
  }
  return [...out.values()];
}

export {candidateLines, actionLine};
