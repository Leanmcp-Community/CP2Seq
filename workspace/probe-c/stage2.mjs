// PROBE C, stage 2 -- the full all-layers simple-fold search.
//
// Stage 1 (screen.mjs) is a necessary condition; this decides the question for the CPs that
// survived it, and produces the pure-search query baseline the paper's efficiency claim is
// measured against.
//
// WHY A FORWARD SEARCH, AND WHY IT IS TRACTABLE AT ALL
// ----------------------------------------------------
// An all-layers simple fold moves the entire stack rigidly across one infinite line, so --
// unlike layer-by-layer folding -- it can never self-intersect and imposes NO layer-ordering
// constraint. Foldability is therefore a purely geometric question about which lines are
// folded and in which order, with no combinatorial layer bookkeeping. That is what makes a
// direct forward simulation from the flat square feasible.
//
// STATE = a list of LAYERS. Each layer carries
//   poly   its polygon in the CURRENT folded plane
//   T      the isometry original-square coords -> current plane (and its inverse)
//   par    orientation parity: 0 = the paper's front face is up, 1 = flipped
//
// A FOLD along line (n, d), moving the side with n.p > d:
//   every layer is split by the line; the moving part is reflected and its parity toggles;
//   the chord where the line crosses a layer, pulled back through that layer's inverse, is a
//   crease created in the ORIGINAL square -- one per layer, all from a single fold. That is
//   precisely the non-local coupling that makes this problem hard.
//
// PRUNING (this is what keeps it finite):
//   a candidate fold is legal only if EVERY crease it creates already exists in the target CP,
//   at the right place and with a consistent M/V. Candidates are generated as the images of
//   target crease lines, so the branching factor is the number of target crease lines, not the
//   continuum of all lines.
//
// M/V: one fold has one direction. For a layer of parity p, folding the moving side over the
// top writes V when p = 0 and M when p = 1; folding it under writes the opposite. So the
// direction is not a branch -- it is read off the target and checked for consistency.
//
// /!\ MODELLING RESTRICTION, stated because it weakens what EXHAUSTED means: a fold is
// rejected the moment it creases a line against the assignment the target CP demands there.
// Physically you may fold a crease one way and later fold it back the other, and the CP only
// records the last direction -- this search cannot express that. So EXHAUSTED means "no
// simple-fold sequence exists that never folds a crease against its final direction", which
// is slightly stronger than the plain claim. Every EXHAUSTED verdict carries that asterisk.
//
// TERMINATION: three-way, and the three mean different things.
//   SOLVED     a sequence was found
//   EXHAUSTED  the search space was closed without one -> PROVEN not simple-foldable
//   TIMEOUT    budget hit, status unknown -- T4 makes this NP-hard, so this bucket is
//              non-empty by necessity and is reported, never silently folded into EXHAUSTED.
import fs from "fs"; import os from "os"; import path from "path";

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

/* ---------- the target: every crease of the CP, indexed by the line it lies on ----------- */
// Creases on one line are stored as 1-D intervals along that line's direction, each with the
// assignment the CP demands there. "U" is a wildcard, exactly as in stage 1.
//
// /!\ LINES ARE MATCHED BY TOLERANCE, NOT BY EXACT KEY, AND THIS IS LOAD-BEARING.
// An exact key was the original design and it produced FALSE "EXHAUSTED" verdicts on real
// data. CPs recovered from video carry coordinate noise of order 1e-6; normalising a segment's
// endpoints then lands collinear segments on unit normals that differ in the sixth decimal, so
// one straight crease is filed under two keys. Neither half then covers the chord a fold would
// make, every candidate fold is rejected, and the search reports the space as closed.
// Measured cost of that bug: 10 of PurelandFold's 27 models flipped verdict once it was fixed,
// EXHAUSTED 21 -> 11. The synthetic corpus has exact coordinates, so 160 round-trip tests
// never touched it -- see workspace/corpus/test-noise.mjs, which now does.
const LINE_TOL = 1e-5;          // well above the ~1e-6 noise seen, far below real geometry
const COVER_TOL = 1e-5;         // same, for gaps along a line

