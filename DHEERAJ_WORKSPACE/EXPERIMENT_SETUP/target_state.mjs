// Rebuild a REAL engine state from (CP, final folded frame).
//
// WHY THIS FILE HAS TO EXIST
// --------------------------
// The forward search starts at `new FoldSession(cp)` -- a flat sheet, fully specified. A
// reverse search has to start at the target, and the target as the corpus stores it is not a
// state this engine can run on.
//
// `foldedState` (workspace/corpus/planarize.mjs) builds the final frame from the folded
// polygons ALONE: a fresh vertex index, faces_vertices into that index, and `fo:faces_layer`
// written as [0,1,2,...] because the array order IS the stack order. Nothing in the frame
// records which part of the original sheet a face is, and nothing records the isometry that
// put it where it sits. But `foldLayers` needs exactly those two things -- `poly` in ORIGINAL
// sheet coordinates and the placement `T` -- because tear detection, the CP pull-back and
// crease naming are all decided in original coordinates.
//
// So the frame is not missing information that was thrown away; it is missing information
// that is DERIVABLE, and this file derives it. No search and no reference sequence:
//
//   1. cpFaces     the CP is a planar graph; walk its half-edges into faces. Those polygons
//                  ARE the original-sheet coordinates, exactly.
//   2. flatLayout  fold the CP flat by propagation, not by search: root face gets T = ID, and
//                  crossing any M/V crease reflects in that crease's image and flips parity.
//                  A flat-foldable CP makes this consistent, and the consistency is checked
//                  rather than assumed.
//   3. targetState the layout is correct only up to one whole-sheet motion (and a global
//                  parity flip, since the root's true side is unknown). Pin both by aligning
//                  onto the frame, then read the stack order off `fo:faces_layer`.
//
// The result is checked with `terminalMatch` -- the same relation that decides `solved` for
// the forward search -- so a reconstruction that is wrong is reported as a failure and never
// silently searched from.
import {lineOf, ap, mul, inv, ID, reflectT, area, boundaryLoop} from '../../workspace/corpus/geom.mjs';
import {cleanPoly, samePolygon, frameLayers, terminalMatch} from './terminal_match.mjs';

const EPS = 1e-7;
const ekey = (u, w) => (u < w ? `${u},${w}` : `${w},${u}`);

/* ------------------------------------------------------------------ 1. CP -> faces ----- */

// Faces of the CP as a planar graph.
//
// The standard half-edge walk: sort each vertex's neighbours counterclockwise, and from a
// directed edge u->v continue with v->w where w is the neighbour of v immediately CLOCKWISE
// from u. That keeps the face interior on the left, so interior faces come out with positive
// area and the single outer walk comes out negative -- which is how the outer face is
// identified, rather than by guessing at the largest one.
export function cpFaces(cp) {
  const V = cp.vertices_coords.map(p => [p[0], p[1]]);
  const nb = V.map(() => []);
  cp.edges_vertices.forEach(([u, w]) => { nb[u].push(w); nb[w].push(u); });
  for (let v = 0; v < V.length; v++) {
    nb[v].sort((x, y) => Math.atan2(V[x][1] - V[v][1], V[x][0] - V[v][0]) -
                         Math.atan2(V[y][1] - V[v][1], V[y][0] - V[v][0]));
  }
  const nextOf = (u, v) => {
    const ring = nb[v], i = ring.indexOf(u);
    if (i === -1) throw Error(`CP graph is inconsistent at vertex ${v}`);
    return ring[(i - 1 + ring.length) % ring.length];
  };
  const seen = new Set(), faces = [];
  for (const [a, b] of cp.edges_vertices) {
    for (const [u0, v0] of [[a, b], [b, a]]) {
      if (seen.has(`${u0}>${v0}`)) continue;
      const loop = [u0];
      let u = u0, v = v0;
      for (let guard = 0; guard <= cp.edges_vertices.length * 2 + 2; guard++) {
        seen.add(`${u}>${v}`);
        if (v === u0 && nextOf(u, v) === v0) break;
        loop.push(v);
        const w = nextOf(u, v);
        u = v; v = w;
      }
      if (loop.length < 3) continue;
      const poly = loop.map(i => V[i]);
      // Negative area is the outer walk. There is exactly one, and it is not a face.
      if (area(poly) > EPS) faces.push({verts: loop, poly});
    }
  }
  return faces;
}

/* -------------------------------------------------------------- 2. lay the CP out flat -- */

