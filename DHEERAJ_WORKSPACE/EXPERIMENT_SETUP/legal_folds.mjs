// Enumerate every fold that is legal RIGHT NOW: legal for the paper, and on-target for the CP.
//
// SOUNDNESS BY CONSTRUCTION
// -------------------------
// Nothing in this file decides whether a fold is legal. Every candidate is judged by
// `tryFold` from engine.mjs -- the same function `FoldSession.apply`, and therefore the
// `add_fold` tool and every offline replay, already use. There is no second verifier to
// disagree with the first, so a listed fold cannot be one that `add_fold` then rejects.
// The list is exactly the set of actions that pass the four named material checks
// (nothing-to-move, no-crease, direction-impossible, would-tear) plus OUTSIDE_TARGET_CP.
//
// WHY THE ACTION SPACE IS SMALL
// -----------------------------
// It is tempting to assume 2^layers selections. The engine does not permit that: a partial
// fold must be a CONTIGUOUS RUN at one extremity of the stack (fold-engine-layers.mjs), so
// the selections are `all`, `top k`, and `bottom k` -- about 2N of them, not 2^N. And `over`
// is forced for partials. The combinatorics live in the LINES instead, which is why lines are
// deduplicated twice below before a single fold is attempted.
//
// CANDIDATE LINES
// ---------------
// A legal fold may only crease where the CP already has a crease, so candidates come from the
// CP, never from a continuum. Faces carry their polygon in ORIGINAL SHEET coordinates plus the
// isometry T placing them in the current plane, and an action's line is read in CURRENT
// coordinates. So: take the distinct lines through the CP's M/V edges, push each one forward
// through each distinct face transform, and deduplicate again. On a box-pleated CP thousands
// of crease edges collapse to a few dozen lines, which is the only reason this is affordable.
import {tryFold, gapsIn} from './engine.mjs';
import {lineOf, lkey, mul, inv} from '../../workspace/corpus/geom.mjs';
import {TOL} from '../../workspace/corpus/crease-compare.mjs';

const EPS = 1e-9;
const DEFAULT_MAX_RESULTS = 40;
const MAX_EQUIVALENT_LISTED = 4;
const SELECTION_FILTERS = ['any', 'all', 'top', 'bottom'];
// Mirror the plane. Used only to canonicalise a turned-over placement, never to fold.
const MIRROR = {a: 1, b: 0, c: 0, d: -1, e: 0, f: 0};
// lineSpec's un-normalised normals, in angle_index order: y=off, y=x+off, x=off, x+y=off.
const INDEXED_NORMALS = [[0, 1], [-1, 1], [1, 0], [1, 1]];

// A line and its opposite normal are one line. Fix the sign so identical lines key identically.
function canonicalLine(n, d) {
  let [nx, ny] = n, dd = d;
  if (nx < -EPS || (Math.abs(nx) <= EPS && ny < 0)) { nx = -nx; ny = -ny; dd = -dd; }
  return {n: [nx, ny], d: dd, dir: [-ny, nx]};
}

// Composing reflections leaves arithmetic dust, and an offset shown to the model as
// -1.11e-16 instead of 0 invites it to copy the dust back into an action. Snap to a 1e-9
// grid -- three orders of magnitude below the 2e-6 tolerance.
//
// It has to happen on the EMITTED number, not on the internal unit-normal offset: an
// angle_index offset lives in lineSpec's un-normalised frame, so snapping the unit offset and
// then multiplying by |n| just puts the dust back (0.25 came out as 0.24999999958). Snapping
// here is also what keeps the guarantee intact, since the snapped action is the one tryFold
// judges and the one the model is handed.
const snap = v => Math.round(v * 1e9) / 1e9;

// Push an original-sheet line through an isometry T: p -> Ap + t. For orthogonal A the image
// normal is A n, and the offset picks up the translation.
function pushForward({n, d}, T) {
  const nn = [T.a * n[0] + T.b * n[1], T.c * n[0] + T.d * n[1]];
  return canonicalLine(nn, d + nn[0] * T.e + nn[1] * T.f);
}

function cpLines(cp) {
  const out = new Map();
  cp.edges_vertices.forEach((edge, i) => {
    const a = cp.edges_assignment[i];
    if (a !== 'M' && a !== 'V') return;
    const l = lineOf(cp.vertices_coords[edge[0]], cp.vertices_coords[edge[1]]);
    if (l) out.set(lkey(l), l);
  });
  return [...out.values()];
}

