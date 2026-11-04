// Enumerate every fold that could have produced THIS state -- the reverse of legal_folds.mjs.
//
// SOUNDNESS BY CONSTRUCTION, THE SAME WAY, FOR A DIFFERENT REASON
// --------------------------------------------------------------
// Nothing here decides that an unfold is valid. This file PROPOSES a predecessor P and an
// action a; the pair is kept only when `tryFold(P, cp, a)` -- the one verifier `add_fold`,
// `FoldSession.apply` and `legal_folds.mjs` all already use -- accepts it AND the state it
// produces is bit-for-bit the state we started from. So a listed unfold is a real forward fold
// that a model could have made, judged by the same code that would judge the model.
//
// The burden is therefore the mirror image of the forward enumerator's. Forward, the risk is
// listing a fold that `add_fold` would reject, and delegating to `tryFold` removes it. Reverse,
// `tryFold` removes that risk just as completely, and what is left is COMPLETENESS: a
// predecessor never proposed is a solution silently lost. Every judgement call below is
// therefore made in the direction of proposing too much and letting the verifier discard it.
//
// WHY PROPOSING P IS THE HARD PART
// --------------------------------
// `foldLayers` destroys two things on the way forward, and both have to be put back:
//
//   SPLITTING.   A face the fold line crosses becomes two faces -- the stay part keeps its
//                rank, the move part is reflected away. Unfolding has to merge them back into
//                one polygon. Every face in this engine is convex (a square cut by half
//                planes), so the union of two pieces sharing a full edge is their convex hull,
//                and the hull is accepted only when its area equals the sum of the parts.
//
//   RESTACKING.  The moving run is reversed and moved to one extremity. Reading it back gives
//                the moving faces' relative pre-fold order for free. A face that was SPLIT is
//                also pinned to an absolute rank, because it rejoins its stay half. But a face
//                that moved WHOLLY (fold-engine-layers.mjs, the `!stayPoly` branch) left no
//                stay half behind, and its pre-fold rank is genuinely ambiguous. Those are
//                enumerated over every rank consistent with the ordering, rather than guessed.
//
// WHY THE SEARCH IS BOUNDED
// -------------------------
// A fold makes at least one crease, so it splits at least one face, so it strictly increases
// the layer count. Unfolding therefore strictly decreases it, and the reverse search has a
// depth bound of layers-minus-one read off the target itself. It terminates either at the flat
// sheet or in a proof that no sequence reaches it -- there is no timeout-shaped answer.
//
// WHAT "CANNOT BE UNFOLDED" MEANS HERE
// ------------------------------------
// A partial fold is always a CONTIGUOUS RUN AT AN EXTREMITY of the stack -- the action space
// has only `all`, `top k` and `bottom k`, and `over` is forced by which end. So a layer buried
// mid-stack cannot have been folded last, and a state where neither extremity reflects back
// cleanly has NO predecessor at all. That is not a failure: it is the reverse search's pruning
// signal, exactly as OUTSIDE_TARGET_CP is the forward search's.
import {tryFold} from './engine.mjs';
import {ap, mul, inv, lkey, reflectT, area} from '../../workspace/corpus/geom.mjs';
import {cleanPoly} from './terminal_match.mjs';
import {lineArguments} from './legal_folds.mjs';

const MAT = ['a', 'b', 'c', 'd', 'e', 'f'];
const SAME = 1e-6;
// The same 1e-9 grid legal_folds.mjs snaps emitted offsets to, for the same reason: reflection
// matrices carry ~2e-16 of arithmetic dust at 45 degrees (see geom.mjs), which is seven orders
// below this, while the geometry the key must distinguish is three orders above it.
const GRID = 1e-9;
const q = v => Math.round(v / GRID);

/* ------------------------------------------------------------------- state identity ----- */

// A polygon key that does not care how the engine happened to wind or start the vertex list:
// collinear points dropped, orientation fixed, cycle rotated to its least rotation.
function polyKey(poly) {
  let p = cleanPoly(poly);
  if (area(p) < 0) p = [...p].reverse();
  const s = p.map(v => `${q(v[0])},${q(v[1])}`);
  let best = null;
  for (let i = 0; i < s.length; i++) {
    const r = s.slice(i).concat(s.slice(0, i)).join(' ');
    if (best === null || r < best) best = r;
  }
  return best ?? '';
}