// Every CP face placed in the plane, with its parity, by propagating reflections across
// creases. Correct up to one whole-sheet motion; `targetState` pins that motion.
//
// `consistent` is the closing check: every crease, including the ones BFS did not travel, must
// relate its two faces by the reflection in that crease. A CP that does not fold flat fails
// here rather than producing a plausible-looking wrong layout.
export function flatLayout(cp) {
  const faces = cpFaces(cp);
  const assignment = new Map();
  cp.edges_vertices.forEach(([u, w], i) => assignment.set(ekey(u, w), cp.edges_assignment[i]));

  // edge -> the (at most two) faces carrying it
  const across = new Map();
  faces.forEach((f, fi) => {
    for (let i = 0; i < f.verts.length; i++) {
      const k = ekey(f.verts[i], f.verts[(i + 1) % f.verts.length]);
      if (!across.has(k)) across.set(k, []);
      across.get(k).push(fi);
    }
  });

  // The reflection carrying face `fi` across CP edge `k`, in CURRENT coordinates.
  const mirrorFor = (fi, k, T) => {
    const [u, w] = k.split(',').map(Number);
    const line = lineOf(ap(T, cp.vertices_coords[u]), ap(T, cp.vertices_coords[w]));
    return line && reflectT(line.n, line.d);
  };

  const placed = faces.map(() => null);
  placed[0] = {T: ID, par: 0};
  const queue = [0];
  while (queue.length) {
    const fi = queue.shift();
    const {T, par} = placed[fi];
    const f = faces[fi];
    for (let i = 0; i < f.verts.length; i++) {
      const k = ekey(f.verts[i], f.verts[(i + 1) % f.verts.length]);
      const a = assignment.get(k);
      if (a !== 'M' && a !== 'V') continue;            // B is the outline; F cannot occur here
      const other = (across.get(k) ?? []).find(j => j !== fi);
      if (other === undefined || placed[other]) continue;
      const R = mirrorFor(fi, k, T);
      if (!R) continue;
      placed[other] = {T: mul(R, T), par: 1 - par};
      queue.push(other);
    }
  }
  if (placed.some(p => !p)) throw Error('CP creases do not connect every face; cannot lay it out');

  // Closing check on EVERY crease, travelled or not.
  let consistent = true;
  for (const [k, sides] of across) {
    const a = assignment.get(k);
    if ((a !== 'M' && a !== 'V') || sides.length !== 2) continue;
    const [x, y] = sides;
    const R = mirrorFor(x, k, placed[x].T);
    if (!R) { consistent = false; continue; }
    const want = mul(R, placed[x].T), got = placed[y].T;
    if (['a', 'b', 'c', 'd', 'e', 'f'].some(q => Math.abs(want[q] - got[q]) > 1e-6)) consistent = false;
  }
  return {faces: faces.map((f, i) => ({poly: f.poly, T: placed[i].T, par: placed[i].par})), consistent};
}

/* ------------------------------------------------- 3. pin the motion against the frame -- */

// The isometry sending a1->b1 and a2->b2, mirrored first when asked, as a matrix rather than
// the closure terminal_match.mjs builds -- this one has to compose with face transforms.
function isometryFrom(a1, a2, b1, b2, mirror) {
  const s = mirror ? -1 : 1;
  const ax = a2[0] - a1[0], ay = s * (a2[1] - a1[1]);
  const bx = b2[0] - b1[0], by = b2[1] - b1[1];
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < EPS || Math.abs(la - lb) > 2e-6) return null;
  const cos = (ax * bx + ay * by) / (la * lb), sin = (ax * by - ay * bx) / (la * lb);
  const a = cos, b = -sin * s, c = sin, d = cos * s;
  return {a, b, c, d, e: b1[0] - (a * a1[0] + b * a1[1]), f: b1[1] - (c * a1[0] + d * a1[1])};
}

/**
 * A runnable engine state for the target: {faces: [{poly, T, inv, par}], order}.
 *
 * `poly` is the CP face in ORIGINAL sheet coordinates, `T` places it where the frame says, and
 * `order` is bottom to top. This is the same shape `initSheet` produces and the same shape
 * `foldLayers` consumes, so every existing verifier runs on it unchanged.
 *
 * Throws only on a malformed CP; a failure to reconcile with the frame is REPORTED, because a
 * reverse search must never start from a target it merely thinks it has understood.
 */