// Distinct placements, not distinct faces: after many folds a state has far more faces than
// orientations, and coincident faces generate the same candidate lines.
function faceTransforms(paper) {
  const round = v => Math.round(v / TOL) * TOL;
  const out = new Map();
  for (const i of paper.order) {
    const T = paper.faces[i].T;
    out.set([T.a, T.b, T.c, T.d, T.e, T.f].map(round).join(','), T);
  }
  return [...out.values()];
}

// Express one current-plane line as add_fold arguments. angle_index is preferred where it
// applies, because that is the form the corpus sequences use and the form action_compare
// scores against; any other angle falls back to angle_degrees.
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

// `all` first so that when several selections produce the identical folded state -- top N is
// all, and top k is all whenever layers below k sit entirely on the stationary side -- the
// representative kept is the simplest one to read and to fold by hand.
function selections(stackSize, filter) {
  const want = mode => filter === 'any' || filter === mode;
  const out = [];
  if (want('all')) for (const over of [true, false]) out.push({selection_mode: 'all', over});
  for (let k = 1; k < stackSize; k++) {
    if (want('top')) out.push({selection_mode: 'top', layer_count: k, over: true});
    if (want('bottom')) out.push({selection_mode: 'bottom', layer_count: k, over: false});
  }
  return out;
}

// WHEN ARE TWO RESULTS THE SAME MOVE?
//
// Not "the folded shapes look alike". `terminalMatch` would say yes to that, and it is the
// wrong relation here: it compares current-plane polygons and parity only, so two states it
// calls equal can hold DIFFERENT parts of the sheet in the same places. Every future fold is
// checked against the CP by pulling its line back into original-sheet coordinates through each
// face's T, so such a pair accepts different future folds. Merging them would delete reachable
// branches -- silently, and only on the samples where it matters.
//
// The relation used instead: same paper, same stacking order, differing by one rigid motion of
// the whole sheet. Rank by rank, the same ORIGINAL-SHEET polygon, and T'[i] = g . T[i] for one
// common g. That is strictly stronger than terminalMatch, so a merge can never hide an option
// the engine could tell apart, and it is canonicalisable, so it stays a hash and not an O(k^2)
// pairwise search: normalise every transform by the inverse of the bottom layer's, which makes
// the key invariant under any global motion. `baseline_python/model.py` factors out the same
// whole-sheet motion for the same reason.
//
// Two normalisations are computed and the smaller kept, the second being the turnover -- mirror
// the plane, reverse the stack, flip every parity -- because that, and not a plain reflection,
// is what relates the two halves of a move_positive pair: with P and Q the two halves of the
// sheet and R the reflection in the fold line, moving P under gives the stack [R(P), Q] and
// moving Q under gives [R(Q), P], and those are turnovers of each other. Turnover is also
// exactly what terminalMatch already accepts as the same finished model.
function placementKey(state, turned) {
  const q = v => Math.round(v / TOL);
  const ranks = turned ? [...state.order].reverse() : state.order;
  const place = i => turned ? mul(MIRROR, state.faces[i].T) : state.faces[i].T;
  const g = inv(place(ranks[0]));
  return ranks.map(i => {
    const f = state.faces[i], T = mul(g, place(i));
    return (turned ? 1 - f.par : f.par) + ':' +
        f.poly.map(p => `${q(p[0])},${q(p[1])}`).join(' ') + ':' +
        [T.a, T.b, T.c, T.d, T.e, T.f].map(q).join(',');
  }).join('|');
}

// The creases are already frame-independent -- original sheet coordinates -- and are implied by
// the face subdivision above. They stay in the key as cheap insurance: a merge must never join
// two folds that write different M/V into the sequence. Endpoints are sorted so that the same
// segment cannot key two ways.
function effectKey(state, made) {
  const q = v => Math.round(v / TOL);
  const point = p => `${q(p[0])},${q(p[1])}`;
  const creases = made.map(c => c.a + ':' + [point(c.P), point(c.Q)].sort().join(':')).sort().join('|');
  const direct = placementKey(state, false), turned = placementKey(state, true);
  return `${direct < turned ? direct : turned}#${creases}`;
}

// How much crease this fold adds that the sequence has not already laid down. Folding an
// already-creased line is legal and often necessary, but it is not progress, and the model
// needs the list ordered by progress rather than by enumeration accident.
function newCreaseLength(made, existing) {
  let total = 0;
  for (const c of made) {
    const dx = c.Q[0] - c.P[0], dy = c.Q[1] - c.P[1], length = Math.hypot(dx, dy);
    if (length <= TOL) continue;
    const ux = dx / length, uy = dy / length;
    const covering = [];
    for (const e of existing) {
      if (e.a !== c.a) continue;
      const points = [e.P, e.Q];
      if (points.some(p => Math.abs((p[0] - c.P[0]) * uy - (p[1] - c.P[1]) * ux) > TOL)) continue;
      const values = points.map(p => (p[0] - c.P[0]) * ux + (p[1] - c.P[1]) * uy).sort((a, b) => a - b);
      covering.push({lo: values[0], hi: values[1]});
    }
    total += gapsIn(covering, length).reduce((sum, [lo, hi]) => sum + hi - lo, 0);
  }
  return total;
}

