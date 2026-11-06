// Terminal-state comparison, shared by the live harness (fold_tools.js) and by
// offline re-scoring. Browser-free on purpose: plain FOLD frames in, booleans out.
//
// A folded model is the same model wherever it happens to sit on the table.
// Which half of the sheet travels (move_positive) decides where the stack lands,
// so a correct fold sequence routinely reproduces the reference object
// translated, rotated or mirrored. terminalMatch quotients the plane isometry
// group out. Rotations preserve stack order and parity; reflections represent
// turning the object over, reversing the stack and flipping every face parity.
// One single isometry must carry every layer onto its reference counterpart.

const MATCH_TOL = 2e-6;

export function frameLayers(frame) {
  if (!frame?.faces_vertices?.length || !frame.vertices_coords?.length) throw Error('Final FOLD frame lacks geometry');
  return frame.faces_vertices.map((face, i) => ({
    poly: face.map(v => frame.vertices_coords[v].slice(0, 2)),
    par: frame['fo:faces_parity']?.[i] ?? 0,
    rank: frame['fo:faces_layer']?.[i] ?? i,
  })).sort((a, b) => a.rank - b.rank);
}

export function cleanPoly(poly) {
  let p = poly.filter((v, i) => Math.hypot(v[0] - poly[(i + 1) % poly.length][0], v[1] - poly[(i + 1) % poly.length][1]) > 1e-7);
  let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < 1e-9) { p.splice(i, 1); changed = true; break; }
    }
  }
  return p;
}

export function samePolygon(a, b) {
  a = cleanPoly(a); b = cleanPoly(b);
  if (a.length !== b.length) return false;
  return b.some((_, start) => [1, -1].some(sign => a.every((p, i) => {
    const q = b[(start + sign * i + b.length) % b.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) <= MATCH_TOL;
  })));
}

// The fixed-coordinate metric the pilot shipped with. Kept for comparison runs;
// terminalMatch is what scoring uses.
export function strictTerminalMatch(layers, target) {
  return layers.length === target.length && layers.every((l, i) =>
    l.par === target[i].par && samePolygon(l.poly, target[i].poly));
}

// The unique isometry sending a1 -> b1 and a2 -> b2, optionally composed with a
// reflection; null when the two segments have different lengths.
function isometry(a1, a2, b1, b2, mirror) {
  const ax = a2[0] - a1[0], ay = mirror ? -(a2[1] - a1[1]) : a2[1] - a1[1];
  const bx = b2[0] - b1[0], by = b2[1] - b1[1];
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < 1e-7 || Math.abs(la - lb) > MATCH_TOL) return null;
  const cos = (ax * bx + ay * by) / (la * lb), sin = (ax * by - ay * bx) / (la * lb);
  return point => {
    const x = point[0] - a1[0], y = mirror ? -(point[1] - a1[1]) : point[1] - a1[1];
    return [cos * x - sin * y + b1[0], sin * x + cos * y + b1[1]];
  };
}

export function terminalMatch(layers, target) {
  return terminalAlignment(layers, target, false) !== null;
}

// Identity-aware terminal match (equivalence relation E_id in the paper).
//
// terminalMatch (E_plane) asks whether the two stacks look the same: one plane isometry
// carries every current-plane polygon and parity onto the target's at the same rank. It
// never asks WHICH part of the original sheet each layer is. Two stacks can agree in the
// plane while a layer at some rank comes from a different region of the sheet, e.g. when
// two congruent flaps trade places. E_id additionally requires that, under the same
// alignment, the layer at every rank occupies the same original-sheet polygon as the
// target's layer at that rank. Sheet coordinates are the CP's own frame, which both
// constructions share, so they are compared directly, with no isometry.
//
// Each layer must carry `sheet` (its polygon in original-sheet coordinates); a layer
// without one makes the check fail closed rather than silently fall back to E_plane.
//
// `symmetries` (optional) are maps of the sheet onto itself that preserve the CP, including
// M/V assignments (see cpSymmetries). Folding the sheet relabelled by such a map yields an
// object no observer of the CP and the target can tell apart, so E_id accepts it: the
// candidate's sheet region at every rank must equal sigma(target region) for ONE sigma.
// The identity map is always included.
export function identityTerminalMatch(layers, target, symmetries = []) {
  if ([...layers, ...target].some(l => !Array.isArray(l.sheet))) return false;
  return [p => p, ...symmetries].some(sigma => terminalAlignment(layers,
    target.map(l => ({...l, sheet: l.sheet.map(sigma)})), true) !== null);
}

