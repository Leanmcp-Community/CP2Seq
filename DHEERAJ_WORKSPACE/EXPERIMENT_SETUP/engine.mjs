// Reuse the corpus engine directly; no search, Python bridge, or reference-action hints.
import { lineSpec } from '../../workspace/corpus/fold-engine.mjs';
import { initSheet, foldLayers, currentPolys } from '../../workspace/corpus/fold-engine-layers.mjs';
import { boundaryLoop } from '../../workspace/corpus/geom.mjs';
import { planarize, sequenceFile } from '../../workspace/corpus/planarize.mjs';
import { creaseGeometry, pairsUp, TOL } from '../../workspace/corpus/crease-compare.mjs';

export const SAMPLE_IDS = ['easy-0194', 'easy-0016', 'easy-0052', 'easy-0058', 'easy-0061',
  'easy-0143', 'easy-0001', 'easy-0082', 'easy-0100', 'easy-0139'];
export const ACTION_SCHEMA = {
  apply_fold: {tool: 'apply_fold', angle_index: 'integer 0..3', offset: 'finite number',
    angle_degrees: 'alternative to angle_index: line angle counterclockwise from +x',
    selection_mode: 'all (default), top, or bottom', layer_count: 'positive integer for top/bottom',
    move_positive: 'boolean', over: 'boolean', explanation: 'optional short string'},
  finish: {tool: 'finish', explanation: 'optional short string'},
};
export const SYSTEM = `Recover a folding sequence for the supplied crease pattern (CP).
You start with a flat sheet and may make 180-degree simple folds of all layers
or a contiguous top/bottom run. Partial folds that tear connected paper are rejected.
Return exactly one JSON object, no markdown, per turn. Available local tools:
${JSON.stringify(ACTION_SCHEMA)}
Line definitions in CURRENT coordinates: 0: y=offset; 1: y=x+offset;
2: x=offset; 3: x+y=offset. move_positive selects the side where respectively
 y-offset, -x+y-offset, x-offset, or x+y-offset is positive. over=true lands on top.
The engine computes every moved layer. Coordinates use x right, y up.
Instead of angle_index, angle_degrees specifies any line angle theta with unit
normal (-sin(theta), cos(theta)); offset is its signed perpendicular distance.
selection_mode defaults to all; top/bottom requires layer_count, with over=true
for top and over=false for bottom. Do not separate connected paper off the hinge.
Images have three panels: left CP (red M, blue V, black boundary), middle top view,
right oblique view with exaggerated layer separation (not physical paper thickness).
Current coordinates and layer order are also provided as JSON. The CP panel is fixed;
state panels are fitted independently; use numeric coordinates to choose offsets.
Read each tool result before your next proposal. Errors do not change the state.
No extra creases or contradictory M/V assignments are allowed. Call finish only when
all requested creases have been reproduced. You are not given the reference sequence.
An explanation is optional and is not a request for private internal reasoning.`;

export function parseAction(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  const a = JSON.parse(cleaned);
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw Error('Expected one JSON object');
  const fields = a.tool === 'finish' ? ['tool', 'explanation'] :
    ['tool', 'angle_index', 'angle_degrees', 'offset', 'move_positive', 'over',
      'selection_mode', 'layer_count', 'explanation'];
  if (Object.keys(a).some(k => !fields.includes(k))) throw Error('Unknown action field');
  if (a.explanation !== undefined && typeof a.explanation !== 'string') throw Error('explanation must be a string');
  if (a.tool === 'finish') return a;
  const indexed = a.angle_index !== undefined, angled = a.angle_degrees !== undefined;
  const mode = a.selection_mode ?? 'all';
  if (a.tool !== 'apply_fold' || indexed === angled ||
      (indexed && (!Number.isInteger(a.angle_index) || a.angle_index < 0 || a.angle_index > 3)) ||
      (angled && (typeof a.angle_degrees !== 'number' || !Number.isFinite(a.angle_degrees))) ||
      !['all', 'top', 'bottom'].includes(mode) ||
      (mode === 'all' ? a.layer_count !== undefined : (!Number.isInteger(a.layer_count) || a.layer_count < 1)) ||
      typeof a.offset !== 'number' || !Number.isFinite(a.offset) ||
      typeof a.move_positive !== 'boolean' || typeof a.over !== 'boolean') {
    throw Error('Use exactly one of angle_index (0..3) or finite angle_degrees, finite offset, move_positive/over booleans, and all or top/bottom with positive layer_count');
  }
  return a;
}

export function actionLine(action) {
  if (action.angle_index !== undefined) return {n: lineSpec(action.angle_index, action.offset).n, d: action.offset};
  const theta = (action.angle_degrees % 360) * Math.PI / 180;
  return {n: [-Math.sin(theta), Math.cos(theta)], d: action.offset};
}