function readOptions(options) {
  const {max_results = DEFAULT_MAX_RESULTS, selection_filter = 'any',
         include_rejected = false} = options ?? {};
  if (!Number.isInteger(max_results) || max_results < 1) throw Error('max_results must be a positive integer');
  if (!SELECTION_FILTERS.includes(selection_filter))
    throw Error(`selection_filter must be one of ${SELECTION_FILTERS.join(', ')}`);
  if (typeof include_rejected !== 'boolean') throw Error('include_rejected must be a boolean');
  return {max_results, selection_filter, include_rejected};
}

/**
 * Every legal, on-target fold available from this session's current state.
 *
 * @param session  a FoldSession; it is READ ONLY here and is not advanced.
 * @param options  {max_results, selection_filter: any|all|top|bottom, include_rejected}
 */
export function enumerateLegalFolds(session, options) {
  const {max_results, selection_filter, include_rejected} = readOptions(options);
  const paper = session.paper, cp = session.cp;
  const stackSize = paper.order.length;

  const lines = new Map();
  const transforms = faceTransforms(paper);
  for (const line of cpLines(cp)) {
    for (const T of transforms) {
      const image = pushForward(line, T);
      lines.set(lkey(image), image);
    }
  }

  const choices = selections(stackSize, selection_filter);
  const byEffect = new Map();
  const rejected = new Map();
  let evaluated = 0;
  const note = (error, detail) => {
    const seen = rejected.get(error);
    if (seen) seen.count++;
    else rejected.set(error, {count: 1, example: detail});
  };

  for (const line of lines.values()) {
    const args = lineArguments(line);
    for (const choice of choices) {
      for (const move_positive of [true, false]) {
        const action = {tool: 'apply_fold', ...args, move_positive, ...choice};
        evaluated++;
        let verdict;
        // parseAction throws on a malformed action rather than returning; an emitted
        // candidate that cannot even be parsed is a generator bug, so it is counted
        // under its own heading instead of being silently dropped.
        try { verdict = tryFold(paper, cp, action); }
        catch (e) { note('unparseable-candidate', e.message); continue; }
        if (!verdict.ok) { note(verdict.error, verdict.detail); continue; }
        const {tool, ...emitted} = action;
        const key = effectKey(verdict.fold.state, verdict.fold.made);
        const already = byEffect.get(key);
        // Merged actions are listed, not just counted. Even if the quotient above were ever
        // wrong, the alternative spellings stay visible to the model rather than vanishing.
        if (already) {
          already.equivalent_action_count++;
          if (already.equivalent_actions.length < MAX_EQUIVALENT_LISTED) already.equivalent_actions.push(emitted);
          continue;
        }
        byEffect.set(key, {
          action: emitted,
          creates: verdict.fold.made.map(c => ({assignment: c.a, from: c.P, to: c.Q})),
          new_crease_length: newCreaseLength(verdict.fold.made, session.creases),
          layers_after: verdict.fold.state.order.length,
          equivalent_actions: [],
          equivalent_action_count: 1,
        });
      }
    }
  }

  const legal = [...byEffect.values()].sort((a, b) =>
      b.new_crease_length - a.new_crease_length || a.layers_after - b.layers_after);
  const shown = legal.slice(0, max_results);
  return {
    state_id: session.actions.length,
    stack_size: stackSize,
    candidate_lines: lines.size,
    actions_evaluated: evaluated,
    distinct_legal_folds: legal.length,
    returned: shown.length,
    truncated: shown.length < legal.length,
    ordering: 'most new crease length first, then fewest resulting layers',
    deduplication: 'Actions reaching the same paper in the same stacking order, up to one rigid ' +
      'motion of the whole sheet or a turnover, are one entry; the others are in equivalent_actions.',
    coordinate_frames: {action: 'current folded coordinates', creates: 'original sheet coordinates'},
    guarantee: 'Each listed action is accepted verbatim by add_fold while state_id is unchanged. ' +
      'Legality and CP compatibility are decided by the same verifier add_fold uses.',
    rejected_summary: Object.fromEntries([...rejected].map(([error, {count, example}]) =>
        [error, include_rejected ? {count, example} : count])),
    legal_folds: shown,
  };
}