// The bucket a SEGMENT belongs to, allowing for noise, or null.
//
// Matching on (normal, offset) is the obvious thing and it does not work: a segment of length
// L with endpoint noise e has an angular error of about e/L, so a short crease -- L = 0.05,
// e = 1e-6 -- lands 2e-5 off in the normal while sitting well within a nanometre of the line
// it belongs to. Tightening the tolerance rejects real matches, loosening it merges genuinely
// different lines, and there is no setting that does both.
//
// So ask the question that is actually meant: is this segment ON that line? Perpendicular
// distance of its two endpoints, which noise moves by e and short segments do not amplify.
function findBucket(lines, l, P, Q) {
    for (const [k, L] of lines) {
        const n = L.line.n, d = L.line.d;
        if (Math.abs(n[0] * P[0] + n[1] * P[1] - d) > LINE_TOL) continue;
        if (Math.abs(n[0] * Q[0] + n[1] * Q[1] - d) > LINE_TOL) continue;
        return k;
    }
    return null;
}

/**
 * Condition a CP that came from outside: remove coordinate noise once, at the door.
 *
 * Tolerating noise inside the geometry does not work, and the reason is worth stating because
 * it looks like a tuning problem and is not. Raise clip()'s degeneracy threshold enough to
 * discard a sliver 1e-6 wide, and you also discard the genuinely thin layers a 19-fold sequence
 * produces, whose features are around 2e-6. One threshold cannot serve both; the noise has to
 * go away before the geometry runs.
 *
 * Two passes, in order:
 *   1. merge vertices that sit within `tol` of each other, so a shared corner is one point
 *   2. project every vertex back onto the line of the creases through it, so a chain of
 *      collinear creases is EXACTLY collinear again -- which is what makes a fold line pass
 *      exactly through a vertex instead of shaving a sliver off it
 *
 * `snap`, when non-zero, additionally rounds every coordinate onto that lattice. Measured on
 * jittered CPs known to be foldable: untreated 5/24 solve, the two passes above take it to
 * 6/24, snapping takes it to 24/24 (workspace/corpus/test-noise.mjs). The gap is the point --
 * the passes above APPROXIMATE the intended coordinates, while snapping RESTORES them, and
 * folding is exact reflection, so approximately-right is not right.
 *
 * /!\ Snapping assumes the source's true coordinates lie on that lattice. PurelandFold's do
 * (simple fractions from a video pipeline), ours do (folds halve, so dyadic). It is an
 * assumption about the data, not a general repair -- state it wherever it is switched on.
 *
 * Only for third-party data. Our own generated CPs are exact and must not be perturbed.
 */
function conditionCP(fold, tol = 1e-5, snap = 0) {
    const V = fold.vertices_coords.map(p => [p[0], p[1]]);
    const EV = fold.edges_vertices, EA = fold.edges_assignment;

    // 1. merge near-duplicate vertices
    const rep = V.map((_, i) => i);
    for (let i = 0; i < V.length; i++) {
        if (rep[i] !== i) continue;
        for (let j = i + 1; j < V.length; j++) {
            if (rep[j] !== j) continue;
            if (Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1]) <= tol) rep[j] = i;
        }
    }
    for (let i = 0; i < V.length; i++) if (rep[i] !== i) V[i] = V[rep[i]];

    // 2. snap collinear chains onto one line
    const buckets = new Map();
    for (const [i, [u, w]] of EV.entries()) {
        if (EA[i] === "B") continue;                        // the outline is not a crease chain
        const l = lineOf(V[u], V[w]);
        if (!l) continue;
        let k = findBucket(buckets, l, V[u], V[w]);
        if (k === null) { k = lkey(l); buckets.set(k, { line: l, verts: new Set() }); }
        buckets.get(k).verts.add(u); buckets.get(k).verts.add(w);
    }
    for (const { line, verts } of buckets.values()) {
        for (const vi of verts) {
            const p = V[vi];
            const off = line.n[0] * p[0] + line.n[1] * p[1] - line.d;
            V[vi] = [p[0] - off * line.n[0], p[1] - off * line.n[1]];
        }
    }
    if (snap > 0) for (let i = 0; i < V.length; i++)
        V[i] = [Math.round(V[i][0] / snap) * snap, Math.round(V[i][1] / snap) * snap];
    return { ...fold, vertices_coords: V };
}

