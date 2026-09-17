// Crease segments -> a real FOLD crease pattern.
//
// WHY THIS FILE EXISTS. The generator emits one crease segment per cut layer, so a 15-fold
// sample produces a few hundred segments that cross each other, overlap each other, and
// repeat. A FOLD crease pattern is a PLANAR GRAPH: edges meet only at shared vertices, and no
// two edges overlap. Handing a segment soup to anything that expects a CP -- Flat-Folder, the
// stage 2 solver, a renderer -- gets inconsistent behaviour rather than a clean error, so the
// planarisation has to happen here, once, before anything downstream sees the file.
//
// It is also where two corpus invariants are enforced rather than hoped for:
//   * NO F EDGES. Pure simple folding has no unfold operation, so a crease with fold angle
//     zero cannot arise. Pre-creases are outside the frozen action space
//     (notes/plan/experiment-spec-checklist.md A), so an F edge here is a generator bug.
//   * NO CONTRADICTORY ASSIGNMENT. After splitting, two sub-edges between the same pair of
//     vertices must agree on M/V. The engine's conflicts() already rejects such folds; this is
//     the independent check that it worked.
import { lineOf, lkey } from "../probe-c/stage2.mjs";

const EPS = 1e-9;
const key = (p) => `${Math.round(p[0] / EPS)},${Math.round(p[1] / EPS)}`;

// intersection of two infinite lines given as point+direction; null when parallel
function meet(p, dp, q, dq) {
    const den = dp[0] * dq[1] - dp[1] * dq[0];
    if (Math.abs(den) < 1e-12) return null;
    const t = ((q[0] - p[0]) * dq[1] - (q[1] - p[1]) * dq[0]) / den;
    return [p[0] + t * dp[0], p[1] + t * dp[1]];
}

/**
 * @param segs  [{P,Q,assignment}] -- creases and border edges alike
 * @returns { fold, stats }
 */
export function planarize(segs) {
    // 1. describe each segment in its own line frame, so "is this point on me" is 1-D
    const S = [];
    for (const s of segs) {
        const l = lineOf(s.P, s.Q);
        if (!l) continue;                                   // zero-length: drop
        const t = (p) => l.dir[0] * p[0] + l.dir[1] * p[1];
        const a = t(s.P), b = t(s.Q);
        S.push({ l, key: lkey(l), lo: Math.min(a, b), hi: Math.max(a, b),
                 a: s.assignment, cuts: [] });
    }

    // 2. every point where one segment has to be split: its own endpoints, proper crossings,
    //    and -- the case that is easy to forget -- the endpoints of any COLLINEAR overlap.
    for (const s of S) { s.cuts.push(s.lo, s.hi); }
    for (let i = 0; i < S.length; i++) {
        for (let j = i + 1; j < S.length; j++) {
            const A = S[i], B = S[j];
            if (A.key === B.key) {
                // collinear: project B's ends into A's frame and vice versa
                const flip = A.l.dir[0] * B.l.dir[0] + A.l.dir[1] * B.l.dir[1] < 0;
                const bIn = flip ? [-B.hi, -B.lo] : [B.lo, B.hi];
                for (const v of bIn) if (v > A.lo + EPS && v < A.hi - EPS) A.cuts.push(v);
                const aIn = flip ? [-A.hi, -A.lo] : [A.lo, A.hi];
                for (const v of aIn) if (v > B.lo + EPS && v < B.hi - EPS) B.cuts.push(v);
                continue;
            }
            const pa = [A.l.n[0] * A.l.d, A.l.n[1] * A.l.d];
            const pb = [B.l.n[0] * B.l.d, B.l.n[1] * B.l.d];
            const X = meet(pa, A.l.dir, pb, B.l.dir);
            if (!X) continue;
            const ta = A.l.dir[0] * X[0] + A.l.dir[1] * X[1];
            const tb = B.l.dir[0] * X[0] + B.l.dir[1] * X[1];
            if (ta > A.lo - EPS && ta < A.hi + EPS && tb > B.lo - EPS && tb < B.hi + EPS) {
                if (ta > A.lo + EPS && ta < A.hi - EPS) A.cuts.push(ta);
                if (tb > B.lo + EPS && tb < B.hi - EPS) B.cuts.push(tb);
            }
        }
    }

    // 3. cut every segment at those points and register the pieces
    const vIndex = new Map(), verts = [];
    const vid = (p) => {
        const k = key(p);
        if (!vIndex.has(k)) { vIndex.set(k, verts.length); verts.push([p[0], p[1]]); }
        return vIndex.get(k);
    };
    const edges = new Map();                                // "u,w" -> assignment
    let conflict = 0, overlapMerged = 0;

    for (const s of S) {
        const ts = [...new Set(s.cuts.map(v => Math.round(v / EPS) * EPS))].sort((x, y) => x - y);
        for (let i = 0; i + 1 < ts.length; i++) {
            const t0 = ts[i], t1 = ts[i + 1];
            if (t1 - t0 < EPS) continue;
            const P = [s.l.n[0] * s.l.d + s.l.dir[0] * t0, s.l.n[1] * s.l.d + s.l.dir[1] * t0];
            const Q = [s.l.n[0] * s.l.d + s.l.dir[0] * t1, s.l.n[1] * s.l.d + s.l.dir[1] * t1];
            const u = vid(P), w = vid(Q);
            if (u === w) continue;
            const k = u < w ? `${u},${w}` : `${w},${u}`;
            const prev = edges.get(k);
            if (prev === undefined) { edges.set(k, s.a); continue; }
            overlapMerged++;
            if (prev === s.a) continue;
            // the paper's own outline wins over anything that lands on it
            if (prev === "B" || s.a === "B") { edges.set(k, "B"); continue; }
            conflict++;                                     // M vs V on one edge: a real defect
        }
    }

    const EV = [], EA = [];
    for (const [k, a] of edges) {
        const [u, w] = k.split(",").map(Number);
        EV.push([u, w]); EA.push(a);
    }
    const badAssign = EA.filter(a => a !== "B" && a !== "M" && a !== "V");

    return {
        fold: {
            file_spec: 1.1,
            file_creator: "FoldOrigami synthetic Pureland generator",
            frame_classes: ["creasePattern"],
            vertices_coords: verts,
            edges_vertices: EV,
            edges_assignment: EA,
        },
        stats: {
            segments_in: segs.length, vertices: verts.length, edges: EV.length,
            overlaps_merged: overlapMerged,
            assignment_conflicts: conflict,
            non_bmv_edges: badAssign.length,
            counts: EA.reduce((m, a) => (m[a] = (m[a] || 0) + 1, m), {}),
        },
    };
}