/**
 * Strict identity for a state: same paper, same placements, same stacking, same frame.
 *
 * Deliberately NOT `placementKey` from legal_folds.mjs and NOT `terminalMatch`. Both quotient
 * out a whole-sheet motion, which is right when asking "is this the same finished model" and
 * wrong here: the check this key performs is "did folding P actually land back on S", and S
 * sits at one definite place in one definite frame. Quotienting would let a predecessor that
 * refolds to a MOVED copy of S pass, and the path would not replay.
 */
export function exactKey(state) {
  return state.order.map(i => {
    const f = state.faces[i];
    return `${f.par}:${polyKey(f.poly)}:${MAT.map(k => q(f.T[k])).join(',')}`;
  }).join('|');
}

/* ----------------------------------------------------------------------- geometry ------- */

// Read a reflection back out of a matrix, or refuse. The composition T_move . T_stay^-1 of a
// split pair IS the fold's reflection, so this recovers the fold line exactly rather than
// hunting for it among candidate lines the way the forward enumerator must.
function asReflection(R) {
  if (Math.abs((R.a * R.d - R.b * R.c) + 1) > SAME) return null;   // a reflection has det -1
  if (Math.abs(R.b - R.c) > SAME) return null;                     // and is symmetric
  let nx = Math.sqrt(Math.max(0, (1 - R.a) / 2)), ny;
  if (nx > 1e-6) ny = -R.b / (2 * nx); else { nx = 0; ny = 1; }
  const L = Math.hypot(nx, ny);
  if (!(L > 1e-9)) return null;
  nx /= L; ny /= L;
  const d = (R.e * nx + R.f * ny) / 2;
  const check = reflectT([nx, ny], d);
  if (MAT.some(k => Math.abs(check[k] - R[k]) > SAME)) return null;
  return {n: [nx, ny], d};
}

const samePlacement = (A, B) => MAT.every(k => Math.abs(A[k] - B[k]) <= SAME);

