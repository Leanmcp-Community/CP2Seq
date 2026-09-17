// Forward folding engine for the synthetic Pureland corpus.
//
// Square -> random all-layers simple folds -> record the sequence -> unfold to get the CP.
// Generation is trivial; recovering the sequence is the hard inverse problem. That asymmetry
// is the whole point (notes/plan/corpus-plan.md (a)).
//
// Extended with the three things a corpus needs that a round-trip test did not:
//   * LAYER ORDER, tracked explicitly, so intermediate folded states can be exported
//   * per-step DIFFICULTY METRICS, which are free at generation time (see below)
//   * EXACT reflection matrices instead of reflectT's
//
// WHY EXACT MATRICES. reflectT builds the reflection from a unit normal, so for a 45-degree
// line its entries are 1-2*(sqrt(2)/2)^2 = -2.2e-16 instead of 0. Those matrices are composed
// once per fold, so the error compounds multiplicatively down the sequence -- exactly the
// drift that masquerades as a geometry bug past a dozen folds. The four angles we allow have
// reflection matrices with entries in {0,+-1}, which float64 holds exactly, so the LINEAR part
// of every placement has ZERO drift no matter how deep the sequence goes. Only the
// translations accumulate ordinary float addition error (~1e-15 over 20 folds). `checkExact`
// asserts the linear part really is integral, so a regression here cannot pass silently.
//
// WHY THE METRICS ARE FREE. One fold cuts every layer it crosses, and each cut layer becomes
// ONE crease in the original square. So "creases created by this step" is
// simultaneously
//   - the non-local coupling of the step  (Learn2Fold's second difficulty axis, papers.md #4)
//   - how many layers of paper the fold goes through  ("it gets harder as you fold",
//     and the closest measurable proxy for by-hand difficulty)
// Both come out of the fold itself. Nothing has to be measured afterwards.
import { clip, chord, ptOn, ap, mul, inv, ID, lineOf, lkey } from "./geom.mjs";

export const ANGLE_DEG = [0, 45, 90, 135];

// A fold line as (angle index, offset). The offset lives in the UN-normalised normal frame,
// which keeps it on a dyadic grid for every angle; a unit-normal frame would make the
// 45-degree offsets irrational for no benefit.
//   0   : y = off              1  : y = x + off
//   2   : x = off              3  : x + y = off
export function lineSpec(ai, off) {
    switch (ai) {
        case 0: return { n: [0, 1],  off, R: { a: 1, b: 0, c: 0, d: -1, e: 0, f: 2 * off } };
        case 1: return { n: [-1, 1], off, R: { a: 0, b: 1, c: 1, d: 0, e: -off, f: off } };
        case 2: return { n: [1, 0],  off, R: { a: -1, b: 0, c: 0, d: 1, e: 2 * off, f: 0 } };
        case 3: return { n: [1, 1],  off, R: { a: 0, b: -1, c: -1, d: 0, e: off, f: off } };
    }
    throw new Error(`bad angle index ${ai}`);
}

// clip/chord/ptOn from stage2 assume a unit normal and the true offset, so hand them that
// view of the same line. The reflection still uses the exact matrix above.
export function unitView(spec) {
    const L = Math.hypot(spec.n[0], spec.n[1]);
    const n = [spec.n[0] / L, spec.n[1] / L];
    return { n, d: spec.off / L, dir: [-n[1], n[0]] };
}

const isInt = (v) => Math.abs(v - Math.round(v)) === 0;
export function checkExact(T) {
    return isInt(T.a) && isInt(T.b) && isInt(T.c) && isInt(T.d) &&
           Math.abs(Math.abs(T.a * T.d - T.b * T.c) - 1) < 1e-12;
}

const polyArea = (poly) => {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
};

function bbox(layers) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of layers) for (const p of l.poly) {
        x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
        x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
    return { w: x1 - x0, h: y1 - y0, area: (x1 - x0) * (y1 - y0) };
}

// Do two crease segments lie on one line, overlap, and disagree on M/V?
//
// A crease folded one way and later folded back the other leaves ONE assignment in the CP,
// not two -- the CP records only the last direction. The first version of this generator did
// not check, produced self-contradictory CPs that no solver can ever satisfy, and the failure
// looked exactly like a geometry bug. Reject such folds.
function conflicts(creases, m) {
    const lm = lineOf(m.P, m.Q);
    if (!lm) return false;
    const t = (p) => lm.dir[0] * p[0] + lm.dir[1] * p[1];
    const lo = Math.min(t(m.P), t(m.Q)), hi = Math.max(t(m.P), t(m.Q));
    const km = lkey(lm);
    for (const c of creases) {
        if (c.a === m.a) continue;
        const lc = lineOf(c.P, c.Q);
        if (!lc || lkey(lc) !== km) continue;
        const a = Math.min(t(c.P), t(c.Q)), b = Math.max(t(c.P), t(c.Q));
        if (Math.min(hi, b) - Math.max(lo, a) > 1e-7) return true;
    }
    return false;
}