function buildTarget(fold) {
    const V = fold.vertices_coords, EV = fold.edges_vertices, EA = fold.edges_assignment;
    const lines = new Map();
    let total = 0;
    for (const [i, a] of EA.entries()) {
        if (a !== "M" && a !== "V" && a !== "U") continue;
        const [u, w] = EV[i];
        const l = lineOf(V[u], V[w]);
        if (!l) continue;
        let k = findBucket(lines, l, V[u], V[w]);
        if (k === null) { k = lkey(l); lines.set(k, { line: l, want: [] }); }
        const L = lines.get(k);
        // Measure along the BUCKET-S direction, not this edge-s. lineOf() canonicalises the
        // normal but not the direction, so two edges on one line disagree by a sign whenever
        // their vertices are listed in opposite order. Using the per-edge frame silently files
        // half the creases in a mirrored coordinate system, and they then appear to sit
        // somewhere else on the line -- which reads downstream as an M/V contradiction on a
        // sequence that is perfectly real.
        const t = (p) => L.line.dir[0] * p[0] + L.line.dir[1] * p[1];
        const t0 = t(V[u]), t1 = t(V[w]);
        L.want.push({ lo: Math.min(t0, t1), hi: Math.max(t0, t1), a, covered: false });
        total++;
    }
    return { lines, total };
}

// Does [lo,hi] on this line lie inside target creases, and what assignment do they demand?
// Returns null when any part of the chord is not a crease of the CP at all -> illegal fold.
function demand(target, line, lo, hi) {
    const bk = findBucket(target.lines, line, ptOn(line, lo), ptOn(line, hi));
    if (bk === null) return null;
    const L = target.lines.get(bk);
    // the stored intervals use the STORED line's direction; ours may be the reverse
    const flip = L.line.dir[0] * line.dir[0] + L.line.dir[1] * line.dir[1] < 0;
    let a = flip ? -hi : lo, b = flip ? -lo : hi;
    const touched = [];
    let want = null, cursor = a;
    const segs = L.want.filter(s => s.hi > a + EPS && s.lo < b - EPS)
                       .sort((x, y) => x.lo - y.lo);
    for (const s of segs) {
        // Coverage is checked at COVER_TOL, not EPS: on noisy input the endpoints of two
        // collinear creases miss each other by ~1e-6, and at EPS that reads as a gap in the
        // paper -- the same false-EXHAUSTED failure as the line bucketing above.
        if (s.lo > cursor + COVER_TOL) return null;         // a gap: not a crease there
        if (s.a !== "U") { if (want && want !== s.a) return null; want = want || s.a; }
        touched.push(s);
        cursor = Math.max(cursor, s.hi);
    }
    if (cursor < b - COVER_TOL) return null;                // chord runs past the creases
    return { want, touched };                               // want === null => all wildcard
}

/* ---------- one fold: split every layer, reflect the moving side, collect the creases ----- */
// Returns null if the fold is illegal (creates a crease the CP does not have, or demands two
// different assignments on one line). Otherwise the successor state and what it covered.
function applyFold(state, line, movePositive, target) {
    const { n, d } = line;
    const R = reflectT(n, d);
    const next = [];
    const created = [];                                     // {seg, par}
    let splitSomething = false;

    for (const lay of state) {
        const stay = clip(lay.poly, n, d, !movePositive);
        const move = clip(lay.poly, n, d, movePositive);
        if (stay && move) {
            splitSomething = true;
            const c = chord(lay.poly, line);
            if (c) {
                // pull the chord back into original-square coordinates
                const P = ap(lay.inv, ptOn(line, c[0]));
                const Q = ap(lay.inv, ptOn(line, c[1]));
                created.push({ P, Q, par: lay.par });
            }
        }
        // the half that stays is CLIPPED, not the layer it came from -- pushing the
        // original polygon back leaves every layer at full size, so a later fold creases
        // paper that is no longer there
        if (stay) next.push({ ...lay, poly: stay });
        if (move) {
            const T = mul(R, lay.T);
            next.push({ poly: move.map(p => ap(R, p)), T, inv: inv(T), par: 1 - lay.par });
        }
    }
    if (!splitSomething) return null;                       // the line misses the stack entirely

    // every created crease must exist in the CP, and one fold has one direction
    let dirOver = null;
    const cover = [];
    for (const { P, Q, par } of created) {
        const l = lineOf(P, Q);
        if (!l) continue;
        const t0 = l.dir[0] * P[0] + l.dir[1] * P[1], t1 = l.dir[0] * Q[0] + l.dir[1] * Q[1];
        const got = demand(target, l, Math.min(t0, t1), Math.max(t0, t1));
        if (!got) return null;
        if (got.want) {
            // parity 0 folded over the top writes V; flipped layers and folding under invert it
            const over = (got.want === "V") === (par === 0);
            if (dirOver === null) dirOver = over;
            else if (dirOver !== over) return null;         // one fold cannot do both
        }
        cover.push(...got.touched);
    }
    if (!cover.length) return null;                         // a fold that creases nothing
    return { state: next, cover };
}

