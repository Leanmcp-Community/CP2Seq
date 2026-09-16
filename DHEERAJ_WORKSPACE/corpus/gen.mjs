// Synthetic Pureland corpus generator.
// Fold forward from a square with random all-layers simple folds, record the
// sequence, unfold to get the CP.  Bucket A by construction.
//
// Exact rational arithmetic throughout (BigInt fractions): every fold line is a
// perpendicular bisector or a line through two existing vertices, and reflection
// across such a line maps rationals to rationals.  No epsilon, no "precision:
// no stable graph" failures.
import fs from "fs";
import path from "path";

/* ---------- rationals ---------- */
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a || 1n; };
const rat = (n, d = 1n) => { n = BigInt(n); d = BigInt(d); if (!d) throw new Error("div0"); if (d < 0n) { n = -n; d = -d; } const k = gcd(n, d); return [n / k, d / k]; };
const add = (a, b) => rat(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const sub = (a, b) => rat(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a, b) => rat(a[0] * b[0], a[1] * b[1]);
const dvd = (a, b) => rat(a[0] * b[1], a[1] * b[0]);
const neg = (a) => [-a[0], a[1]];
const sgn = (a) => (a[0] > 0n ? 1 : a[0] < 0n ? -1 : 0);
const eqr = (a, b) => a[0] === b[0] && a[1] === b[1];
const flt = (a) => Number(a[0]) / Number(a[1]);
const R0 = rat(0n), R1 = rat(1n), R2 = rat(2n);
const key = (p) => `${p[0][0]}/${p[0][1]},${p[1][0]}/${p[1][1]}`;
const eqp = (p, q) => eqr(p[0], q[0]) && eqr(p[1], q[1]);

/* ---------- geometry ---------- */
// line: {a,b,c} meaning a*x + b*y = c
const lineThrough = (p, q) => {
    const a = sub(q[1], p[1]), b = sub(p[0], q[0]);
    return { a, b, c: add(mul(a, p[0]), mul(b, p[1])) };
};
const perpBisector = (p, q) => {
    const a = sub(q[0], p[0]), b = sub(q[1], p[1]);
    const mx = dvd(add(p[0], q[0]), R2), my = dvd(add(p[1], q[1]), R2);
    return { a, b, c: add(mul(a, mx), mul(b, my)) };
};
const side = (L, p) => sgn(sub(add(mul(L.a, p[0]), mul(L.b, p[1])), L.c));
const degenerate = (L) => sgn(L.a) === 0 && sgn(L.b) === 0;

const reflectPt = (L, p) => {
    const den = add(mul(L.a, L.a), mul(L.b, L.b));
    const t = dvd(sub(add(mul(L.a, p[0]), mul(L.b, p[1])), L.c), den);
    return [sub(p[0], mul(mul(R2, L.a), t)), sub(p[1], mul(mul(R2, L.b), t))];
};
// affine map {m00,m01,m10,m11,tx,ty}: original -> current
const ID = { m00: R1, m01: R0, m10: R0, m11: R1, tx: R0, ty: R0 };
const reflectXf = (L) => {
    const den = add(mul(L.a, L.a), mul(L.b, L.b));
    const k = dvd(R2, den);
    return {
        m00: sub(R1, mul(k, mul(L.a, L.a))), m01: neg(mul(k, mul(L.a, L.b))),
        m10: neg(mul(k, mul(L.a, L.b))),     m11: sub(R1, mul(k, mul(L.b, L.b))),
        tx: mul(mul(k, L.c), L.a),           ty: mul(mul(k, L.c), L.b),
    };
};
const compose = (B, A) => ({ // B after A
    m00: add(mul(B.m00, A.m00), mul(B.m01, A.m10)), m01: add(mul(B.m00, A.m01), mul(B.m01, A.m11)),
    m10: add(mul(B.m10, A.m00), mul(B.m11, A.m10)), m11: add(mul(B.m10, A.m01), mul(B.m11, A.m11)),
    tx: add(add(mul(B.m00, A.tx), mul(B.m01, A.ty)), B.tx),
    ty: add(add(mul(B.m10, A.tx), mul(B.m11, A.ty)), B.ty),
});
// every xform here is a composition of reflections => orthogonal => inverse is the transpose
const invert = (X) => ({
    m00: X.m00, m01: X.m10, m10: X.m01, m11: X.m11,
    tx: neg(add(mul(X.m00, X.tx), mul(X.m10, X.ty))),
    ty: neg(add(mul(X.m01, X.tx), mul(X.m11, X.ty))),
});
const apply = (X, p) => [
    add(add(mul(X.m00, p[0]), mul(X.m01, p[1])), X.tx),
    add(add(mul(X.m10, p[0]), mul(X.m11, p[1])), X.ty),
];
const flipped = (X) => sgn(sub(mul(X.m00, X.m11), mul(X.m01, X.m10))) < 0;

const area2 = (poly) => { // twice the signed area
    let s = R0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        s = add(s, sub(mul(p[0], q[1]), mul(q[0], p[1])));
    }
    return s;
};
const dedupe = (poly) => {
    const out = [];
    for (const p of poly) if (!out.length || !eqp(out[out.length - 1], p)) out.push(p);
    while (out.length > 1 && eqp(out[0], out[out.length - 1])) out.pop();
    return out;
};
// Sutherland-Hodgman: keep the half-plane on `want` (points on the line are kept)
const clip = (poly, L, want) => {
    const inside = (s) => s !== -want;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
        const P = poly[i], Q = poly[(i + 1) % poly.length];
        const sp = side(L, P), sq = side(L, Q);
        if (inside(sp)) out.push(P);
        if (sp !== 0 && sq !== 0 && sp !== sq) {
            const dx = sub(Q[0], P[0]), dy = sub(Q[1], P[1]);
            const den = add(mul(L.a, dx), mul(L.b, dy));
            const t = dvd(sub(L.c, add(mul(L.a, P[0]), mul(L.b, P[1]))), den);
            out.push([add(P[0], mul(t, dx)), add(P[1], mul(t, dy))]);
        }
    }
    const d = dedupe(out);
    return d.length >= 3 && sgn(area2(d)) !== 0 ? d : null;
};

