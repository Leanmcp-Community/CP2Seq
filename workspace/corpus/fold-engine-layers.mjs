// Forward folding engine, SOME-LAYERS tier.
//
// The all-layers engine (fold-engine.mjs) stays the core. This is the extension tier decided
// 2026-09-16, and it exists because the core cannot express most real models: all-layers
// folding tends to symmetric, repetitive patterns, because a fold can never move part of the
// stack and leave the rest -- an asymmetric outline needs a partial fold.
//
// WHAT CHANGES, AND WHY IT IS A REWRITE RATHER THAN A FLAG
// -------------------------------------------------------
// All-layers folding moves the whole stack rigidly, so the paper never moves relative to
// itself: no self-intersection, no layer-ordering question, and no way to tear anything. Every
// simplification in the core engine descends from that. Move only SOME layers and all three
// come back:
//
//   1. TEARING. The sheet is one piece. If a moving face is joined to a stationary face along
//      a crease, and that crease is not ON the fold line, the fold would rip the paper. The
//      core engine cannot even ask this question -- it stores layers as unrelated polygons,
//      with no record of which piece is joined to which. So this engine tracks the sheet as a
//      subdivision of the ORIGINAL square, where adjacency is a geometric fact about the
//      original coordinates and survives any amount of folding.
//
//   2. SELF-INTERSECTION. Handled by construction rather than by a test: a run of layers taken
//      from the TOP can only be folded OVER, and a run taken from the BOTTOM only UNDER.
//      Folding the top two layers underneath the stack would require the paper to pass through
//      the layers beneath it, which is not a fold, it is a slit. Restricting the selection to a
//      contiguous run at one extremity of the stack makes the illegal case unrepresentable --
//      and it is also exactly what a hand can do: lift some layers, fold them across.
//
//   3. LAYER ORDER. Now load-bearing, so the state carries an explicit bottom-to-top order.
//      Folding a run reverses that run and moves it to the far side of the stack.
//
// STATE
//   faces  polygons in ORIGINAL SHEET coordinates, each with the isometry placing it in the
//          current plane. Original coordinates are what makes adjacency, and therefore
//          tearing, decidable at all.
//   order  face indices, bottom to top
//
// A fold is given in CURRENT-PLANE coordinates, because that is the paper as it now sits in
// front of you -- and is how a diagram reads.
import { lineOf, lkey, ap, mul, inv, ID } from "./geom.mjs";

const EPS = 1e-9;

/* ---------- geometry ---------------------------------------------------------------- */
const areaOf = (poly) => {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
};

// Pull a current-plane half-plane back into original-sheet coordinates.
// T maps original -> current as p |-> A p + t, so n·(A p + t) - d = (Aᵀn)·p + (n·t - d).
function pullBackLine({ n, d }, T) {
    const nn = [T.a * n[0] + T.c * n[1], T.b * n[0] + T.d * n[1]];
    return { n: nn, d: d - (n[0] * T.e + n[1] * T.f) };
}

function splitPoly(poly, n, d) {
    const side = poly.map(p => n[0] * p[0] + n[1] * p[1] - d);
    if (side.every(s => s >= -EPS)) return { pos: poly, neg: null };
    if (side.every(s => s <= EPS)) return { pos: null, neg: poly };
    const pos = [], neg = [];
    for (let i = 0; i < poly.length; i++) {
        const A = poly[i], B = poly[(i + 1) % poly.length];
        const sa = side[i], sb = side[(i + 1) % poly.length];
        if (sa >= -EPS) pos.push(A);
        if (sa <= EPS) neg.push(A);
        if ((sa > EPS && sb < -EPS) || (sa < -EPS && sb > EPS)) {
            const t = sa / (sa - sb);
            const X = [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])];
            pos.push(X); neg.push(X);
        }
    }
    const ok = (q) => q.length >= 3 && Math.abs(areaOf(q)) > 1e-12 ? q : null;
    return { pos: ok(pos), neg: ok(neg) };
}

// The segment two polygons share, in original coordinates -- null when they only touch at a
// point or not at all. This is the adjacency that decides whether a partial fold tears.
function sharedSegment(P, Q) {
    for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        const l1 = lineOf(a, b);
        if (!l1) continue;
        for (let j = 0; j < Q.length; j++) {
            const c = Q[j], e = Q[(j + 1) % Q.length];
            const l2 = lineOf(c, e);
            if (!l2 || lkey(l1) !== lkey(l2)) continue;
            const t = (p) => l1.dir[0] * p[0] + l1.dir[1] * p[1];
            const lo = Math.max(Math.min(t(a), t(b)), Math.min(t(c), t(e)));
            const hi = Math.min(Math.max(t(a), t(b)), Math.max(t(c), t(e)));
            if (hi - lo > 1e-7) return { line: l1, lo, hi };
        }
    }
    return null;
}

const ptOnLine = (l, t) => [l.n[0] * l.d + l.dir[0] * t, l.n[1] * l.d + l.dir[1] * t];

