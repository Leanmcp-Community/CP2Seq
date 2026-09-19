// LEVEL 2 COMPARISON -- folded states, up to a symmetry group DECLARED IN ADVANCE.
//
// verify-exact.mjs compares CREASE SETS, and that is Level 1: strict, cheap, and blind to one
// thing. Two different sequences can leave the same creases on the sheet and stack the paper in a
// different order; crease equality calls those states equal and they are not. This file closes
// that gap by comparing the stack itself.
//
// WHY A GROUP, AND WHY IT IS FIXED HERE RATHER THAN PER CALL. EXPERIMENTS_SETUP.md section 4
// states the cost plainly: a CP admits many valid terminal states, so a byte-exact diff against
// the one state we happened to store marks correct answers wrong. The answer is not a tolerance,
// it is an equivalence: say in advance which differences do not count, then demand exactness
// inside that. The group is:
//
//   * the 8 symmetries of the square, acting on DIRECTIONS only (4 rotations, 4 reflections)
//   * an arbitrary TRANSLATION
//
// Translation is in the group because a fold can carry paper off the original square -- fold the
// x > 0.1 side across x = 0.1 and it lands at negative x -- so a folded state's position in the
// plane is an accident of the sequence, not a property of the result. Anchoring the symmetries to
// the unit square would therefore be wrong, and was the first thing tried.
//
// /!\ THE FOUR REFLECTIONS ALSO REVERSE THE STACK AND FLIP EVERY PARITY. Turning a folded model
// over is a rotation about an in-plane axis: seen from above it is a reflection, the layer that
// was on the bottom is now on top, and every face shows its other side. Applying a reflection to
// the coordinates while leaving the order alone compares a model against its MIRROR IMAGE, which
// is a different object and would silently accept wrong answers. This is the one place where
// getting the group wrong is not conservative.
//
// WHAT IS NOT IN THE GROUP, deliberately: the "layer-order variants Flat-Folder reports as
// equally valid" that section 4 also mentions. Those are not symmetries of a state -- they are
// DIFFERENT states that happen to be reachable from the same CP, and deciding which orderings are
// valid needs a flat-foldability solver, not a comparator. Folding that into this file would hide
// an external dependency inside what looks like an equality test. If that equivalence is wanted,
// it belongs in a separate check that owns the solver.
//
// COST OF EXACTNESS, stated rather than discovered: folding reflects coordinates and floating
// point reflection is not exact, so the comparison admits a residual. It is an ABSOLUTE radius
// equal to the generator's own vertex-merge radius (planarize's EPS = 1e-9), for the reason
// verify-exact.mjs gives at length -- the corpus cannot be resolved more finely than the
// generator recorded it. It is never a rounding grid. A grid has cell boundaries and landing on
// one is the bug this project has now hit five times.
import { EPS } from "./geom.mjs";

export const MERGE_EPS = EPS;              // 1e-9, planarize's own vertex identity radius

// The 8 linear parts, as [a, b, c, d] for [x, y] -> [a x + b y, c x + d y]. `flip` marks the
// orientation-reversing four, which are the ones that also reverse the stack.
export const SYMMETRIES = [
    { name: "id",    m: [ 1,  0,  0,  1], flip: false },
    { name: "rot90", m: [ 0, -1,  1,  0], flip: false },
    { name: "rot180",m: [-1,  0,  0, -1], flip: false },
    { name: "rot270",m: [ 0,  1, -1,  0], flip: false },
    { name: "mirX",  m: [-1,  0,  0,  1], flip: true  },
    { name: "mirY",  m: [ 1,  0,  0, -1], flip: true  },
    { name: "diag",  m: [ 0,  1,  1,  0], flip: true  },
    { name: "anti",  m: [ 0, -1, -1,  0], flip: true  },
];

/* ---------- reading a state out of a FOLD frame ---------------------------------------- */

// A frame written by planarize.sequenceFile / foldedState -> layers bottom to top.
// `fo:faces_layer` carries the stack position of each face; it is an identity map as written
// today, and reading it rather than assuming that is what keeps this working if it stops being.
export function layersFromFrame(frame) {
    const V = frame.vertices_coords;
    const pos = frame["fo:faces_layer"] ?? frame.faces_vertices.map((_, i) => i);
    const par = frame["fo:faces_parity"] ?? frame.faces_vertices.map(() => 0);
    const out = new Array(frame.faces_vertices.length);
    frame.faces_vertices.forEach((f, i) => {
        out[pos[i]] = { poly: f.map(v => [V[v][0], V[v][1]]), par: par[i] };
    });
    if (out.some(l => l === undefined)) throw new Error("fo:faces_layer is not a permutation");
    return out;
}

/* ---------- polygon equality, tolerant of where the list starts ------------------------- */

// Two polygons are the same region whether they were recorded starting at a different vertex or
// wound the other way. Winding matters here in one direction only: a reflection reverses it, and
// the symmetry that produced the reflection has already been applied, so BOTH cyclic directions
// are admitted rather than tracked. The polygons are small (3-8 vertices), so this is cheap.
function samePolygon(P, Q, eps) {
    if (P.length !== Q.length) return false;
    const n = P.length;
    for (const rev of [false, true]) {
        const R = rev ? [...Q].reverse() : Q;
        for (let s = 0; s < n; s++) {
            let ok = true;
            for (let i = 0; i < n; i++) {
                const a = P[i], b = R[(i + s) % n];
                if (Math.abs(a[0] - b[0]) > eps || Math.abs(a[1] - b[1]) > eps) { ok = false; break; }
            }
            if (ok) return true;
        }
    }
    return false;
}