/* ---------- state ---------- */
// layer = { poly (current coords), X (original -> current) }.  layers[0] = bottom.
const initial = () => [{ poly: [[R0, R0], [R1, R0], [R1, R1], [R0, R1]], X: ID }];

function doFold(layers, L, moveSide) {
    const keepSide = -moveSide;
    const Rx = reflectXf(L);
    const keep = [], move = [], creases = [];
    for (const lay of layers) {
        const A = clip(lay.poly, L, keepSide);
        const B = clip(lay.poly, L, moveSide);
        if (A) keep.push({ poly: A, X: lay.X });
        if (B) move.push({ poly: B.map((p) => reflectPt(L, p)), X: compose(Rx, lay.X) });
        if (A && B) { // this layer is actually creased
            const on = [];
            for (const p of A) if (side(L, p) === 0 && !on.some((q) => eqp(p, q))) on.push(p);
            if (on.length === 2) {
                const inv = invert(lay.X);
                creases.push({
                    seg: [apply(inv, on[0]), apply(inv, on[1])],
                    assignment: flipped(lay.X) ? "M" : "V",
                });
            }
        }
    }
    if (!keep.length || !move.length) return null;
    return { layers: keep.concat(move.reverse()), creases };
}

/* ---------- candidate folds ---------- */
function candidates(layers, rnd) {
    const seen = new Map();
    for (const lay of layers) for (const p of lay.poly) seen.set(key(p), p);
    let pts = [...seen.values()];
    if (pts.length > 20) { // keep the pair count sane on deep stacks
        const idx = pts.map((_, i) => i);
        for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
        pts = idx.slice(0, 20).map((i) => pts[i]);
    }
    const lines = [], lseen = new Set();
    const push = (L) => {
        if (degenerate(L)) return;
        // normalise the line so duplicates collapse
        const s = sgn(L.a) || sgn(L.b);
        const [a, b, c] = s < 0 ? [neg(L.a), neg(L.b), neg(L.c)] : [L.a, L.b, L.c];
        const n = add(mul(a, a), mul(b, b));
        const k = `${flt(dvd(a, n)).toFixed(12)},${flt(dvd(b, n)).toFixed(12)},${flt(dvd(c, n)).toFixed(12)}`;
        if (!lseen.has(k)) { lseen.add(k); lines.push({ a, b, c }); }
    };
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        push(perpBisector(pts[i], pts[j]));   // "bring point to point" — the classic fold
        push(lineThrough(pts[i], pts[j]));    // fold along an existing alignment
    }
    return lines;
}

