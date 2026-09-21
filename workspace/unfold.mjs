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

      // The two junction vertices may be artefacts of the cut, or they may be corners the
      // polygon already had -- a fold line often runs exactly through existing vertices, and
      // in easy-0001's first fold both endpoints are pre-existing boundary points that lie
      // collinear with their neighbours. Collinearity therefore cannot decide it, and
      // guessing wrong makes the rebuilt face differ from the real predecessor in its vertex
      // list while matching it in shape. So do not guess: offer every variant and let the
      // verification fold decide, since only the true one reproduces the state exactly.
      return variants(out, [vkey(a1), vkey(a0)]);
    }
  }
  return null;
}

// Up to four polygons: keep or drop each junction vertex, dropping only where the vertex is
// genuinely redundant (collinear with its neighbours).
function variants(poly, keys) {
  const idx = keys.map(k => poly.findIndex(p => vkey(p) === k)).filter(i => i >= 0);
  const droppable = idx.filter(i => {
    const p = poly[(i - 1 + poly.length) % poly.length], q = poly[i], r = poly[(i + 1) % poly.length];
    return Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) <= TOL;
  });
  const out = [poly];
  for (let mask = 1; mask < (1 << droppable.length); mask++) {
    const drop = new Set(droppable.filter((_, b) => mask & (1 << b)));
    const v = poly.filter((_, i) => !drop.has(i));
    if (v.length >= 3) out.push(v);
  }
  return out;
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
const canonicalPoly = poly => {
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

export const stateKey = paper =>
  JSON.stringify(currentPolys(paper).map(l => l.par + ':' + canonicalPoly(l.poly)));

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
        let facesets = [faces];
        for (const si of rest) {
          let matched = null;
          for (const mi of movingIdx) {
            if (consumed.has(mi)) continue;
            if (!sameTransform(faces[mi].T, faces[si].T) || faces[mi].par !== faces[si].par) continue;
            const unions = mergeAlongSharedEdge(faces[si].poly, faces[mi].poly);
            if (!unions) continue;
            matched = {mi, unions};
            break;
          }
          if (matched) {
            consumed.add(matched.mi);
            // Capped hard: the variants exist only for junction vertices the cut may have
            // invented, and letting them multiply across faces exhausted the heap.
            facesets = facesets.slice(0, 4).flatMap(fs => matched.unions.slice(0, 2).map(u => {
              const copy = fs.map(f => ({...f}));
              copy[si] = {...copy[si], poly: u};
              return copy;
            }));
          }
          order.push(si);
        }
        // Whole faces that moved rejoin at the end. Their position among the stationary
        // layers is unobservable -- they do not overlap them -- so any placement folds to
        // the same state, which the swap test confirmed 20 times out of 20.
        for (const mi of movingIdx) if (!consumed.has(mi)) order.push(mi);
        if (!order.length) continue;

        for (const fs of facesets.slice(0, 8)) {
          const pred = {faces: fs, order};
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