const LEGALITY_DETAILS = {
  'would-tear': 'Selected moving paper is attached to stationary paper away from the fold line. Moving it would tear that connection. Change the selected run or fold line.',
  'direction-impossible': 'A top run must fold over; a bottom run must fold under.',
  'nothing-to-move': 'The chosen half-plane contains no selected paper to move.',
  'no-crease': 'The proposed action creates no crease in the selected paper.',
};

// Segment coverage rather than edge identity: planarization may split a crease differently.
export function segmentCovered(segment, cp) {
  const dx = segment.Q[0] - segment.P[0], dy = segment.Q[1] - segment.P[1];
  const length = Math.hypot(dx, dy);
  if (length <= TOL) return false;
  const ux = dx / length, uy = dy / length, intervals = [];
  cp.edges_vertices.forEach((edge, i) => {
    if (cp.edges_assignment[i] !== segment.a) return;
    const points = edge.map(v => cp.vertices_coords[v]);
    if (points.some(p => Math.abs((p[0] - segment.P[0]) * uy - (p[1] - segment.P[1]) * ux) > TOL)) return;
    const values = points.map(p => (p[0] - segment.P[0]) * ux + (p[1] - segment.P[1]) * uy).sort((a, b) => a - b);
    intervals.push(values);
  });
  intervals.sort((a, b) => a[0] - b[0]);
  let covered = 0;
  for (const [lo, hi] of intervals) {
    if (hi < covered - TOL) continue;
    if (lo > covered + TOL) break;
    covered = Math.max(covered, hi);
    if (covered >= length - TOL) return true;
  }
  return false;
}

export class FoldSession {
  constructor(cp) {
    this.cp = cp;
    this.sheet = boundaryLoop(cp.edges_vertices.filter((_, i) => cp.edges_assignment[i] === 'B'), cp.vertices_coords);
    if (!this.sheet) throw Error('CP has no valid boundary loop');
    this.paper = initSheet(this.sheet);
    this.layers = currentPolys(this.paper);
    this.creases = [];
    this.actions = [];
    this.states = [this.layers];
  }
  apply(action) {
    parseAction(JSON.stringify(action));
    if (action.tool !== 'apply_fold') throw Error('apply expects apply_fold');
    const mode = action.selection_mode ?? 'all';
    if (mode !== 'all' && action.layer_count > this.layers.length)
      return {ok: false, error: 'invalid-selection', detail: 'layer_count exceeds the current stack size'};
    const selection = mode === 'all' ? {mode} : {mode, k: action.layer_count};
    // Check material connectivity before target-CP compatibility. A tear must
    // remain a tear diagnostic even when the requested crease is also off-target.
    const r = foldLayers(this.paper, actionLine(action), action.move_positive, selection, action.over);
    if (r.error) return {ok: false, error: r.error, detail: LEGALITY_DETAILS[r.error] ?? r.error,
      ...(r.between ? {between_faces: r.between} : {})};
    if (r.made.some(c => !segmentCovered(c, this.cp))) {
      return {ok: false, error: 'OUTSIDE_TARGET_CP', detail: 'Candidate makes a crease segment or M/V assignment absent from the input CP'};
    }
    this.paper = r.state;
    this.layers = currentPolys(this.paper);
    this.creases.push(...r.made);
    this.actions.push(action);
    this.states.push(this.layers);
    return {ok: true, state_id: this.actions.length, created_segments: r.made.length};
  }
  observation() {
    return {state_id: this.actions.length, layers_bottom_to_top: this.layers.map((l, rank) => ({
      polygon: l.poly, parity: l.par, sheet_polygon: this.paper.faces[this.paper.order[rank]].poly}))};
  }
  evaluate() {
    const segments = this.sheet.map((P, i) => ({P, Q: this.sheet[(i + 1) % this.sheet.length], assignment: 'B'}));
    segments.push(...this.creases.map(c => ({P: c.P, Q: c.Q, assignment: c.a})));
    const got = creaseGeometry(planarize(segments).fold), want = creaseGeometry(this.cp);
    const cpMatch = got.length === want.length && pairsUp(got, want);
    return {cp_match: cpMatch, produced_segments: got.length, target_segments: want.length,
      terminal_reference_match: null, tolerance: TOL,
      validity_scope: 'Zero-thickness some-layers engine with original-sheet connectivity/tearing checks; exposed top/bottom runs only, no continuous collision simulation'};
  }
  sequence() { return sequenceFile(this.cp, this.states); }
}

export function replay(cp, actions) {
  const session = new FoldSession(cp);
  for (const action of actions) {
    const r = session.apply(action);
    if (!r.ok) throw Error(`Replay failed: ${r.error}`);
  }
  return session;
}