export function targetState(cp, targetFrame) {
  const layout = flatLayout(cp);
  const want = frameLayers(targetFrame);
  const notes = {cp_faces: layout.faces.length, frame_faces: want.length,
                 layout_consistent: layout.consistent};
  if (layout.faces.length !== want.length) {
    return {state: null, ...notes, ok: false,
            reason: `CP has ${layout.faces.length} faces, the target frame has ${want.length}`};
  }

  const here = layout.faces.map(f => ({poly: f.poly, par: f.par, cur: f.poly.map(p => ap(f.T, p))}));
  const anchor = cleanPoly(want[0].poly);
  const anchorArea = Math.abs(area(anchor));
  let attempts = 0;

  // Which layout face sits at which frame rank, for a proposed motion, or null.
  const rankOrder = (g, flip) => {
    const moved = here.map(h => ({par: h.par ^ flip, cur: g ? h.cur.map(p => ap(g, p)) : h.cur}));
    const taken = new Array(here.length).fill(false);
    const order = [];
    for (let rank = 0; rank < want.length; rank++) {
      const hit = moved.findIndex((m, i) => !taken[i] && m.par === want[rank].par &&
                                            samePolygon(m.cur, want[rank].poly));
      if (hit === -1) return null;
      taken[hit] = true; order.push(hit);
    }
    return order;
  };
  const build = (g, flip, order, how) => {
    const faces = layout.faces.map(f => {
      const T = g ? mul(g, f.T) : f.T;
      return {poly: f.poly, T, inv: inv(T), par: f.par ^ flip};
    });
    return {state: {faces, order}, ...notes, ok: true, placement: how, alignments_tried: attempts};
  };

  // TRY THE IDENTITY FIRST, AND SAY WHICH CASE WON.
  //
  // The propagation in flatLayout is equivariant -- left-multiplying every transform by one
  // isometry gives another valid layout -- so the session's state and this layout differ by
  // exactly one motion. That motion is the identity whenever the layout's root face is one the
  // session never moved, which is common but NOT guaranteed: a face can be carried by every
  // fold, and then the true placement is a reflected copy of this one.
  //
  // It is worth trying first regardless, because the alternative is worse than untidy. A folded
  // model with a symmetry admits several motions that carry the layout onto the frame, and a
  // symmetric one builds a state that is a MOVED copy of the target. Its actions are then read
  // in a moved frame, and replaying them from a sheet at the origin does not repeat the fold --
  // it folds somewhere else. `placement` says which case this was, so the caller can renormalise
  // instead of silently searching in the wrong frame.
  {
    attempts++;
    const order = rankOrder(null, 0);
    if (order) return build(null, 0, order, 'identity');
  }

  // The layout is right up to one whole-sheet motion. It is pinned by carrying ONE face onto
  // the frame's bottom layer; every alignment of that face's vertex cycle is a proposal, and a
  // proposal counts only if it carries EVERY face onto a distinct frame layer of the same
  // parity. That is the same "one isometry must explain all of it" discipline terminalMatch
  // uses, applied to reconstruction instead of scoring.
  //
  // Keeping g in the transforms rather than quotienting it out is what makes the reverse search
  // replayable: the session this frame came from started at initSheet, T = ID, so a state
  // carrying g unfolds back to T = ID and its actions are read in the harness's own frame.
  for (let fi = 0; fi < here.length; fi++) {
    const from = cleanPoly(here[fi].cur);
    if (from.length !== anchor.length || Math.abs(Math.abs(area(from)) - anchorArea) > 2e-6) continue;
    for (const mirror of [false, true]) {
      for (let start = 0; start < anchor.length; start++) {
        for (const sign of [1, -1]) {
          const g = isometryFrom(from[0], from[1], anchor[start],
                                 anchor[(start + sign + anchor.length) % anchor.length], mirror);
          if (!g) continue;
          {
            // The global parity flip is NOT free: a face shows its far side exactly when its
            // placement reverses orientation, an invariant `initSheet` starts (par 0, det +1)
            // and every fold preserves (T <- R.T flips both). g carries the layout into the
            // session's own frame, so det g < 0 -- a mirrored alignment -- is precisely when
            // every parity flips. Enumerating the flip independently would admit states no
            // folding can reach, and they would look plausible on symmetric samples.
            const flip = mirror ? 1 : 0;
            attempts++;
            const order = rankOrder(g, flip);
            if (!order) continue;
            const made = build(g, flip, order, 'moved');
            // The closing check: the rebuilt state, read back out the way the harness reads any
            // state, must be the target under the harness's own relation.
            const back = order.map(i => {
              const f = made.state.faces[i];
              return {poly: f.poly.map(p => ap(f.T, p)), par: f.par};
            });
            if (!terminalMatch(back, want)) continue;
            return made;
          }
        }
      }
    }
  }
  return {state: null, ...notes, ok: false, alignments_tried: attempts,
          reason: 'no whole-sheet motion carries the CP layout onto the target frame'};
}

// The flat sheet in CP coordinates, for the reverse search's goal test.
export function sheetOf(cp) {
  const loop = boundaryLoop(cp.edges_vertices.filter((_, i) => cp.edges_assignment[i] === 'B'),
                            cp.vertices_coords);
  if (!loop) throw Error('CP has no valid boundary loop');
  return loop;
}
