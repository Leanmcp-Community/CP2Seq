// Reuse the corpus engine directly; no search, Python bridge, or reference-action hints.
import { applyFold } from '../../workspace/corpus/fold-engine.mjs';
import { ID, boundaryLoop } from '../../workspace/corpus/geom.mjs';
import { planarize, sequenceFile } from '../../workspace/corpus/planarize.mjs';
import { creaseGeometry, pairsUp, TOL } from '../../workspace/corpus/crease-compare.mjs';

export const SAMPLE_IDS = ['easy-0194', 'easy-0016', 'easy-0052', 'easy-0058', 'easy-0061',
  'easy-0143', 'easy-0001', 'easy-0082', 'easy-0100', 'easy-0139'];
export const ACTION_SCHEMA = {
  apply_fold: {tool: 'apply_fold', angle_index: 'integer 0..3', offset: 'finite number',
    move_positive: 'boolean', over: 'boolean', explanation: 'optional short string'},
  finish: {tool: 'finish', explanation: 'optional short string'},
};
export const SYSTEM = `Recover a folding sequence for the supplied crease pattern (CP).
You start with a flat sheet and may make only all-layers 180-degree simple folds.
Return exactly one JSON object, no markdown, per turn. Available local tools:
${JSON.stringify(ACTION_SCHEMA)}
Line definitions in CURRENT coordinates: 0: y=offset; 1: y=x+offset;
2: x=offset; 3: x+y=offset. move_positive selects the side where respectively
 y-offset, -x+y-offset, x-offset, or x+y-offset is positive. over=true lands on top.
The engine computes every moved layer. Coordinates use x right, y up.
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
    ['tool', 'angle_index', 'offset', 'move_positive', 'over', 'explanation'];
  if (Object.keys(a).some(k => !fields.includes(k))) throw Error('Unknown action field');
  if (a.explanation !== undefined && typeof a.explanation !== 'string') throw Error('explanation must be a string');
  if (a.tool === 'finish') return a;
  if (a.tool !== 'apply_fold' || !Number.isInteger(a.angle_index) || a.angle_index < 0 || a.angle_index > 3 ||
      typeof a.offset !== 'number' || !Number.isFinite(a.offset) ||
      typeof a.move_positive !== 'boolean' || typeof a.over !== 'boolean') {
    throw Error('Expected apply_fold with angle_index 0..3, finite offset, move_positive and over booleans');
  }
  return a;
}

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
    this.layers = [{poly: this.sheet, T: ID, inv: ID, par: 0}];
    this.creases = [];
    this.actions = [];
    this.states = [this.layers];
  }
  apply(action) {
    parseAction(JSON.stringify(action));
    if (action.tool !== 'apply_fold') throw Error('apply expects apply_fold');
    const r = applyFold(this.layers, this.creases, action.angle_index, action.offset, action.move_positive, action.over);
    if (!r) return {ok: false, error: 'ENGINE_REJECTED', detail: 'No new crease, line misses paper, or crease-direction conflict'};
    if (r.made.some(c => !segmentCovered(c, this.cp))) {
      return {ok: false, error: 'OUTSIDE_TARGET_CP', detail: 'Candidate makes a crease segment or M/V assignment absent from the input CP'};
    }
    this.layers = r.layers;
    this.creases.push(...r.made);
    this.actions.push(action);
    this.states.push(this.layers);
    return {ok: true, state_id: this.actions.length, created_segments: r.made.length};
  }
  observation() {
    return {state_id: this.actions.length, layers_bottom_to_top: this.layers.map(l => ({polygon: l.poly, parity: l.par}))};
  }
  evaluate() {
    const segments = this.sheet.map((P, i) => ({P, Q: this.sheet[(i + 1) % this.sheet.length], assignment: 'B'}));
    segments.push(...this.creases.map(c => ({P: c.P, Q: c.Q, assignment: c.a})));
    const got = creaseGeometry(planarize(segments).fold), want = creaseGeometry(this.cp);
    const cpMatch = got.length === want.length && pairsUp(got, want);
    return {cp_match: cpMatch, produced_segments: got.length, target_segments: want.length,
      terminal_reference_match: null, tolerance: TOL,
      validity_scope: 'Replay under shared zero-thickness generator engine; not independent physical validation'};
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
