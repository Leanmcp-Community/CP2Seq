// The fold replay kernel: seq.json in, a stack of layers per step out.
//
// This is the generator's own algebra (workspace/corpus/fold-engine.mjs + geom.mjs): a fold is
// an angle index plus an offset, the moving half is clipped off, reflected by an exact matrix,
// its internal order reversed, and dropped on top (over) or underneath (under). Replaying it
// here gives every in-between pose the shipped frames cannot, so the flap can actually swing;
// steps.fold is then the check that the replay landed where the dataset says it should.
// Shared by corpus.js in the browser and workspace/check-viewer-replay.mjs under node.
const EPS = 1e-7;
const ANGLE_DEG = [0, 45, 90, 135];

/* ---------- the four exact fold lines, straight from fold-engine.mjs ---------- */
function lineSpec(ai, off) {
  switch (ai) {
    case 0: return {n: [0, 1], off, R: {a: 1, b: 0, c: 0, d: -1, e: 0, f: 2 * off}};
    case 1: return {n: [-1, 1], off, R: {a: 0, b: 1, c: 1, d: 0, e: -off, f: off}};
    case 2: return {n: [1, 0], off, R: {a: -1, b: 0, c: 0, d: 1, e: 2 * off, f: 0}};
    case 3: return {n: [1, 1], off, R: {a: 0, b: -1, c: -1, d: 0, e: off, f: off}};
  }
  throw Error('Unknown angle index ' + ai);
}
function unitView(spec) {
  const L = Math.hypot(spec.n[0], spec.n[1]);
  const n = [spec.n[0] / L, spec.n[1] / L];
  return {n, d: spec.off / L, dir: [-n[1], n[0]]};
}
const ap = (M, p) => [M.a * p[0] + M.b * p[1] + M.e, M.c * p[0] + M.d * p[1] + M.f];
function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
// Half-plane clip. Slivers are dropped by area, as the generator does, so a layer that merely
// touches the fold line is not counted on both sides.
function clip(poly, n, d, keepPositive) {
  const side = p => (n[0] * p[0] + n[1] * p[1] - d) * (keepPositive ? 1 : -1);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const sa = side(A), sb = side(B);
    if (sa >= -EPS) out.push(A);
    if ((sa > EPS && sb < -EPS) || (sa < -EPS && sb > EPS)) {
      const t = sa / (sa - sb);
      out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]);
    }
  }
  return out.length >= 3 && Math.abs(area(out)) > 1e-12 ? out : null;
}

/* ---------- replay seq.json into a stack per step, plus what moves at each step ---------- */
function replay(seq) {
  let layers = [{poly: [[0, 0], [1, 0], [1, 1], [0, 1]], par: 0}];
  const states = [layers], steps = [];
  for (const fold of (seq?.folds || [])) {
    const ai = Number.isInteger(fold.angle_index) ? fold.angle_index : ANGLE_DEG.indexOf(fold.angle_deg);
    const spec = lineSpec(ai, fold.offset), uv = unitView(spec);
    const stay = [], move = [];
    layers.forEach((lay, i) => {
      const keep = clip(lay.poly, uv.n, uv.d, !fold.move_positive);
      const go = clip(lay.poly, uv.n, uv.d, fold.move_positive);
      if (keep) stay.push({poly: keep, par: lay.par, r0: i});
      if (go) move.push({pre: go, poly: go.map(p => ap(spec.R, p)), par: 1 - lay.par, par0: lay.par, r0: i});
    });
    move.reverse();                                   // flipping a stack turns it upside down
    const next = fold.over ? [...stay, ...move] : [...move, ...stay];
    next.forEach((lay, k) => {lay.r1 = k;});
    // Swing the flap up when the fold goes over, down when it goes under. Either way the
    // half-turn lands exactly on the reflection, so t=1 equals the stored state.
    const sigma = (fold.move_positive ? 1 : -1) * (fold.over ? 1 : -1);
    steps.push({fold, uv, sigma, stay, move});
    layers = next.map(lay => ({poly: lay.poly, par: lay.par}));
    states.push(layers);
  }
  return {states, steps};
}

// Rotate a flat point around the fold line by theta, out of the plane. theta = +-PI reproduces
// the reflection exactly, so the animation ends on the replayed state rather than near it.
function swing(p, uv, theta) {
  const {n, d, dir} = uv;
  const ax = n[0] * d, ay = n[1] * d;
  const wx = p[0] - ax, wy = p[1] - ay;
  const along = wx * dir[0] + wy * dir[1], across = wx * n[0] + wy * n[1];
  const c = Math.cos(theta), s = Math.sin(theta);
  return [ax + dir[0] * along + n[0] * across * c, ay + dir[1] * along + n[1] * across * c, across * s];
}

/* ---------- checking the replay against the shipped frames ---------- */
function verify(replayed, stepsFold) {
  const frames = stepsFold?.file_frames;
  if (!Array.isArray(frames) || !frames.length) return {ok: null, text: 'steps.fold carries no frames to check against.'};
  if (frames.length !== replayed.states.length) {
    return {ok: false, text: `Replay made ${replayed.states.length} states, steps.fold ships ${frames.length}.`};
  }
  for (let i = 0; i < frames.length; i++) {
    const want = (frames[i]['fo:faces_layer'] || frames[i].faces_vertices || []).length;
    if (want !== replayed.states[i].length) {
      return {ok: false, text: `Layer count differs at step ${i}: replay ${replayed.states[i].length}, steps.fold ${want}.`};
    }
  }
  const last = frames.at(-1);
  const shipped = box2(last.vertices_coords || []), mine = box2(replayed.states.at(-1).flatMap(l => l.poly));
  const slip = Math.max(...[0, 1, 2, 3].map(i => Math.abs(shipped[i] - mine[i])));
  if (!(slip < 1e-6)) return {ok: false, text: `Final silhouette differs from steps.fold by ${slip.toExponential(1)}.`};
  return {ok: true, text: `Replay matches steps.fold: ${frames.length} states, final silhouette within 1e-6.`};
}
function box2(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  return [x0, y0, x1, y1];
}


export { ANGLE_DEG, lineSpec, unitView, ap, area, clip, replay, swing, verify, box2 };