// Where selected layers sit along a candidate fold normal, in the CURRENT plane. A refusal is
// only useful to a planner if it can say which offsets would have cut this paper at all.
function lineValues(st, indices, n) {
    let min = Infinity, max = -Infinity;
    for (const fi of indices) {
        for (const p of st.faces[fi].poly) {
            const q = ap(st.faces[fi].T, p);
            const v = n[0] * q[0] + n[1] * q[1];
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }
    return Number.isFinite(min) ? { min, max } : null;
}

/* ---------- state ------------------------------------------------------------------- */
export function initSheet(poly = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    return { faces: [{ poly, T: ID, inv: ID, par: 0 }], order: [0] };
}

export const layerCount = (st) => st.order.length;
export const paperArea = (st) => st.faces.reduce((a, f) => a + Math.abs(areaOf(f.poly)), 0);

/**
 * One some-layers simple fold.
 *
 * @param line  { n, d } in CURRENT-PLANE coordinates (n need not be unit)
 * @param movePositive  move the side with n·p > d
 * @param sel   { mode: "all" } | { mode: "top", k } | { mode: "bottom", k }
 * @param over  the moving part lands on top of what stays. Free for mode "all"; for a partial
 *              selection it is forced by physics (top run over, bottom run under) and a
 *              contradicting value is refused as "direction-impossible" rather than ignored.
 *
 * Returns { state, made, moved } or { error } -- and the error cases are the point, so they
 * are named rather than collapsed into null:
 *   "nothing-to-move"  the line misses the selected layers
 *   "would-tear"       a moving face is joined to a stationary face somewhere off the fold line
 *   "direction-impossible"  the requested over/under cannot be done with that layer selection
 */
export function foldLayers(st, line, movePositive, sel = { mode: "all" }, over = true) {
    const L = Math.hypot(line.n[0], line.n[1]);
    const n = [line.n[0] / L, line.n[1] / L], d = line.d / L;
    const sgn = movePositive ? 1 : -1;

    // which stack positions are eligible to move
    const N = st.order.length;
    let lo = 0, hi = N;                                   // [lo, hi) in `order`
    if (sel.mode === "top")    lo = Math.max(0, N - sel.k);
    if (sel.mode === "bottom") hi = Math.min(N, sel.k);
    if (sel.mode !== "all" && (sel.k ?? 0) <= 0) return { error: "nothing-to-move", diagnostic: {
        why: "the selection is empty", requested_layer_count: sel.k ?? null, stack_size: N } };

    // Direction is free for an all-layers fold and forced for a partial one, and conflating the
    // two was a real defect here: `over` used to be derived from the selection alone, so every
    // all-layers fold was forced over and wrote V where the caller wanted M. That made this
    // engine useless as an independent check on a solver that picks the direction per fold.
    //
    // Physically: a run taken from the TOP can only go over, a run from the BOTTOM only under --
    // anything else drives the paper through the layers it left behind. With the whole stack
    // moving there is nothing left behind, so both directions are available.
    if (sel.mode !== "all") {
        const forced = sel.mode === "bottom" ? false : true;
        if (over !== forced) return { error: "direction-impossible", forced, diagnostic: {
            selection_mode: sel.mode, layer_count: sel.k, requested_over: over, required_over: forced,
            why: sel.mode === "bottom"
                ? "a run taken from the bottom of the stack can only fold UNDER (over=false); folding it over would drive it through the layers above it"
                : "a run taken from the top of the stack can only fold OVER (over=true); folding it under would drive it through the layers below it" } };
        over = forced;
    }

    const faces = st.faces.map(f => ({ ...f }));
    const order = [...st.order];
    const eligible = new Set(order.slice(lo, hi));

    // 1. split eligible faces that the line crosses; everything else is untouched, which is
    //    the whole difference from all-layers folding
    const made = [], movingIdx = [], newOrder = [], sourceOf = new Map();
    const selected = order.slice(lo, hi);
    // Reported in the caller's own offset units: the caller's offset is line.d, and d = line.d / L.
    const offsetAdvice = () => {
        const range = lineValues(st, selected, n);
        return range && { requested_offset: line.d, selected_layer_ranks: [lo, hi - 1],
            offsets_that_cut_the_selection: [range.min * L, range.max * L],
            note: "an offset strictly inside offsets_that_cut_the_selection crosses the selected layers; outside it the line misses them" };
    };
    for (const fi of order) {
        const f = faces[fi];
        if (!eligible.has(fi)) { newOrder.push(fi); continue; }
        const hp = pullBackLine({ n, d }, f.T);
        const { pos, neg } = splitPoly(f.poly, hp.n, hp.d);
        const stayPoly = sgn > 0 ? neg : pos;
        const movePoly = sgn > 0 ? pos : neg;

        if (!movePoly) { newOrder.push(fi); continue; }     // entirely on the stationary side
        if (!stayPoly) {                                    // entirely on the moving side: no crease
            movingIdx.push(fi);
            sourceOf.set(fi, fi);
            continue;
        }
        // the line cuts this face: the cut IS a new crease
        faces[fi] = { ...f, poly: stayPoly };
        newOrder.push(fi);
        const mi = faces.length;
        faces.push({ ...f, poly: movePoly });
        movingIdx.push(mi);
        sourceOf.set(mi, fi);

        const seg = cutSegment(f.poly, hp.n, hp.d);
        if (seg) made.push({ P: seg[0], Q: seg[1], par: f.par, faceOf: fi });
    }
    if (!movingIdx.length) return { error: "nothing-to-move", diagnostic: {
        why: `no selected paper lies on the ${movePositive ? "positive" : "negative"} side of this line`,
        moving_side: movePositive ? "positive" : "negative", ...offsetAdvice() } };
    // A fold that creases nothing is not a fold: it lifts whole layers off the rest of the
    // sheet, which for a single piece of paper means tearing it free. Caught here so the
    // diagnosis names the cause instead of surfacing as a confusing tear between two faces.
    if (!made.length) return { error: "no-crease", diagnostic: {
        why: "the line does not cut any selected layer: every selected layer lies wholly on the moving side, so the fold would lift it off the sheet instead of creasing it",
        moving_side: movePositive ? "positive" : "negative", moving_layers: movingIdx.length,
        ...offsetAdvice() } };

    // 2. tearing check -- the reason this engine keeps original coordinates at all.
    //    A moving face joined to a stationary face along a crease that is NOT the fold line
    //    cannot move: the sheet would have to come apart there.
    const movingSet = new Set(movingIdx);
    const stationary = newOrder.filter(i => !movingSet.has(i));
    for (const mi of movingIdx) {
        for (const si of stationary) {
            const seg = sharedSegment(faces[mi].poly, faces[si].poly);
            if (!seg) continue;
            // map the shared crease into the current plane and ask whether it lies on the line
            const T = faces[si].T;
            const A = ap(T, ptOnLine(seg.line, seg.lo)), B = ap(T, ptOnLine(seg.line, seg.hi));
            const onLine = Math.abs(n[0] * A[0] + n[1] * A[1] - d) < 1e-7 &&
                           Math.abs(n[0] * B[0] + n[1] * B[1] - d) < 1e-7;
            if (!onLine) {
                const src = sourceOf.get(mi) ?? mi;
                const S0 = ptOnLine(seg.line, seg.lo), S1 = ptOnLine(seg.line, seg.hi);
                return { error: "would-tear", between: [mi, si], diagnostic: {
                    why: "these two layers are one piece of paper, joined along a crease that is not the fold line, so moving one and not the other would tear the sheet there",
                    moving_layer_rank: order.indexOf(src), stationary_layer_rank: order.indexOf(si),
                    join_sheet_coords: [S0, S1], join_current_coords: [A, B],
                    join_distance_from_fold_line: [n[0] * A[0] + n[1] * A[1] - d,
                                                   n[0] * B[0] + n[1] * B[1] - d],
                    fix: "select a run that includes both joined layers, or put the fold line on that join" } };
            }
        }
    }

    // 3. reflect the moving faces and restack them at the far end, order reversed
    const R = reflectUnit(n, d);
    for (const mi of movingIdx) {
        const f = faces[mi];
        const T = mul(R, f.T);
        faces[mi] = { poly: f.poly, T, inv: inv(T), par: 1 - f.par };
    }
    const movedRun = movingIdx.slice().reverse();
    const finalOrder = over ? [...newOrder, ...movedRun] : [...movedRun, ...newOrder];

    return {
        state: { faces, order: finalOrder },
        made: made.map(m => ({ P: m.P, Q: m.Q,
                               a: ((m.par === 0) === over) ? "V" : "M" })),
        moved: movingIdx.length,
        over,
    };
}

// where the half-plane boundary cuts a polygon, in that polygon's own (original) coordinates
function cutSegment(poly, n, d) {
    const hits = [];
    for (let i = 0; i < poly.length; i++) {
        const A = poly[i], B = poly[(i + 1) % poly.length];
        const sa = n[0] * A[0] + n[1] * A[1] - d, sb = n[0] * B[0] + n[1] * B[1] - d;
        if (Math.abs(sa) <= EPS) hits.push(A);
        else if ((sa > 0) !== (sb > 0) && Math.abs(sb) > EPS) {
            const t = sa / (sa - sb);
            hits.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]);
        }
    }
    if (hits.length < 2) return null;
    let best = null;
    for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) {
        const dd = Math.hypot(hits[i][0] - hits[j][0], hits[i][1] - hits[j][1]);
        if (!best || dd > best.d) best = { d: dd, seg: [hits[i], hits[j]] };
    }
    return best && best.d > 1e-7 ? best.seg : null;
}

const reflectUnit = ([nx, ny], d) => ({
    a: 1 - 2 * nx * nx, b: -2 * nx * ny, c: -2 * nx * ny, d: 1 - 2 * ny * ny,
    e: 2 * d * nx, f: 2 * d * ny });

/* ---------- export the folded state, bottom to top ---------------------------------- */
export function currentPolys(st) {
    return st.order.map(i => ({ poly: st.faces[i].poly.map(p => ap(st.faces[i].T, p)),
                                par: st.faces[i].par }));
}