/* ---------- unfold to a crease pattern ---------- */
const onSquareEdge = (p, q) => {
    for (const [i, v] of [[0, R0], [0, R1], [1, R0], [1, R1]])
        if (eqr(p[i], v) && eqr(q[i], v)) return true;
    return false;
};
const collinearBetween = (p, q, v) => { // v strictly inside segment pq
    if (eqp(v, p) || eqp(v, q)) return false;
    const cr = sub(mul(sub(q[0], p[0]), sub(v[1], p[1])), mul(sub(q[1], p[1]), sub(v[0], p[0])));
    if (sgn(cr) !== 0) return false;
    const d = add(mul(sub(q[0], p[0]), sub(v[0], p[0])), mul(sub(q[1], p[1]), sub(v[1], p[1])));
    if (sgn(d) <= 0) return false;
    const len = add(mul(sub(q[0], p[0]), sub(q[0], p[0])), mul(sub(q[1], p[1]), sub(q[1], p[1])));
    return sgn(sub(d, len)) < 0;
};

function toFold(layers, allCreases) {
    // faces = preimages of the final layers; they tile the original square exactly
    let faces = layers.map((l) => { const inv = invert(l.X); return l.poly.map((p) => apply(inv, p)); });
    faces = faces.map((f) => (sgn(area2(f)) < 0 ? [...f].reverse() : f)); // CCW

    const vmap = new Map(), verts = [];
    const vid = (p) => { const k = key(p); if (!vmap.has(k)) { vmap.set(k, verts.length); verts.push(p); } return vmap.get(k); };
    for (const f of faces) for (const p of f) vid(p);

    // split face edges at any vertex lying in their interior (T-junctions)
    faces = faces.map((f) => {
        const out = [];
        for (let i = 0; i < f.length; i++) {
            const p = f[i], q = f[(i + 1) % f.length];
            out.push(p);
            const mid = verts.filter((v) => collinearBetween(p, q, v));
            mid.sort((u, v) => flt(sub(add(mul(sub(u[0], p[0]), sub(q[0], p[0])), mul(sub(u[1], p[1]), sub(q[1], p[1]))),
                                       add(mul(sub(v[0], p[0]), sub(q[0], p[0])), mul(sub(v[1], p[1]), sub(q[1], p[1]))))));
            out.push(...mid);
        }
        return out;
    });

    const eset = new Map();
    for (const f of faces) for (let i = 0; i < f.length; i++) {
        const a = vid(f[i]), b = vid(f[(i + 1) % f.length]);
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        if (!eset.has(k)) eset.set(k, [Math.min(a, b), Math.max(a, b)]);
    }
    const edges = [...eset.values()];
    const assign = edges.map(([a, b]) => {
        const p = verts[a], q = verts[b];
        if (onSquareEdge(p, q)) return "B";
        for (const c of allCreases) {
            const [s, e] = c.seg;
            const on = (v) => eqp(v, s) || eqp(v, e) || collinearBetween(s, e, v);
            if (on(p) && on(q)) return c.assignment;
        }
        return "F"; // should not happen; counted as a warning
    });

    return {
        file_spec: 1.1, frame_classes: ["creasePattern"],
        vertices_coords: verts.map((p) => [flt(p[0]), flt(p[1])]),
        edges_vertices: edges,
        edges_assignment: assign,
        faces_vertices: faces.map((f) => f.map((p) => vid(p))),
    };
}

/* ---------- one sample ---------- */
const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };

export function generate(steps, seed) {
    const rnd = rng(seed);
    let layers = initial();
    const seq = [], allCreases = [];
    for (let t = 0; t < steps; t++) {
        const lines = candidates(layers, rnd);
        const opts = [];
        for (const L of lines) for (const s of [1, -1]) opts.push([L, s]);
        for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
        let did = null;
        for (const [L, s] of opts) {
            const r = doFold(layers, L, s);
            if (r && r.creases.length) { did = { r, L, s }; break; }
        }
        if (!did) return null; // no legal fold left
        const before = layers.reduce((a, l) => a + Math.abs(flt(area2(l.poly))) / 2, 0);
        const moved = layers.reduce((a, l) => { const B = clip(l.poly, did.L, did.s); return a + (B ? Math.abs(flt(area2(B))) / 2 : 0); }, 0);
        layers = did.r.layers;
        allCreases.push(...did.r.creases);
        seq.push({
            step: t + 1,
            creases: did.r.creases.map((c) => ({
                seg: c.seg.map((p) => [flt(p[0]), flt(p[1])]),
                exact: c.seg.map((p) => [`${p[0][0]}/${p[0][1]}`, `${p[1][0]}/${p[1][1]}`]),
                assignment: c.assignment,
            })),
            moved_fraction: +(moved / before).toFixed(6),
            layers_after: layers.length,
        });
    }
    const cp = toFold(layers, allCreases);
    const tiling = layers.reduce((a, l) => a + Math.abs(flt(area2(l.poly))) / 2, 0); // must be 1
    return {
        cp, sequence: seq, seed, steps,
        terminal: { // ground-truth final state: stacking order, bottom -> top
            order: layers.map((_, i) => i),
            layers_original_coords: layers.map((l) => { const inv = invert(l.X); return l.poly.map((p) => [flt(apply(inv, p)[0]), flt(apply(inv, p)[1])]); }),
        },
        checks: {
            preimage_area: +tiling.toFixed(9),          // == 1 iff the faces tile the square
            unassigned_edges: cp.edges_assignment.filter((a) => a === "F").length,
            faces: cp.faces_vertices.length,
            creases: cp.edges_assignment.filter((a) => a !== "B").length,
        },
    };
}