// One all-layers simple fold. Returns null when the line misses the stack, creases nothing,
// or would contradict a crease already made.
//
// LAYER ORDER: layers are held bottom-to-top. The moving half is reflected and its internal
// order REVERSES (flipping a stack turns it upside down), then lands on top of the stationary
// half when folding over, underneath it when folding under. All-layers simple folding moves
// the whole stack rigidly, so this order is forced -- there is never a choice to search over,
// which is the same property that makes the forward search tractable at all.
export function applyFold(layers, creases, ai, off, movePositive, over) {
    const spec = lineSpec(ai, off);
    const uv = unitView(spec);
    const { n, d } = uv;

    const made = [], stay = [], move = [];
    for (const lay of layers) {
        const keep = clip(lay.poly, n, d, !movePositive);
        const go = clip(lay.poly, n, d, movePositive);
        if (keep && go) {
            const c = chord(lay.poly, uv);
            if (c) made.push({ P: ap(lay.inv, ptOn(uv, c[0])), Q: ap(lay.inv, ptOn(uv, c[1])),
                               a: ((lay.par === 0) === over) ? "V" : "M" });
        }
        if (keep) stay.push({ ...lay, poly: keep });
        if (go) {
            const T = mul(spec.R, lay.T);
            move.push({ poly: go.map(p => ap(spec.R, p)), T, inv: inv(T), par: 1 - lay.par });
        }
    }
    if (!made.length) return null;                       // creases nothing: not a fold
    if (made.some(m => conflicts(creases, m))) return null;

    move.reverse();
    const next = over ? [...stay, ...move] : [...move, ...stay];
    return { layers: next, made, split: made.length };
}

// All candidate offsets for one angle: anchored on the current silhouette so the line
// actually cuts, then nudged onto a coarse grid.
//
// The coarse grid is not an aesthetic choice. Reflections compose; off-grid angles and
// offsets drift until, a dozen folds down, the drift is indistinguishable from a geometry bug.
const OFFSET_STEPS = [-0.5, -0.25, 0, 0.25, 0.5];

export function candidateOffsets(layers, ai, rand) {
    const { n } = lineSpec(ai, 0);
    const lay = layers[Math.floor(rand() * layers.length)];
    const v = lay.poly[Math.floor(rand() * lay.poly.length)];
    const base = n[0] * v[0] + n[1] * v[1];
    return OFFSET_STEPS.map(k => base + k);
}

/**
 * Fold a square `steps` times with random simple folds.
 *
 * Returns { creases, seq, layers, metrics, ok } -- `ok` false when the walk stalled before
 * reaching `steps`, which the caller should treat as a rejected sample rather than a short one
 * (a stalled walk is biased towards degenerate states, so keeping it would skew the corpus).
 */
export function foldRandom(steps, rand, opts = {}) {
    const maxTries = opts.maxTries ?? 60;
    let layers = [{ poly: [[0, 0], [1, 0], [1, 1], [0, 1]], T: ID, inv: ID, par: 0 }];
    const creases = [], seq = [];
    // every fold builds fresh layer objects and a fresh array, so a snapshot can just hold the
    // array -- no copy needed, and the caller gets the state after every step for free
    const states = opts.snapshots ? [layers] : null;
    let exactOk = true;

    // COUPLING CAP -- off by default, and the pilot batch is why it exists.
    //
    // Sampling folds uniformly, almost every fold happens to cross the WHOLE stack, so the
    // layer count doubles every step: 18 folds gave 512 layers, a fold creasing 100+ lines at
    // once, and paper collapsed to 0.8% of its bounding box. That is not hard origami, it is
    // repeatedly folding a sliver in half -- and it overshoots real Pureland badly (measured
    // non-local coupling there is p50 = 0.7, notes/plan/corpus-plan.md).
    //
    // Capping how much of the stack one fold may cut is the knob that separates the two.
    // It is left unset by default so the uncapped distribution stays visible in the report;
    // corpus-plan.md is explicit that the anti-degeneracy design is chosen from the first
    // batch, not ahead of it.
    const cap = (n) => {
        const lim = Math.min(
            opts.couplingCap ?? Infinity,
            opts.couplingFrac ? Math.max(1, Math.floor(n * opts.couplingFrac)) : Infinity);
        return lim;
    };

    for (let s = 0; s < steps; s++) {
        let done = null;
        const lim = cap(layers.length);
        for (let tries = 0; tries < maxTries && !done; tries++) {
            const ai = Math.floor(rand() * 4);
            const offs = candidateOffsets(layers, ai, rand);
            const off = offs[Math.floor(rand() * offs.length)];
            const movePositive = rand() < 0.5;
            const over = rand() < 0.5;
            const r = applyFold(layers, creases, ai, off, movePositive, over);
            if (r && r.split <= lim) done = { ai, off, movePositive, over, r };
        }
        if (!done) return { ok: false, stalledAt: s, creases, seq, layers, states };

        const { ai, off, movePositive, over, r } = done;
        const before = layers.length;
        creases.push(...r.made);
        layers = r.layers;
        if (states) states.push(layers);
        for (const l of layers) if (!checkExact(l.T)) exactOk = false;

        seq.push({
            step: s + 1,
            angle_deg: ANGLE_DEG[ai], angle_index: ai, offset: off,
            move_positive: movePositive, over,
            creases: r.made.map(m => ({ P: m.P, Q: m.Q, assignment: m.a })),
            // creases_created == layers the fold cut == non-local coupling == layers of paper
            // bent at once. One number, three readings (see the file header).
            creases_created: r.split,
            layers_before: before, layers_after: layers.length,
            silhouette_bbox_area: bbox(layers).area,
            largest_face_area: Math.max(...layers.map(l => polyArea(l.poly))),
        });
    }
    return { ok: true, creases, seq, layers, states, exactOk };
}

export { polyArea, bbox };