// Convex hull, Andrew monotone chain. Every face here is convex, so two pieces sharing a full
// edge have their union equal to their hull -- and the area test below is what CHECKS that
// they really do share one, rather than merely sitting near each other.
function hull(points) {
  const p = [...points].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = src => {
    const st = [];
    for (const z of src) {
      while (st.length >= 2 && cross(st[st.length - 2], st[st.length - 1], z) <= 1e-12) st.pop();
      st.push(z);
    }
    return st;
  };
  const lo = build(p), hi = build([...p].reverse());
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

// The single face two split halves came from, or null when they are not two halves of one face.
function merge(a, b) {
  const u = hull([...a, ...b]);
  if (u.length < 3) return null;
  const want = Math.abs(area(a)) + Math.abs(area(b));
  return Math.abs(Math.abs(area(u)) - want) <= 1e-9 ? u : null;
}

/* ------------------------------------------------------- putting wholly-moved faces back -- */

// Non-decreasing slot sequences: `count` faces to drop into slots [lo, hi], order among them
// already fixed, several allowed to share a slot.
function slotRuns(lo, hi, count, cap) {
  const out = [];
  const rec = (i, from, acc) => {
    if (out.length >= cap) return;
    if (i === count) { out.push([...acc]); return; }
    for (let v = from; v <= hi && out.length < cap; v++) { acc.push(v); rec(i + 1, v, acc); acc.pop(); }
  };
  rec(0, lo, []);
  return out;
}

const product = (groups, cap) => groups.reduce((acc, g) =>
    acc.flatMap(a => g.map(b => [...a, b])).slice(0, cap), [[]]);

/* ------------------------------------------------------------------- the enumerator ----- */

/**
 * Every (predecessor, action) pair that folds forward onto `state`.
 *
 * @param state  {faces, order} -- a live engine state, NOT a FoldSession.
 * @param cp     the crease pattern, for `tryFold`.
 * @returns {unfolds, dead_end, proposed, rejected_summary}
 */
export function enumerateLegalUnfolds(state, cp, options = {}) {
  // No default truncation. A forward enumerator may cap its list because the model only reads
  // the top of it; this one feeds a search whose correctness depends on not losing a branch, so
  // the cap belongs to the caller that can afford it, never to the enumerator.
  const {max_placements = 64, max_results = Infinity} = options;
  const N = state.order.length;
  const goal = exactKey(state);
  const found = new Map();
  const rejected = new Map();
  let proposed = 0, truncated = 0;
  const note = why => rejected.set(why, (rejected.get(why) ?? 0) + 1);

  for (const over of [true, false]) {
    // m = N would leave nothing stationary, and a fold with nothing stationary creases nothing,
    // which `foldLayers` refuses as `no-crease`. So the moved run is always a proper part.
    for (let m = 1; m <= N - 1 && found.size < max_results; m++) {
      // finalOrder = over ? [...stay, ...movedRun] : [...movedRun, ...stay], and
      // movedRun = movingIdx reversed -- so both are read straight back off the stack.
      const run = over ? state.order.slice(N - m) : state.order.slice(0, m);
      const moving = [...run].reverse();
      const stay = over ? state.order.slice(0, N - m) : state.order.slice(m);
      if (!stay.length) continue;

      // The fold line, recovered exactly: for a split pair the move half's placement is the
      // stay half's composed with the fold's reflection.
      const lines = new Map();
      for (const mi of moving) for (const si of stay) {
        const R = asReflection(mul(state.faces[mi].T, inv(state.faces[si].T)));
        if (R) lines.set(lkey(R), R);
      }
      if (!lines.size) { note('no-reflection-relates-this-run'); continue; }

      for (const line of lines.values()) {
        if (found.size >= max_results) break;
        const R = reflectT(line.n, line.d);

        // Undo the reflection on the whole run. R is an involution, so this is exact.
        const back = moving.map(mi => {
          const f = state.faces[mi];
          const T = mul(R, f.T);
          return {src: mi, poly: f.poly, T, inv: inv(T), par: 1 - f.par};
        });

        // Match each un-reflected face to the stay half it was split from: same placement,
        // same side of the paper, and two polygons that really do reassemble into one.
        const base = stay.map(si => ({...state.faces[si]}));
        const usedStay = new Array(base.length).fill(false);
        const anchorOf = new Array(back.length).fill(-1);
        for (let j = 0; j < back.length; j++) {
          for (let s = 0; s < base.length; s++) {
            if (usedStay[s]) continue;
            const t = base[s];
            if (t.par !== back[j].par || !samePlacement(t.T, back[j].T)) continue;
            const whole = merge(t.poly, back[j].poly);
            if (!whole) continue;
            base[s] = {poly: whole, T: t.T, inv: t.inv, par: t.par};
            usedStay[s] = true;
            anchorOf[j] = s;
            break;
          }
        }
        const anchors = anchorOf.filter(s => s !== -1);
        // At least one split, or the fold creased nothing and is not a fold.
        if (!anchors.length) { note('run-has-no-split-face'); continue; }
        // The moving faces kept their relative order through the fold, so their anchors must
        // climb. If they do not, this line does not explain this run.
        if (anchors.some((s, i) => i && s <= anchors[i - 1])) { note('anchor-order-violated'); continue; }

        // Wholly-moved faces left no anchor. Each may sit anywhere between the anchors that
        // bracket it, so every such rank is enumerated rather than assumed.
        const gaps = [];
        let prev = -1;
        for (let j = 0; j <= back.length; j++) {
          if (j < back.length && anchorOf[j] === -1) continue;
          const orphans = [];
          for (let z = (gaps.length ? gaps[gaps.length - 1].end : 0); z < j; z++)
            if (anchorOf[z] === -1) orphans.push(z);
          const hi = j < back.length ? anchorOf[j] : base.length;
          if (orphans.length) gaps.push({orphans, runs: slotRuns(prev + 1, hi, orphans.length, max_placements), end: j + 1});
          else gaps.push({orphans: [], runs: [[]], end: j + 1});
          prev = hi;
        }
        // THE COMPLETENESS WALL, AND IT IS NOT A TUNING PARAMETER.
        //
        // For an all-layers fold the stack in front of us records the stationary layers' order
        // and the moving layers' order SEPARATELY -- stay parts below, the reversed moved run
        // above -- and nothing records how the two were interleaved before the fold. A face
        // that was split is pinned, because its halves share a rank. A face that moved wholly
        // is pinned by nothing, so every interleaving of it with the stationary layers is a
        // different, equally legal predecessor, and tryFold accepts all of them.
        //
        // Measured on easy-0003 step 10 (48 layers, 8 creases, 32 faces moved, 24 of them
        // wholly): 6.3e10 predecessors for this ONE line and run. Forward branching on the same
        // corpus is 3.51. The asymmetry is the whole story -- folding is many-to-one on stacking
        // order, so unfolding is one-to-many by the same factor.
        //
        // Capping here is therefore a decision to be INCOMPLETE, not a decision to be fast. It
        // is recorded rather than hidden, so a caller can tell a genuine `exhausted` from a
        // truncated one.
        const layouts = product(gaps.map(g => g.runs), max_placements);
        const capped = layouts.length >= max_placements ||
                       gaps.some(g => g.runs.length >= max_placements);
        if (capped) truncated++;

        for (const layout of layouts) {
          if (found.size >= max_results) break;
          // Build the predecessor's stack: the stay list, with the orphans dropped in.
          const inserts = new Map();
          gaps.forEach((g, gi) => g.orphans.forEach((o, k) => {
            const slot = layout[gi][k];
            if (!inserts.has(slot)) inserts.set(slot, []);
            inserts.get(slot).push(o);
          }));
          const faces = [], order = [], movingPos = [];
          const put = f => { faces.push(f); order.push(faces.length - 1); return order.length - 1; };
          const posOfBack = new Array(back.length).fill(-1);
          for (let s = 0; s <= base.length; s++) {
            for (const o of inserts.get(s) ?? []) posOfBack[o] = put(back[o]);
            if (s < base.length) {
              const at = put(base[s]);
              const j = anchorOf.indexOf(s);
              if (j !== -1) posOfBack[j] = at;
            }
          }
          if (posOfBack.some(p => p === -1)) continue;
          if (posOfBack.some((p, i) => i && p <= posOfBack[i - 1])) continue;
          movingPos.push(...posOfBack);
          const P = {faces, order};
          const M = order.length;

          // The run has to be a contiguous run at the same extremity the fold landed on. `all`
          // is always available too, and is preferred when it works because it is the simplest
          // spelling -- the same reason legal_folds.mjs lists `all` first.
          const k = over ? M - Math.min(...movingPos) : Math.max(...movingPos) + 1;
          const picks = [{selection_mode: 'all', over}];
          if (k >= 1 && k <= M) picks.push({selection_mode: over ? 'top' : 'bottom', layer_count: k, over});

          for (const pick of picks) {
            if (found.size >= max_results) break;
            for (const move_positive of [true, false]) {
              const action = {tool: 'apply_fold', ...lineArguments(line), move_positive, ...pick};
              proposed++;
              let verdict;
              try { verdict = tryFold(P, cp, action); }
              catch (e) { note('unparseable-candidate'); continue; }
              if (!verdict.ok) { note(verdict.error); continue; }
              // The whole guarantee: folding the proposed predecessor with the proposed action
              // has to land back exactly here, in this frame, not merely somewhere similar.
              if (exactKey(verdict.fold.state) !== goal) { note('refolds-elsewhere'); continue; }
              const key = exactKey(P);
              if (found.has(key)) continue;
              const {tool, ...emitted} = action;
              found.set(key, {action: emitted, state: P, layers_before: M, layers_after: N,
                              creases_removed: verdict.fold.made.length});
            }
          }
        }
      }
    }
  }

  const unfolds = [...found.values()].sort((a, b) => b.creases_removed - a.creases_removed);
  return {
    stack_size: N,
    unfolds,
    // The pruning signal. A state nothing can have produced is a proved-dead branch, which is
    // what "this layer is wrapped inside, you cannot unfold it" is in this engine's terms.
    dead_end: unfolds.length === 0,
    // How many (line, run) choices had their predecessor list cut short. Non-zero means this
    // listing is a SAMPLE of the predecessors, not all of them, and an exhausted search built
    // on it proves nothing.
    placements_truncated: truncated,
    complete: truncated === 0,
    proposed,
    guarantee: 'Each listed predecessor folds forward onto this exact state under tryFold, the ' +
      'same verifier add_fold uses. Predecessors are proposed generously and filtered by it.',
    rejected_summary: Object.fromEntries(rejected),
  };
}
