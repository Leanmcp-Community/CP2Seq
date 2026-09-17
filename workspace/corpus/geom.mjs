// Plane geometry for folding: affine isometries, lines, polygon clipping.
//
// This is the kernel the FORWARD pipeline runs on -- the fold engines, planarize, and the
// replay check all reduce to these operations. It was extracted from probe-c/stage2.mjs when
// the search was removed: the search is gone, the geometry it was built on is not, because
// folding a polygon across a line is the same operation whether you are generating a sequence
// or trying to recover one.
//
// WHY THE MATRICES ARE EXACT, and why fold-engine.mjs restricts itself to four angles.
// reflectT builds a reflection from a unit normal, so for a 45-degree line its entries come out
// as 1-2*(sqrt(2)/2)^2 = -2.2e-16 rather than 0. Those matrices compose once per fold, so the
// error compounds multiplicatively down a sequence -- the drift that masquerades as a geometry
// bug past a dozen folds. The four angles the random generator allows (0/45/90/135) have
// reflection matrices with entries in {0,+-1}, which float64 holds exactly, so the LINEAR part
// of every placement carries zero drift at any depth. Authored models (models.mjs) are short
// enough not to care and use the full plane.

const EPS = 1e-7;

/* ---------- affine isometries: (x,y) -> (a x + b y + e, c x + d y + f) ---------- */
const ID = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const ap = (T, p) => [T.a * p[0] + T.b * p[1] + T.e, T.c * p[0] + T.d * p[1] + T.f];
const mul = (A, B) => ({                                   // A after B
    a: A.a * B.a + A.b * B.c, b: A.a * B.b + A.b * B.d,
    c: A.c * B.a + A.d * B.c, d: A.c * B.b + A.d * B.d,
    e: A.a * B.e + A.b * B.f + A.e, f: A.c * B.e + A.d * B.f + A.f });
const inv = (T) => {
    const det = T.a * T.d - T.b * T.c;
    const a = T.d / det, b = -T.b / det, c = -T.c / det, d = T.a / det;
    return { a, b, c, d, e: -(a * T.e + b * T.f), f: -(c * T.e + d * T.f) };
};
const reflectT = ([nx, ny], d) => ({
    a: 1 - 2 * nx * nx, b: -2 * nx * ny, c: -2 * nx * ny, d: 1 - 2 * ny * ny,
    e: 2 * d * nx, f: 2 * d * ny });

/* ---------- lines: canonical unit normal + offset, so the same line keys identically ------ */
function lineOf(p, q) {
    let dx = q[0] - p[0], dy = q[1] - p[1];
    const L = Math.hypot(dx, dy);
    if (L < EPS) return null;
    dx /= L; dy /= L;
    let nx = -dy, ny = dx;
    if (nx < -EPS || (Math.abs(nx) <= EPS && ny < 0)) { nx = -nx; ny = -ny; }
    return { n: [nx, ny], d: nx * p[0] + ny * p[1], dir: [dx, dy] };
}
// the point at parameter t along the line (base = the foot of the normal)
const ptOn = (l, t) => [l.n[0] * l.d + l.dir[0] * t, l.n[1] * l.d + l.dir[1] * t];

const lkey = (l) => {
    const r = (v) => Math.round(v / 1e-6) * 1e-6;
    // a line and its opposite normal are the same line
    const [nx, ny] = l.n[0] < -EPS || (Math.abs(l.n[0]) <= EPS && l.n[1] < 0)
        ? [-l.n[0], -l.n[1]] : l.n;
    const d = (nx === l.n[0] && ny === l.n[1]) ? l.d : -l.d;
    return `${r(nx)},${r(ny)},${r(d)}`;
};

/* ---------- polygon clipping against a half-plane, plus the chord on the line ------------ */
function clip(poly, n, d, keepPositive) {
    const side = (p) => (n[0] * p[0] + n[1] * p[1] - d) * (keepPositive ? 1 : -1);
    const out = [];
    for (let i = 0; i < poly.length; i++) {
        const A = poly[i], B = poly[(i + 1) % poly.length];
        const sa = side(A), sb = side(B);
        if (sa >= -EPS) out.push(A);
        if ((sa > EPS && sb < -EPS) || (sa < -EPS && sb > EPS)) {
            const t = sa / (sa - sb);
            out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]);
        }
    }
    // A vertex count is not enough: three or more COLLINEAR points survive the clip when a
    // layer merely touches the fold line, and a zero-area sliver like that gets counted on
    // BOTH sides. The layer is then duplicated, the same strip of paper is creased twice in
    // one fold, and the two copies disagree about M/V because their parities differ -- which
    // surfaces as an impossible "direction conflict" on a sequence that is real. Require area.
    return out.length >= 3 && Math.abs(area(out)) > 1e-12 ? out : null;
}
const area = (poly) => {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
};
// the segment where the infinite line cuts the polygon, as [tMin, tMax] along line.dir
function chord(poly, line) {
    const { n, d, dir } = line;
    let lo = Infinity, hi = -Infinity, hit = false;
    for (let i = 0; i < poly.length; i++) {
        const A = poly[i], B = poly[(i + 1) % poly.length];
        const sa = n[0] * A[0] + n[1] * A[1] - d, sb = n[0] * B[0] + n[1] * B[1] - d;
        let P = null;
        if (Math.abs(sa) <= EPS) P = A;
        else if ((sa > 0) !== (sb > 0) && Math.abs(sb) > EPS) {
            const t = sa / (sa - sb);
            P = [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])];
        }
        if (P) { const t = dir[0] * P[0] + dir[1] * P[1]; lo = Math.min(lo, t); hi = Math.max(hi, t); hit = true; }
    }
    return hit && hi - lo > EPS ? [lo, hi] : null;
}


// the paper outline, walked from the "B" edges
function boundaryLoop(bEdges, V) {
    if (!bEdges.length) return null;
    const nb = new Map();
    for (const [u, w] of bEdges) {
        if (!nb.has(u)) nb.set(u, []); if (!nb.has(w)) nb.set(w, []);
        nb.get(u).push(w); nb.get(w).push(u);
    }
    const start = bEdges[0][0];
    const loop = [start];
    let prev = -1, cur = start;
    for (let i = 0; i < nb.size + 1; i++) {
        const nx = (nb.get(cur) || []).find(v => v !== prev);
        if (nx === undefined) return null;
        if (nx === start) break;
        loop.push(nx); prev = cur; cur = nx;
    }
    return loop.length >= 3 && loop.length === nb.size ? loop.map(v => V[v]) : null;
}

export { boundaryLoop, lineOf, lkey, ptOn, ap, mul, inv, ID, reflectT, clip, chord, area, EPS };