/* ---------- CLI ---------- */
if (import.meta.url === `file://${process.argv[1]}`) {
    const N = +(process.env.N ?? 200);
    const MINS = +(process.env.MINS ?? 3), MAXS = +(process.env.MAXS ?? 10);
    const OUT = process.env.OUT ?? null;
    const rnd = rng(+(process.env.SEED ?? 20260915));
    const ok = [], bad = [];
    for (let i = 0; i < N; i++) {
        const steps = MINS + Math.floor(rnd() * (MAXS - MINS + 1));
        const seed = Math.floor(rnd() * 2 ** 31);
        let s = null;
        try { s = generate(steps, seed); } catch (e) { bad.push(`${i}: ${e.message}`); continue; }
        if (!s) { bad.push(`${i}: no legal fold`); continue; }
        ok.push(s);
        if (OUT) {
            const d = path.join(OUT, String(i).padStart(4, "0"));
            fs.mkdirSync(d, { recursive: true });
            fs.writeFileSync(path.join(d, "cp.fold"), JSON.stringify(s.cp));
            fs.writeFileSync(path.join(d, "sequence.json"), JSON.stringify({ seed: s.seed, steps: s.steps, sequence: s.sequence }, null, 1));
            fs.writeFileSync(path.join(d, "terminal.json"), JSON.stringify(s.terminal));
        }
    }
    const hist = (xs) => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => a[0] - b[0]); };
    const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
    const halving = ok.flatMap((s) => s.sequence).filter((st) => Math.abs(st.moved_fraction - 0.5) < 0.01).length;
    const allSteps = ok.flatMap((s) => s.sequence).length;
    const dupes = new Set(ok.map((s) => JSON.stringify(s.cp.edges_vertices) + JSON.stringify(s.cp.edges_assignment))).size;
    console.log(`generated ${ok.length}/${N}   failed: ${bad.length}`);
    console.log(`TILING CHECK  preimage area == 1 : ${ok.filter((s) => Math.abs(s.checks.preimage_area - 1) < 1e-9).length}/${ok.length}`);
    console.log(`UNASSIGNED EDGES ("F", should be 0): ${ok.reduce((a, s) => a + s.checks.unassigned_edges, 0)}`);
    console.log(`distinct CPs: ${dupes}/${ok.length}`);
    console.log(`steps      : ${JSON.stringify(hist(ok.map((s) => s.steps)))}`);
    console.log(`faces      : p10=${q(ok.map((s) => s.checks.faces), .1)} p50=${q(ok.map((s) => s.checks.faces), .5)} p90=${q(ok.map((s) => s.checks.faces), .9)} max=${Math.max(...ok.map((s) => s.checks.faces))}`);
    console.log(`creases    : p10=${q(ok.map((s) => s.checks.creases), .1)} p50=${q(ok.map((s) => s.checks.creases), .5)} p90=${q(ok.map((s) => s.checks.creases), .9)}`);
    console.log(`final layers: p50=${q(ok.map((s) => s.terminal.order.length), .5)} max=${Math.max(...ok.map((s) => s.terminal.order.length))}`);
    console.log(`DEGENERACY  exact-halving folds: ${halving}/${allSteps} = ${(100 * halving / allSteps).toFixed(1)}%`);
    if (bad.length) console.log(`failures (first 5): ${bad.slice(0, 5).join(" | ")}`);
}