/**
 * The folded state after a step, as a FOLD foldedForm.
 *
 * Layers are given bottom-to-top in `fo:faces_layer`. All-layers simple folding imposes no
 * layer-ordering freedom -- the order is determined by the fold history -- so this is a fact
 * about the state, not a choice we made (workspace/probe-c/stage2.mjs header).
 */
export function foldedState(layers) {
    const vIndex = new Map(), verts = [];
    const vid = (p) => {
        const k = key(p);
        if (!vIndex.has(k)) { vIndex.set(k, verts.length); verts.push([p[0], p[1]]); }
        return vIndex.get(k);
    };
    const faces = layers.map(l => l.poly.map(vid));
    const eset = new Map();
    for (const f of faces) for (let i = 0; i < f.length; i++) {
        const u = f[i], w = f[(i + 1) % f.length];
        if (u !== w) eset.set(u < w ? `${u},${w}` : `${w},${u}`, true);
    }
    const EV = [...eset.keys()].map(k => k.split(",").map(Number));
    return {
        file_spec: 1.1,
        file_creator: "FoldOrigami synthetic Pureland generator",
        frame_classes: ["foldedForm"],
        vertices_coords: verts,
        edges_vertices: EV,
        edges_assignment: EV.map(() => "U"),
        faces_vertices: faces,
        "fo:faces_layer": faces.map((_, i) => i),
        "fo:faces_parity": layers.map(l => l.par),
    };
}

/**
 * The whole sample as ONE multi-frame FOLD file: the crease pattern, then the folded state
 * after every step, in order.
 *
 * WHY THIS REPLACED steps/step-NN.fold. A fold sequence is one object, and FOLD says how to
 * store one: `file_frames` holds frames 1..n while the key frame sits at the top level, and
 * `file_classes: ["diagrams"]` is the spec's own name for a sequence of folding steps. Writing
 * a directory of numbered files instead re-invented that ordering in the filenames, where
 * nothing can validate it and no FOLD reader can follow it, and split the crease pattern away
 * from the states it produced so a consumer had to reassemble the pair by convention.
 *
 * /!\ THERE IS NO `frame_order` FIELD. The order is the ARRAY ORDER of file_frames -- that is
 * the entire mechanism, per the spec. Nothing may reorder that array.
 *
 * The key frame is the crease pattern, because it is the thing the sample is ABOUT; the folded
 * states are its children. `frame_inherit` is false on every frame and said so explicitly
 * rather than omitted: a folded state has its own vertices, its own edge list and its own face
 * list, so inheriting the parent's geometry would be wrong, and a reader that assumes the
 * default should not have to guess which way we meant it.
 */
export function sequenceFile(cp, states, info = {}) {
    return {
        ...cp,                                   // the crease pattern IS the key frame
        file_classes: ["diagrams"],
        file_frames: states.map((layers, k) => {
            // file_spec and file_creator are FILE-level fields. foldedState() emits them because
            // it was written to produce a standalone file; inside file_frames they are repeated
            // noise at best and a reader's contradiction at worst, so they are stripped here
            // rather than fixed there -- foldedState() still has standalone callers.
            const { file_spec, file_creator, ...frame } = foldedState(layers);
            return { ...frame,
                     frame_parent: 0,
                     frame_inherit: false,
                     frame_title: k === 0 ? "step 0 (flat sheet)" : `step ${k}` };
        }),
        ...(info.id ? { frame_title: info.id } : {}),
    };
}
