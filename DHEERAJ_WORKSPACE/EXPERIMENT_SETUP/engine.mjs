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

// Decode saved corpus/experiment folds into the same action API used live.
export function actionFromFold(fold) {
  const action = {tool: 'apply_fold', move_positive: fold.move_positive ?? fold.movePositive,
    over: fold.over ?? true};
  if (fold.angle_index != null) Object.assign(action, {angle_index: fold.angle_index, offset: fold.offset});
  else if (fold.angle_degrees != null) Object.assign(action, {angle_degrees: fold.angle_degrees, offset: fold.offset});
  else {
    const line = fold.line ?? {n: fold.normal, d: fold.offset};
    if (!Array.isArray(line.n) || line.n.length !== 2 || !line.n.every(Number.isFinite) ||
        !Number.isFinite(line.d) || Math.hypot(...line.n) === 0) throw Error('Invalid saved fold line');
    action.angle_degrees = Math.atan2(-line.n[0], line.n[1]) * 180 / Math.PI;
    action.offset = line.d / Math.hypot(...line.n);
  }
  const selection = fold.selection ?? fold.sel ?? {mode: fold.selection_mode ?? 'all', k: fold.layer_count};
  action.selection_mode = selection.mode;
  if (selection.mode !== 'all') action.layer_count = selection.k;
  return parseAction(JSON.stringify(action));
}

const LEGALITY_DETAILS = {
  'would-tear': 'Selected moving paper is attached to stationary paper away from the fold line. Moving it would tear that connection. Change the selected run or fold line.',
  'direction-impossible': 'A top run must fold over; a bottom run must fold under.',
  'nothing-to-move': 'The chosen half-plane contains no selected paper to move.',
  'no-crease': 'The proposed action creates no crease in the selected paper.',
};

// Segment coverage rather than edge identity: planarization may split a crease differently.
// Collect every CP edge collinear with this segment, projected onto it.
function collinearEdges(segment, cp) {
  const dx = segment.Q[0] - segment.P[0], dy = segment.Q[1] - segment.P[1];
  const length = Math.hypot(dx, dy);
  if (length <= TOL) return null;
  const ux = dx / length, uy = dy / length, edges = [];
  cp.edges_vertices.forEach((edge, i) => {
    const points = edge.map(v => cp.vertices_coords[v]);
    if (points.some(p => Math.abs((p[0] - segment.P[0]) * uy - (p[1] - segment.P[1]) * ux) > TOL)) return;
    const values = points.map(p => (p[0] - segment.P[0]) * ux + (p[1] - segment.P[1]) * uy).sort((a, b) => a - b);
    edges.push({assignment: cp.edges_assignment[i], lo: values[0], hi: values[1], points});
  });
  const at = t => [segment.P[0] + ux * t, segment.P[1] + uy * t];
  return {length, edges, at};
}

// The parts of [0, length] that the given intervals leave uncovered.
export function gapsIn(intervals, length) {
  const spans = intervals.map(({lo, hi}) => [Math.max(0, lo), Math.min(length, hi)])
      .filter(([lo, hi]) => hi > lo + TOL).sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cursor = 0;
  for (const [lo, hi] of spans) {
    if (lo > cursor + TOL) gaps.push([cursor, lo]);
    cursor = Math.max(cursor, hi);
    if (cursor >= length - TOL) break;
  }
  if (cursor < length - TOL) gaps.push([cursor, length]);
  return gaps;
}

const show = p => `(${p[0].toFixed(6)}, ${p[1].toFixed(6)})`;

