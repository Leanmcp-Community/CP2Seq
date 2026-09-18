// Terminal-state comparison, shared by the live harness (fold_tools.js) and by
// offline re-scoring. Browser-free on purpose: plain FOLD frames in, booleans out.
//
// A folded model is the same model wherever it happens to sit on the table.
// Which half of the sheet travels (move_positive) decides where the stack lands,
// so a correct fold sequence routinely reproduces the reference object
// translated, rotated or mirrored. terminalMatch quotients the plane isometry
// group out: layer count, bottom-to-top order and per-layer parity must still
// agree exactly, and one single isometry must carry every layer polygon onto its
// reference counterpart.

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
  if (layers.length !== target.length) return false;
  if (layers.some((l, i) => l.par !== target[i].par)) return false;
  const from = cleanPoly(layers[0].poly), onto = cleanPoly(target[0].poly);
  if (from.length !== onto.length || from.length < 2) return false;
  // Every alignment of the first layer's vertex cycle, direct and mirrored,
  // proposes one isometry; a proposal counts only if it carries all layers.
  for (const mirror of [false, true]) {
    for (let start = 0; start < onto.length; start++) {
      for (const sign of [1, -1]) {
        const b2 = onto[(start + sign + onto.length) % onto.length];
        const T = isometry(from[0], from[1], onto[start], b2, mirror);
        if (T && layers.every((l, i) => samePolygon(l.poly.map(T), target[i].poly))) return true;
      }
    }
  }
  return false;
}

export function framesMatch(candidateFrame, targetFrame) {
  return terminalMatch(frameLayers(candidateFrame), frameLayers(targetFrame));
}

export const TERMINAL_METRIC =
  'Polygon, parity and bottom-to-top layer equality under a single plane isometry ' +
  '(translation, rotation or mirror); position and handedness are quotiented out';