/* ---------- candidate folds: images of the CP's own crease lines, deduped ---------------- */
function candidates(state, target) {
    const seen = new Map();
    for (const lay of state) {
        for (const L of target.lines.values()) {
            const p = ap(lay.T, ptOn(L.line, 0));
            const q = ap(lay.T, ptOn(L.line, 1));
            const l = lineOf(p, q);
            if (l) seen.set(lkey(l), l);
        }
    }
    return [...seen.values()];
}

/* ---------- the search ------------------------------------------------------------------- */
// DFS over folds. Every node expansion is one simulated fold = one QUERY, and the query count
// is the whole point: it is the pure-search baseline our method's tool-call count is measured
// against. Budget is on queries, not on wall clock, so the number is reproducible.
function solve(fold, opts) {
    const target = buildTarget(fold);
    if (!target.total) return { status: "TRIVIAL", queries: 0, depth: 0 };

    // the flat sheet: one layer, the paper's boundary polygon, identity placement
    const V = fold.vertices_coords, EV = fold.edges_vertices, EA = fold.edges_assignment;
    const bEdges = EA.map((a, i) => a === "B" ? EV[i] : null).filter(Boolean);
    const sheet = boundaryLoop(bEdges, V);
    if (!sheet) return { status: "NO_BOUNDARY", queries: 0, depth: 0 };

    const start = [{ poly: sheet, T: ID, inv: ID, par: 0 }];
    let queries = 0, best = 0;
    const seq = [];
    // Revisiting a folded state can never help, and folds that add no new crease are NOT
    // useless -- one can rearrange the stack so a later fold becomes legal. So cycles are cut
    // by state identity, not by "did this cover anything new".
    const seen = new Set();
    const sig = (st) => st.map(l => {
        const r = (v) => Math.round(v * 1e6) / 1e6;
        let cx = 0, cy = 0;
        for (const p of l.poly) { cx += p[0]; cy += p[1]; }
        return `${r(cx / l.poly.length)},${r(cy / l.poly.length)},${l.poly.length},` +
               `${r(l.T.a)},${r(l.T.b)},${r(l.T.e)},${r(l.T.f)},${l.par}`;
    }).sort().join("|");

    const remaining = () => {
        let r = 0;
        for (const L of target.lines.values()) for (const s of L.want) if (!s.covered) r++;
        return r;
    };

    // ITERATIVE DEEPENING, not plain DFS. Plain DFS dives to the depth cap and "solves" CPs
    // with 24 folds that need 4, which makes the step counts meaningless and wastes the budget
    // in the deep end. IDDFS returns the SHORTEST sequence, and it is the shortest sequence
    // that the query-efficiency baseline has to be measured against.
    // `hitCap` records whether a pass was cut off by the depth limit rather than exhausted --
    // without it, running out of depth would masquerade as proof that nothing exists.
    let hitCap = false;

    function dfs(state, depth, limit) {
        if (remaining() === 0) return true;
        if (depth >= limit) { hitCap = true; return false; }
        // try the folds that finish off the most creases first
        const moves = [];
        for (const line of candidates(state, target)) {
            for (const movePositive of [true, false]) {
                if (queries >= opts.maxQueries) throw new Error("BUDGET");
                queries++;
                const r = applyFold(state, line, movePositive, target);
                if (!r) continue;
                moves.push({ line, movePositive, r, gain: r.cover.filter(s => !s.covered).length });
            }
        }
        moves.sort((a, b) => b.gain - a.gain);
        for (const m of moves) {
            const k = sig(m.r.state);
            if (seen.has(k)) continue;
            seen.add(k);
            const fresh = m.r.cover.filter(s => !s.covered);
            for (const s of fresh) s.covered = true;
            seq.push({ line: m.line, movePositive: m.movePositive });
            best = Math.max(best, depth + 1);
            if (dfs(m.r.state, depth + 1, limit)) return true;
            seq.pop();
            for (const s of fresh) s.covered = false;
            seen.delete(k);
        }
        return false;
    }

    try {
        for (let limit = 1; limit <= opts.maxDepth; limit++) {
            hitCap = false;
            seen.clear();
            if (dfs(start, 0, limit)) return { status: "SOLVED", queries, depth: seq.length };
            if (!hitCap) return { status: "EXHAUSTED", queries, depth: best };  // truly closed
        }
        return { status: "DEPTH_CAP", queries, depth: opts.maxDepth };
    } catch (e) {
        if (e.message === "BUDGET") return { status: "TIMEOUT", queries, depth: best };
        throw e;
    }
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

export { solve, conditionCP, applyFold, candidates, buildTarget, boundaryLoop, lineOf, lkey, ptOn, ap, mul, inv, ID, reflectT, clip, chord };

/* ---------- driver (skipped when this file is imported, e.g. by selftest.mjs) ------------- */
const IS_MAIN = process.argv[1] && process.argv[1].endsWith("stage2.mjs");
if (IS_MAIN) {
const EX = path.join(os.homedir(), "Downloads/flat-folder-main/examples/instagram");
const argv = Object.fromEntries(process.argv.slice(2).map(s => s.split("=")));
const opts = {
    maxQueries: Number(argv["--budget"] ?? 200000),
    maxDepth:   Number(argv["--depth"]  ?? 32),
};
const only = argv["--only"];                                 // substring filter, for smoke tests

// By default stage 2 only runs the CPs stage 1 left in play -- running it on a CP already
// proven unfoldable would burn budget to re-derive a known answer.
const HERE = path.dirname(new URL(import.meta.url).pathname);
let inPlay = null;
if (!argv["--all"]) {
    const vp = path.join(HERE, "stage1-verdicts.json");
    if (!fs.existsSync(vp)) {
        console.error("run screen.mjs first (it writes stage1-verdicts.json), or pass --all");
        process.exit(1);
    }
    inPlay = new Set(JSON.parse(fs.readFileSync(vp, "utf8"))
                         .filter(v => v.stage1 === "IN_PLAY").map(v => v.f));
}

const files = fs.readdirSync(EX).filter(f => f.endsWith(".fold")).sort()
                .filter(f => !only || f.includes(only))
                .filter(f => !inPlay || inPlay.has(f));

const tally = {};
const rows = [];
for (const f of files) {
    let fold; try { fold = JSON.parse(fs.readFileSync(path.join(EX, f), "utf8")); } catch { continue; }
    const t0 = Date.now();
    let r; try { r = solve(fold, opts); }
    catch (e) { r = { status: "ERROR", queries: 0, depth: 0, err: e.message }; }
    r.ms = Date.now() - t0;
    tally[r.status] = (tally[r.status] || 0) + 1;
    rows.push({ f, ...r });
    console.log(`${f.slice(0,44).padEnd(45)} ${r.status.padEnd(10)} queries=${String(r.queries).padStart(8)} steps=${String(r.depth).padStart(3)} ${r.ms}ms${r.err ? "  " + r.err : ""}`);
}

console.log(`\n=== stage 2 over ${rows.length} CPs  (budget ${opts.maxQueries} queries, depth ${opts.maxDepth}) ===`);
for (const k of Object.keys(tally).sort()) console.log(`  ${k.padEnd(12)} ${tally[k]}`);
const solved = rows.filter(r => r.status === "SOLVED").map(r => r.queries).sort((a,b)=>a-b);
if (solved.length) {
    const q = (p) => solved[Math.min(solved.length - 1, Math.floor(p * solved.length))];
    console.log(`\nqueries to solve (the pure-search baseline): p10=${q(.1)} p50=${q(.5)} p90=${q(.9)} max=${solved[solved.length-1]}`);
}
fs.writeFileSync(path.join(HERE, "stage2-results.json"),
                 JSON.stringify(rows, null, 1));
console.log(`\nper-CP results -> workspace/probe-c/stage2-results.json`);
}