// /!\ CURRENT-PLANE GEOMETRY PLUS PARITY IS NOT ENOUGH TO IDENTIFY A FOLDED STATE, and this file
// asserted otherwise until the negative control in verify-state.mjs said so: 23 of 600 samples
// accepted a state with their two lowest layers SWAPPED. The diagnosis, on all-layers/easy-0048:
//
//     layer 0   current [[0,0],[-0.25,0.25],[0,0.5]]   sheet [[1,0.5],[0.75,0.75],[0.5,0.5]]
//     layer 1   current [[0,0.5],[0,0],[-0.25,0.25]]   sheet [[1,0],[1,0.5],[0.75,0.25]]
//
// The two layers cover the SAME triangle in the plane and carry the same parity, so nothing in
// the comparison could tell them apart -- but they are DIFFERENT PIECES OF THE SHEET, so which
// one is underneath is a real difference between two folded states, and exactly the kind of
// difference this file exists to catch. Deep stacks make this common rather than exotic: fold
// enough times and many layers are congruent triangles.
//
// So a layer may also carry `sheet`, its polygon in ORIGINAL SHEET coordinates, and when both
// sides have it it is compared too. `identifiesFaces` in the result says whether that happened,
// because a comparison that ran without it is strictly weaker and must not be reported as if it
// had. Replaying a sequence through the engine yields `sheet` for free; a stored steps.fold frame
// does NOT carry it (foldedState emits current coordinates only), which is why Fold Studio's
// format has a `vertices_flat` field for the same purpose.

// The mean of every face vertex. Used to cancel the translation: if two states are congruent
// under a linear part L, their vertex MULTISETS are equal up to translation, so their means
// differ by exactly that translation. A mean is stable under the residual in a way that a
// bounding-box corner is not -- a corner is decided by one vertex, and one vertex is where the
// residual lives.
function centroid(layers, key = "poly") {
    let sx = 0, sy = 0, n = 0;
    for (const l of layers) for (const p of (l[key] ?? [])) { sx += p[0]; sy += p[1]; n++; }
    return n ? [sx / n, sy / n] : [0, 0];
}

function applyLinear(layers, { m, flip }) {
    const [a, b, c, d] = m;
    const L = ([x, y]) => [a * x + b * y, c * x + d * y];
    const moved = layers.map(l => ({
        poly: l.poly.map(L),
        // The same symmetry acts on the sheet: the physical operation is turning the SQUARE over
        // or round before folding it, which moves a face's identity on the paper with it.
        sheet: l.sheet ? l.sheet.map(L) : undefined,
        // Turning the model over shows the other side of every face.
        par: flip ? 1 - l.par : l.par,
    }));
    // ...and the bottom of the stack becomes the top.
    return flip ? moved.reverse() : moved;
}

/* ---------- the comparison ------------------------------------------------------------- */

/**
 * Are two folded states the same, up to the declared group?
 *
 * @param {{poly:[number,number][],par:number}[]} A  layers bottom to top
 * @param {{poly:[number,number][],par:number}[]} B  layers bottom to top
 * @returns {{ok:true, symmetry:string} | {ok:false, why:string}}
 */
export function sameFoldedState(A, B, { eps = MERGE_EPS, checkParity = true } = {}) {
    if (A.length !== B.length)
        return { ok: false, why: `different layer counts: ${A.length} vs ${B.length}` };

    // Face identity is compared only when BOTH sides carry it. Reported either way, because a
    // run that compared geometry alone answered a weaker question than a run that did not.
    const identifiesFaces = A.every(l => l.sheet) && B.every(l => l.sheet);

    const tried = [];
    for (const g of SYMMETRIES) {
        const A2 = applyLinear(A, g);
        // Cancel the translation before comparing, never after: comparing first and then asking
        // how far off it was would make the verdict depend on where the state happens to sit.
        const [cx, cy] = centroid(A2, "poly"), [dx, dy] = centroid(B, "poly");
        const t = [dx - cx, dy - cy];
        // The sheet has its own translation: a symmetry about the origin moves the unit square
        // off itself, and the sheet's placement is no more meaningful than the model's.
        let s = [0, 0];
        if (identifiesFaces) {
            const [sx, sy] = centroid(A2, "sheet"), [ux, uy] = centroid(B, "sheet");
            s = [ux - sx, uy - sy];
        }

        let bad = -1, why = "";
        for (let i = 0; i < A2.length; i++) {
            if (checkParity && A2[i].par !== B[i].par) { bad = i; why = "parity"; break; }
            const shifted = A2[i].poly.map(([x, y]) => [x + t[0], y + t[1]]);
            if (!samePolygon(shifted, B[i].poly, eps)) { bad = i; why = "region"; break; }
            if (identifiesFaces) {
                const onSheet = A2[i].sheet.map(([x, y]) => [x + s[0], y + s[1]]);
                if (!samePolygon(onSheet, B[i].sheet, eps)) { bad = i; why = "which piece of the sheet"; break; }
            }
        }
        if (bad < 0) return { ok: true, symmetry: g.name, identifiesFaces };
        tried.push(`${g.name}@layer${bad}(${why})`);
    }
    return { ok: false, identifiesFaces,
             why: `no symmetry matches (first mismatch under each: ${tried.join(", ")})` };
}

/** Convenience: compare two FOLD frames rather than two layer lists. */
export function sameFrame(frameA, frameB, opts) {
    return sameFoldedState(layersFromFrame(frameA), layersFromFrame(frameB), opts);
}
