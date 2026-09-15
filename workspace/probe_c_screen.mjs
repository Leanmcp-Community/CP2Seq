// PROBE C, stage 1 — an EXACT NECESSARY CONDITION for all-layers simple foldability.
//
// The first fold acts on a flat, single-layer square. An all-layers simple fold along an
// infinite line therefore folds along a straight line that crosses the paper boundary to
// boundary, and because the paper is one layer the whole line folds the same way, so every
// crease on that line carries the SAME assignment (all M, or all V).
//
//   => If a CP contains no full boundary-to-boundary crease line with a uniform assignment,
//      it is NOT all-layers simple-foldable.  Necessary, not sufficient.
//
// This is cheap and exact, and it bounds the answer to "how much real origami is Pureland?"
// from above before committing to the full (expensive, geometry-heavy) search.
import fs from "fs"; import os from "os"; import path from "path";

const EX = path.join(os.homedir(), "Downloads/flat-folder-main/examples");
const EPS = 1e-7;

// A crease edge lies on an infinite line; key it by a normalized (nx, ny, d).
function lineKey(p, q) {
    let dx = q[0] - p[0], dy = q[1] - p[1];
    const L = Math.hypot(dx, dy);
    if (L < EPS) return null;
    dx /= L; dy /= L;
    let nx = -dy, ny = dx;                     // unit normal
    if (nx < -EPS || (Math.abs(nx) <= EPS && ny < 0)) { nx = -nx; ny = -ny; }  // canonical sign
    const d = nx * p[0] + ny * p[1];
    const r = (v) => Math.round(v / 1e-6) * 1e-6;
    return { key: `${r(nx)},${r(ny)},${r(d)}`, nx, ny, d, dx, dy };
}

function analyze(fold) {
    const V = fold.vertices_coords, EV = fold.edges_vertices, EA = fold.edges_assignment;
    if (!V || !EV || !EA) return null;

    // boundary vertices = endpoints of edges assigned "B"
    const onB = new Set();
    for (const [i, a] of EA.entries()) if (a === "B") { onB.add(EV[i][0]); onB.add(EV[i][1]); }

    // Group crease edges by the infinite line they lie on.
    // "U" = unassigned direction: treated as a WILDCARD that can be either M or V, so a run
    // of M+U (or V+U) still counts as uniform. Reported separately from the strict count,
    // because 3813 of the corpus's edges are U and ignoring them biases the answer.
    const lines = new Map();
    for (const [i, a] of EA.entries()) {
        if (a !== "M" && a !== "V" && a !== "U") continue;
        const [u, w] = EV[i];
        const lk = lineKey(V[u], V[w]);
        if (!lk) continue;
        if (!lines.has(lk.key)) lines.set(lk.key, { ...lk, segs: [] });
        const L = lines.get(lk.key);
        const t = (p) => L.dx * p[0] + L.dy * p[1];        // 1-D coordinate along the line
        L.segs.push({ a, t0: Math.min(t(V[u]), t(V[w])), t1: Math.max(t(V[u]), t(V[w])),
                      vs: [u, w] });
    }

    let full = 0, fullUniform = 0, fullUniformStrict = 0;
    for (const L of lines.values()) {
        L.segs.sort((x, y) => x.t0 - y.t0);
        // walk maximal contiguous runs of creases along this line
        let run = [L.segs[0]], end = L.segs[0].t1;
        const runs = [];
        for (const s of L.segs.slice(1)) {
            if (s.t0 <= end + 1e-6) { run.push(s); end = Math.max(end, s.t1); }
            else { runs.push({ segs: run, t0: run[0].t0, t1: end }); run = [s]; end = s.t1; }
        }
        runs.push({ segs: run, t0: run[0].t0, t1: end });
        for (const r of runs) {
            // both extreme endpoints must be paper-boundary vertices
            const vs = r.segs.flatMap(s => s.vs);
            const tv = (v) => L.dx * V[v][0] + L.dy * V[v][1];
            let lo = vs[0], hi = vs[0];
            for (const v of vs) { if (tv(v) < tv(lo)) lo = v; if (tv(v) > tv(hi)) hi = v; }
            if (!onB.has(lo) || !onB.has(hi)) continue;
            full++;
            const A = new Set(r.segs.map(s => s.a));
            const nonU = new Set([...A].filter(x => x !== "U"));
            if (nonU.size <= 1) fullUniform++;                  // U acts as wildcard
            if (A.size === 1 && !A.has("U")) fullUniformStrict++; // no U involved at all
        }
    }
    return { faces: (fold.faces_vertices || []).length,
             creases: EA.filter(a => a === "M" || a === "V").length,
             full, fullUniform, fullUniformStrict,
             hasU: EA.some(a => a === "U") };
}

const dir = path.join(EX, "instagram");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".fold")).sort();
const rows = [];
let bad = 0;
for (const f of files) {
    let r = null;
    try { r = analyze(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))); }
    catch (e) { bad++; continue; }
    if (!r) { bad++; continue; }
    rows.push({ f, ...r });
}
const pass = rows.filter(r => r.fullUniform > 0);
const passStrict = rows.filter(r => r.fullUniformStrict > 0);
const withU = rows.filter(r => r.hasU);
const fullOnly = rows.filter(r => r.full > 0 && r.fullUniform === 0);
console.log(`instagram CPs analyzed: ${rows.length}  (unparsable: ${bad})\n`);
console.log(`has a full boundary-to-boundary crease line              : ${rows.filter(r=>r.full>0).length}/${rows.length} = ${(100*rows.filter(r=>r.full>0).length/rows.length).toFixed(1)}%`);
console.log(`  ...uniform, counting U as a wildcard                   : ${pass.length}/${rows.length} = ${(100*pass.length/rows.length).toFixed(1)}%   <-- UPPER BOUND on simple-foldable`);
console.log(`  ...uniform strictly (no U edges on the line)           : ${passStrict.length}/${rows.length} = ${(100*passStrict.length/rows.length).toFixed(1)}%`);
console.log(`  ...full line exists but none uniform                   : ${fullOnly.length}`);
console.log(`FAILS the necessary condition -> definitely NOT foldable  : ${rows.length-pass.length}/${rows.length} = ${(100*(rows.length-pass.length)/rows.length).toFixed(1)}%`);
console.log(`   of which: no full line at all = ${rows.filter(r=>r.full===0).length}, full line but never uniform = ${fullOnly.length}`);
console.log(`\nCPs containing any U edge: ${withU.length}/${rows.length}`);

const by = (sel) => { const v = rows.filter(sel).map(r=>r.faces).sort((a,b)=>a-b);
    return v.length ? `n=${v.length} faces p50=${v[v.length>>1]}` : "n=0"; };
console.log(`\nsize profile:  passes -> ${by(r=>r.fullUniform>0)}   |   fails -> ${by(r=>r.fullUniform===0)}`);
console.log(`\nfirst 12 that PASS the screen (candidates for the full search):`);
for (const r of pass.slice(0, 12))
    console.log(`  ${r.f.slice(0,44).padEnd(45)} faces=${String(r.faces).padStart(5)} creases=${String(r.creases).padStart(5)} fullUniform=${r.fullUniform}`);