// Say exactly which part of a proposed crease the CP does not contain, and why: a missing
// crease and an inverted M/V assignment call for different repairs, so they are named apart.
// Coordinates are original-sheet coordinates, the same frame as the supplied CP.
export function diagnoseSegment(segment, cp) {
  const info = collinearEdges(segment, cp);
  if (!info) return {problem: 'degenerate', message: 'The proposed crease has zero length.'};
  const {length, edges, at} = info;
  const gaps = gapsIn(edges.filter(e => e.assignment === segment.a), length);
  if (!gaps.length) return null;
  const uncovered = gaps.map(([lo, hi]) => {
    const other = edges.find(e => e.assignment !== segment.a && e.hi > lo + TOL && e.lo < hi - TOL);
    return {from: at(lo), to: at(hi), length: hi - lo,
            cp_assignment_here: other ? other.assignment : null};
  });
  const conflicts = uncovered.filter(u => u.cp_assignment_here);
  const problem = conflicts.length === uncovered.length ? 'assignment_conflict'
      : edges.length ? 'partly_missing' : 'absent';
  const first = uncovered[0];
  const message = problem === 'assignment_conflict'
      ? `This fold creases ${segment.a} from ${show(first.from)} to ${show(first.to)}, but the CP has ` +
        `${first.cp_assignment_here} there. The line is right and the direction is wrong: flip over, ` +
        `or move the other side of the line, so this crease comes out ${first.cp_assignment_here}.`
      : problem === 'absent'
      ? `The CP has no crease anywhere on this line. This fold would crease ${segment.a} from ` +
        `${show(segment.P)} to ${show(segment.Q)}, in original sheet coordinates. Move the fold line ` +
        `onto a line that the CP actually contains.`
      : `The CP crease on this line covers only part of this fold. The CP has nothing from ` +
        `${show(first.from)} to ${show(first.to)}, so folding here would crease unfolded paper. ` +
        `Fold fewer layers, or reach this crease after the layers it crosses are already folded away.`;
  return {problem, assignment: segment.a, from: segment.P, to: segment.Q, length,
          uncovered, message,
          cp_creases_on_this_line: edges.slice(0, 8)
              .map(e => ({assignment: e.assignment, from: at(e.lo), to: at(e.hi)}))};
}

export function segmentCovered(segment, cp) {
  const info = collinearEdges(segment, cp);
  return Boolean(info) && !gapsIn(info.edges.filter(e => e.assignment === segment.a), info.length).length;
}

// The whole fold verifier, as a pure function of (paper state, CP, action).
//
// This is deliberately the ONLY place a fold is judged. FoldSession.apply is this plus a
// commit, and the enumerator in legal_folds.mjs is this run over generated candidates, so a
// listed fold cannot be one that add_fold would then reject: there is no second opinion to
// disagree with. Nothing here mutates `paper` -- foldLayers copies faces and order -- so a
// caller may probe thousands of candidates against a live state without cloning it.
//
// Returns the rejection object verbatim, ok:false, in the shape the model already sees, or
// {ok: true, fold} carrying foldLayers' {state, made, moved, over} for the caller to commit.
export function tryFold(paper, cp, action) {
  parseAction(JSON.stringify(action));
  if (action.tool !== 'apply_fold') throw Error('apply expects apply_fold');
  const mode = action.selection_mode ?? 'all';
  const stackSize = paper.order.length;
  if (mode !== 'all' && action.layer_count > stackSize)
    return {ok: false, error: 'invalid-selection',
      detail: `layer_count exceeds the current stack size: asked for ${action.layer_count} ${mode} layers, the stack has ${stackSize}`,
      requested_layer_count: action.layer_count, stack_size: stackSize};
  const selection = mode === 'all' ? {mode} : {mode, k: action.layer_count};
  // Check material connectivity before target-CP compatibility. A tear must
  // remain a tear diagnostic even when the requested crease is also off-target.
  const r = foldLayers(paper, actionLine(action), action.move_positive, selection, action.over);
  if (r.error) return {ok: false, error: r.error,
    detail: [LEGALITY_DETAILS[r.error] ?? r.error, r.diagnostic?.why].filter(Boolean).join(' '),
    ...(r.between ? {between_faces: r.between} : {}),
    ...(r.diagnostic ? {diagnostic: r.diagnostic} : {})};
  const offending = r.made.map((c, i) => {
    const d = diagnoseSegment(c, cp);
    return d && {crease_index: i, ...d};
  }).filter(Boolean);
  if (offending.length) {
    return {ok: false, error: 'OUTSIDE_TARGET_CP',
      detail: 'Candidate makes a crease segment or M/V assignment absent from the input CP. ' +
        `${offending.length} of ${r.made.length} crease segments are off-target. ` + offending[0].message,
      creases_proposed: r.made.length, creases_off_target: offending.length,
      coordinate_frame: 'original sheet coordinates, the same frame as the supplied CP',
      // Every proposed crease is listed with its own repair, not just the first failure.
      off_target_creases: offending.slice(0, 6),
      proposed_creases: r.made.map(c => ({assignment: c.a, from: c.P, to: c.Q}))};
  }
  return {ok: true, fold: r};
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
    const verdict = tryFold(this.paper, this.cp, action);
    if (!verdict.ok) return verdict;
    const r = verdict.fold;
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