// The symmetries of the square sheet [x0,x1]x[y0,y1] (dihedral group D4 about its centre)
// that map the CP's crease set onto itself with assignments preserved. Identity excluded.
export function cpSymmetries(cp) {
  const xs = cp.vertices_coords.map(v => v[0]), ys = cp.vertices_coords.map(v => v[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  if (Math.abs((Math.max(...xs) - Math.min(...xs)) - (Math.max(...ys) - Math.min(...ys))) > MATCH_TOL) return [];
  const maps = [
    ([x, y]) => [cx - (y - cy), cy + (x - cx)], ([x, y]) => [2 * cx - x, 2 * cy - y],
    ([x, y]) => [cx + (y - cy), cy - (x - cx)], ([x, y]) => [2 * cx - x, y],
    ([x, y]) => [x, 2 * cy - y], ([x, y]) => [cx + (y - cy), cy + (x - cx)],
    ([x, y]) => [cx - (y - cy), cy - (x - cx)],
  ];
  const key = (p, q, a) => {
    const r = v => Math.round(v / 1e-5);
    const [s, t] = [`${r(p[0])},${r(p[1])}`, `${r(q[0])},${r(q[1])}`].sort();
    return `${a}:${s}:${t}`;
  };
  const edges = cp.edges_vertices.map((e, i) => [cp.vertices_coords[e[0]], cp.vertices_coords[e[1]],
    cp.edges_assignment[i]]).filter(e => e[2] === 'M' || e[2] === 'V');
  const base = new Set(edges.map(([p, q, a]) => key(p, q, a)));
  return maps.filter(m => edges.every(([p, q, a]) => base.has(key(m(p), m(q), a))));
}

// Both checks in one pass, for audits: which alignment (if any) passed each relation.
export function terminalMatchDetail(layers, target, symmetries = []) {
  const plane = terminalAlignment(layers, target, false);
  const hasSheets = [...layers, ...target].every(l => Array.isArray(l.sheet));
  const strict = hasSheets ? terminalAlignment(layers, target, true) : null;
  return {plane_match: plane !== null, identity_strict_match: strict !== null,
    identity_match: hasSheets && identityTerminalMatch(layers, target, symmetries),
    identity_checked: hasSheets, cp_symmetries: symmetries.length,
    plane_alignment: plane, identity_alignment: strict};
}

// Layers of a live FoldSession with their original-sheet polygons attached, bottom to top.
export function sessionLayers(session) {
  const {paper} = session;
  return session.layers.map((l, rank) => ({...l, sheet: paper.faces[paper.order[rank]].poly}));
}

// Returns {mirror, start, sign} for the first alignment that satisfies the relation, else null.
// Every alignment is tried before giving up, so E_id is not hostage to the first E_plane hit:
// a symmetric stack can admit several plane alignments, only some of them identity-preserving.
function terminalAlignment(layers, target, identity) {
  if (!layers.length || layers.length !== target.length) return null;
  // Every alignment of the first layer's vertex cycle, direct and mirrored,
  // proposes one isometry; a proposal counts only if it carries all layers.
  for (const mirror of [false, true]) {
    const aligned = mirror ? [...layers].reverse().map(l => ({...l, par: 1 - l.par})) : layers;
    if (aligned.some((l, i) => l.par !== target[i].par)) continue;
    const from = cleanPoly(aligned[0].poly), onto = cleanPoly(target[0].poly);
    if (from.length !== onto.length || from.length < 2) continue;
    for (let start = 0; start < onto.length; start++) {
      for (const sign of [1, -1]) {
        const b2 = onto[(start + sign + onto.length) % onto.length];
        const T = isometry(from[0], from[1], onto[start], b2, mirror);
        if (T && aligned.every((l, i) => samePolygon(l.poly.map(T), target[i].poly)
            && (!identity || samePolygon(l.sheet, target[i].sheet)))) return {mirror, start, sign};
      }
    }
  }
  return null;
}

export function framesMatch(candidateFrame, targetFrame) {
  return terminalMatch(frameLayers(candidateFrame), frameLayers(targetFrame));
}

export const TERMINAL_METRIC =
  'Polygon, parity and bottom-to-top layer equality under a single plane isometry ' +
  '(arbitrary translation and rotation; reflections reverse stack order and flip every parity)';

export const IDENTITY_TERMINAL_METRIC = TERMINAL_METRIC +
  '; additionally, under that same isometry, every layer occupies the same original-sheet polygon ' +
  'as the target layer at its rank';
