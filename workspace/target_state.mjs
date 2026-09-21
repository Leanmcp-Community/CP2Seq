// Rebuild the target as an ENGINE state, from the provenance the corpus now carries.
//
// A backward search needs the target the way the simulator holds it: faces in ORIGINAL sheet
// coordinates, each with the isometry placing it in the folded plane, plus the stacking
// order. The .fold target frame gives folded coordinates only, and shape cannot recover the
// rest -- every one of mid-0001's 128 folded faces is congruent to every other.
//
// THE SHORTCUT
// My first plan was to compute the CP's planar faces and propagate reflections across the
// face adjacency graph, which does determine every transform from the M/V assignment alone
// (verified: T_g = R(T_f) on 249 of 249 adjacent pairs). That turns out to be unnecessary.
// backfill_target_provenance.mjs writes each layer's ORIGINAL-sheet polygon, and the target
// frame already has the same layer's FOLDED polygon, vertex for vertex in the same order.
// Two corresponding vertices determine an isometry outright, so T falls out of the pair with
// no face subdivision and no propagation.
//
// WHAT THIS IS NOT
// The reconstructed state is the one the REFERENCE sequence produced. terminalMatch accepts
// any folding that looks the same, and measured on nine solved instances 2 of 9 reach the
// target with the paper arranged differently. So a backward search from here explores the
// pre-images of one particular target, which is sound and not complete -- fine for measuring
// what bidirectional search buys, and not a change to what the benchmark asks for.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {inv} from './corpus/geom.mjs';

const TOL = 2e-6;

// The isometry carrying the whole polygon `from` onto `onto`, vertex for vertex.
//
// Two points do NOT pick it out: a rotation and a reflection both send a1 to b1 and a2 to
// b2, and they differ everywhere else. Testing only the second point therefore accepts the
// first branch tried and fails at the third vertex, which is exactly what happened -- the
// faces here are mirrored (signed area +0.125 against -0.125) and the rotation was returned.
// So both branches are built and each is checked against EVERY vertex.
function isometryFrom(from, onto) {
  const [a1, a2] = from, [b1, b2] = onto;
  const ax = a2[0] - a1[0], ay = a2[1] - a1[1];
  const bx = b2[0] - b1[0], by = b2[1] - b1[1];
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < 1e-9 || Math.abs(la - lb) > TOL) return null;
  for (const mirror of [false, true]) {
    const mx = ax, my = mirror ? -ay : ay;
    const cos = (mx * bx + my * by) / (la * lb), sin = (mx * by - my * bx) / (la * lb);
    const T = mirror
      ? {a: cos, b: sin, c: sin, d: -cos, e: 0, f: 0}
      : {a: cos, b: -sin, c: sin, d: cos, e: 0, f: 0};
    T.e = b1[0] - (T.a * a1[0] + T.b * a1[1]);
    T.f = b1[1] - (T.c * a1[0] + T.d * a1[1]);
    if (from.every((p, k) => {
      const q = [T.a * p[0] + T.b * p[1] + T.e, T.c * p[0] + T.d * p[1] + T.f];
      return Math.hypot(q[0] - onto[k][0], q[1] - onto[k][1]) < TOL;
    })) return T;
  }
  return null;
}

const apply = (T, p) => [T.a * p[0] + T.b * p[1] + T.e, T.c * p[0] + T.d * p[1] + T.f];

/**
 * The target as {faces, order}, ready for tryFold and for predecessors().
 *
 * @param frame  the final file_frame, carrying fo:faces_sheet_polygon from the backfill
 * @returns {paper} or throws with the reason, so a corpus without the field says so plainly
 */
export function targetEngineState(frame) {
  const sheets = frame['fo:faces_sheet_polygon'];
  if (!Array.isArray(sheets)) {
    throw Error('target frame has no fo:faces_sheet_polygon; run workspace/backfill_target_provenance.mjs');
  }
  const order = [...frame.faces_vertices.keys()].sort(
    (i, j) => frame['fo:faces_layer'][i] - frame['fo:faces_layer'][j]);
  const faces = [];
  order.forEach((faceIndex, rank) => {
    const folded = frame.faces_vertices[faceIndex].map(v => frame.vertices_coords[v]);
    const sheet = sheets[rank];
    if (!sheet || sheet.length !== folded.length) {
      throw Error(`layer ${rank}: sheet polygon has ${sheet?.length} vertices, folded has ${folded.length}`);
    }
    const T = isometryFrom(sheet, folded);
    if (!T) throw Error(`layer ${rank}: no isometry carries the sheet polygon onto the folded one`);
    faces.push({poly: sheet, T, inv: inv(T), par: frame['fo:faces_parity'][faceIndex]});
  });
  return {faces, order: faces.map((_, i) => i)};
}

export function loadTargetState(sampleDir) {
  const steps = JSON.parse(readFileSync(join(sampleDir, 'steps.fold'), 'utf8'));
  return targetEngineState(steps.file_frames.at(-1));
}
