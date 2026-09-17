// Comparing two crease patterns, and why the obvious way is wrong.
//
// Extracted so the round-trip gate and the corpus verifier use ONE definition of "these two
// patterns are the same paper". Two definitions is how a corpus and its checker end up
// disagreeing about a sample that is fine.
//
import { lineOf } from "../probe-c/stage2.mjs";

// A CP's creases as GEOMETRY, not as an edge list.
//
// /!\ COMPARING EDGE LISTS IS THE WRONG TEST, and it cost two false failures before this was
// understood. planarize() subdivides a crease wherever another crease crosses it, so the same
// physical fold line comes back as one edge in one CP and two in another purely because the
// folds were made in a different order. The two crease patterns are identical as PAPER and
// differ as graphs. What has to match is the set of creased SEGMENTS, so this projects every
// crease onto its own line, merges collinear pieces that touch, and compares the unions.
//
// The line key is rounded coarser than lkey's 1e-6 for the reason recorded above the imports:
// dyadic coordinates land exactly on 1e-6 rounding ties, and a key that flips there would split
// one line into two and defeat the merge it is there to enable.

const TOL = 2e-6;
const GAP = 1e-5;                                   // pieces closer than this are one crease

function creaseGeometry(fold) {
    const byLine = new Map();
    let degenerate = 0;
    for (const [i, [u, w]] of fold.edges_vertices.entries()) {
        const a = fold.edges_assignment[i];
        if (a !== "M" && a !== "V") continue;
        const A = fold.vertices_coords[u], B = fold.vertices_coords[w];
        const l = lineOf(A, B);
        if (!l) { degenerate++; continue; }
        // /!\ QUANTISE THE LINE KEY ON A BINARY GRID, NOT A DECIMAL ONE. Paper coordinates are
        // DYADIC -- folding halves things -- so a value like 0.90625 = 29/32 multiplied by 1e4
        // gives 9062.5, exactly a rounding tie, and the two halves of one straight crease land
        // in buckets 0.9062 and 0.9063 and are never merged. Measured: that alone accounted for
        // replay failures on deep some-layers samples whose sequences were perfectly correct.
        //
        // 2^12 makes every dyadic value with denominator up to 4096 land exactly on a grid point,
        // so it cannot tie. For the irrational offsets a 45-degree normal produces, rounding is
        // generic and ties have measure zero. This is the fix the tolerance work flagged as the
        // real one and did not take at the time.
        const rb = (v) => Math.round(v * 4096) / 4096;
        const key = `${rb(l.n[0])},${rb(l.n[1])},${rb(l.d)},${a}`;
        // /!\ THE DIRECTION MUST COME FROM THE NORMAL, NOT FROM AN EDGE. lineOf canonicalises
        // the normal but NOT the direction, so taking it from "whichever edge of this line
        // arrived first" gives opposite answers in two crease patterns that merely list an
        // edge's endpoints in opposite order. The same crease then projects to [0.270, 0.668]
        // in one and [-0.668, -0.270] in the other, and the comparison reports it as one
        // missing plus one extra. stage2.mjs carries a warning about exactly this trap for
        // edges within ONE pattern; across two patterns a per-bucket direction is not enough.
        // n is sign-canonical, so rotating it is deterministic everywhere.
        const dir = [-l.n[1], l.n[0]];
        if (!byLine.has(key)) byLine.set(key, { dir, segs: [] });
        const L = byLine.get(key);
        const t = (p) => L.dir[0] * p[0] + L.dir[1] * p[1];
        const t0 = t(A), t1 = t(B);
        if (Math.abs(t1 - t0) < TOL) { degenerate++; continue; }
        L.segs.push([Math.min(t0, t1), Math.max(t0, t1)]);
    }
    const out = [];
    for (const [key, L] of byLine) {
        L.segs.sort((x, y) => x[0] - y[0]);
        let cur = null;
        for (const s of L.segs) {
            if (cur && s[0] <= cur[1] + GAP) { cur[1] = Math.max(cur[1], s[1]); continue; }
            if (cur) out.push(`${key}|${cur[0]}|${cur[1]}`);
            cur = [...s];
        }
        if (cur) out.push(`${key}|${cur[0]}|${cur[1]}`);
    }
    out.sort();
    out.degenerate = degenerate;
    return out;
}

// Every merged crease in `a` matched to a distinct one in `b`: same line key and assignment,
// endpoints within TOL. TOL exceeds the quantisation rather than equalling it -- two roundings
// of one coordinate can differ by a full 1e-6, and in floating point by a hair more.
function pairsUp(a, b) {
    const parse = (s) => { const p = s.split("|"); return { key: p[0], lo: +p[1], hi: +p[2] }; };
    const B = b.map(parse);
    const used = new Array(B.length).fill(false);
    for (const x of a.map(parse)) {
        let hit = -1;
        for (let j = 0; j < B.length; j++) {
            if (used[j] || B[j].key !== x.key) continue;
            if (Math.abs(B[j].lo - x.lo) <= TOL && Math.abs(B[j].hi - x.hi) <= TOL) { hit = j; break; }
        }
        if (hit < 0) { pairsUp.unmatched = `${x.key} [${x.lo.toFixed(6)}, ${x.hi.toFixed(6)}]`; return false; }
        used[hit] = true;
    }
    return true;
}


export { creaseGeometry, pairsUp, TOL };
