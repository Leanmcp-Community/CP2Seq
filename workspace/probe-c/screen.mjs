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

// Collect the maximal runs of edges that lie on one infinite line and span the paper from
// boundary to boundary.  `accept` picks which assignments count as an edge for this pass.
function spanningRuns(V, EV, EA, onB, accept) {
    const lines = new Map();
    for (const [i, a] of EA.entries()) {
        if (!accept(a)) continue;
        const [u, w] = EV[i];
        const lk = lineKey(V[u], V[w]);
        if (!lk) continue;
        if (!lines.has(lk.key)) lines.set(lk.key, { ...lk, segs: [] });
        const L = lines.get(lk.key);
        const t = (p) => L.dx * p[0] + L.dy * p[1];        // 1-D coordinate along the line
        L.segs.push({ a, t0: Math.min(t(V[u]), t(V[w])), t1: Math.max(t(V[u]), t(V[w])),
                      vs: [u, w] });
    }
    const out = [];
    for (const L of lines.values()) {
        L.segs.sort((x, y) => x.t0 - y.t0);
        let run = [L.segs[0]], end = L.segs[0].t1;
        const runs = [];
        for (const s of L.segs.slice(1)) {
            if (s.t0 <= end + 1e-6) { run.push(s); end = Math.max(end, s.t1); }
            else { runs.push(run); run = [s]; end = s.t1; }
        }
        runs.push(run);
        for (const r of runs) {
            // both extreme endpoints must be paper-boundary vertices
            const vs = r.flatMap(s => s.vs);
            const tv = (v) => L.dx * V[v][0] + L.dy * V[v][1];
            let lo = vs[0], hi = vs[0];
            for (const v of vs) { if (tv(v) < tv(lo)) lo = v; if (tv(v) > tv(hi)) hi = v; }
            if (!onB.has(lo) || !onB.has(hi)) continue;
            out.push(new Set(r.map(s => s.a)));
        }
    }
    return out;                                            // one assignment-set per spanning run
}

function analyze(fold) {
    const V = fold.vertices_coords, EV = fold.edges_vertices, EA = fold.edges_assignment;
    if (!V || !EV || !EA) return null;

    // boundary vertices = endpoints of edges assigned "B"
    const onB = new Set();
    for (const [i, a] of EA.entries()) if (a === "B") { onB.add(EV[i][0]); onB.add(EV[i][1]); }

    // Pass 1 -- the simple-foldability screen.
    // "U" = unassigned direction: treated as a WILDCARD that can be either M or V, so a run
    // of M+U (or V+U) still counts as uniform. Reported separately from the strict count,
    // because 3813 of the corpus's edges are U and ignoring them biases the answer.
    const runs = spanningRuns(V, EV, EA, onB, a => a === "M" || a === "V" || a === "U");
    let full = 0, fullUniform = 0, fullUniformStrict = 0;
    for (const A of runs) {
        full++;
        const nonU = new Set([...A].filter(x => x !== "U"));
        if (nonU.size <= 1) fullUniform++;                  // U acts as wildcard
        if (A.size === 1 && !A.has("U")) fullUniformStrict++; // no U involved at all
    }

    // Pass 2 -- PRE-CREASES.  "F" = flat/unfolded: a crease line at fold angle 0.
    //
    // Pure all-layers simple folding has NO unfold operation, so a crease that ends up flat
    // cannot exist in a CP it produced.  Every genuine F crease is therefore a trace of an
    // action outside the action space -- which makes the CP a FALSE POSITIVE of pass 1: it
    // satisfies the necessary condition, but the real model was not built by simple folds.
    //
    // /! FOLD overloads "F": exporters also emit it for FACET edges introduced by
    // TRIANGULATING a polygon face.  Those are not creases and must not be counted.
    // Resolved 2026-09-15 by measurement, not by assumption:
    //
    //   * Triangulation is applied to a whole model, never to one face.  NO CP in this
    //     corpus is fully triangulated -- the maximum triangle-face fraction among the 69
    //     CPs carrying F edges is 90.9% (058_ku_Color-change_Pinwheel_1), and triangles at
    //     that rate are ordinary origami geometry (bird/frog bases), not an export artifact.
    //   * Only 8.5% of F edges (918/10827) even have the local facet signature, i.e. both
    //     adjacent faces triangular -- and no CP consists solely of those.
    //
    // => facet contamination in this corpus is nil.  Every F edge is a genuine flat crease.
    //
    // fFacet counts the locally-suspicious ones anyway, so the claim stays auditable, and
    // fSpan (an F run crossing the paper boundary to boundary) is kept as the STRONG subset:
    // a pre-crease left by a simple fold spans the whole sheet, by pass 1's own argument.
    const faceV = fold.faces_vertices || [];
    const adj = new Map();                                 // undirected vertex pair -> face sizes
    for (const face of faceV) for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length];
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        if (!adj.has(k)) adj.set(k, []);
        adj.get(k).push(face.length);
    }
    let fEdges = 0, fFacet = 0;
    for (const [i, a] of EA.entries()) {
        if (a !== "F") continue;
        fEdges++;
        const [u, w] = EV[i], k = u < w ? `${u},${w}` : `${w},${u}`;
        const sz = adj.get(k) || [];
        if (sz.length === 2 && sz[0] === 3 && sz[1] === 3) fFacet++;
    }

    return { faces: faceV.length,
             creases: EA.filter(a => a === "M" || a === "V").length,
             full, fullUniform, fullUniformStrict,
             hasU: EA.some(a => a === "U"),
             fEdges, fFacet,
             fReal: fEdges - fFacet,                        // genuine flat creases
             fSpan: spanningRuns(V, EV, EA, onB, a => a === "F").length,
             allTri: faceV.length > 0 && faceV.every(f => f.length === 3) };
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
// ---------------------------------------------------------------------------------------
// PRE-CREASES among the CPs that passed.  A CP that passes pass 1 but carries a genuine
// pre-crease is a FALSE POSITIVE: nothing about it is reachable by simple folds alone.
// Subtracting them tightens the lower bound on "provably not simple-foldable".
const preFP     = pass.filter(r => r.fReal > 0 && !r.allTri);   // any genuine flat crease
const preStrong = preFP.filter(r => r.fSpan > 0);               // strong subset: spans the sheet
const tightened = rows.length - pass.length + preFP.length;

console.log(`\n--- pre-creases (F = flat/unfolded) -------------------------------------`);
console.log(`CPs containing any F edge                                : ${rows.filter(r=>r.fEdges>0).length}/${rows.length}   (F edges: ${rows.reduce((s,r)=>s+r.fEdges,0)})`);
console.log(`fully triangulated CPs (F presumed facet artifacts)      : ${rows.filter(r=>r.allTri).length}`);
console.log(`F edges with the local facet signature (both faces tri)  : ${rows.reduce((s,r)=>s+r.fFacet,0)} = ${(100*rows.reduce((s,r)=>s+r.fFacet,0)/Math.max(1,rows.reduce((s,r)=>s+r.fEdges,0))).toFixed(1)}%  (still counted as creases below; no CP is made only of these)`);
console.log(`\namong the ${pass.length} that PASS the screen:`);
console.log(`  carry a genuine flat crease                             : ${preFP.length}   <-- FALSE POSITIVES`);
console.log(`    of which the F run spans the sheet (strongest)        : ${preStrong.length}`);
console.log(`\nlower bound on NOT simple-foldable:`);
console.log(`  screen alone                 : ${rows.length-pass.length}/${rows.length} = ${(100*(rows.length-pass.length)/rows.length).toFixed(1)}%`);
console.log(`  screen + confident pre-crease: ${tightened}/${rows.length} = ${(100*tightened/rows.length).toFixed(1)}%`);
console.log(`  upper bound on simple-foldable drops to ${(100*(pass.length-preFP.length)/rows.length).toFixed(1)}%`);
if (preFP.length) {
    console.log(`\nfalse positives (pass the screen, but were pre-creased):`);
    for (const r of preFP.slice(0, 15))
        console.log(`  ${r.f.slice(0,44).padEnd(45)} faces=${String(r.faces).padStart(5)} F=${String(r.fEdges).padStart(4)} facet=${String(r.fFacet).padStart(4)} spanningF=${r.fSpan}`);
}

// Stage 2 consumes this: the CPs still in play, i.e. passed the screen AND carry no
// pre-crease. Written next to the script so the two stages cannot drift apart.
const verdict = rows.map(r => ({
    f: r.f,
    stage1: !pass.includes(r) ? "NOT_FOLDABLE_SCREEN"
          : preFP.includes(r) ? "NOT_FOLDABLE_PRECREASE"
          : "IN_PLAY",
    faces: r.faces, fEdges: r.fEdges, fReal: r.fReal, fSpan: r.fSpan,
}));
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "stage1-verdicts.json"),
                 JSON.stringify(verdict, null, 1));
console.log(`\nin play for stage 2: ${verdict.filter(v=>v.stage1==="IN_PLAY").length}  -> workspace/probe-c/stage1-verdicts.json`);

console.log(`\nfirst 12 that PASS the screen (candidates for the full search):`);
for (const r of pass.slice(0, 12))
    console.log(`  ${r.f.slice(0,44).padEnd(45)} faces=${String(r.faces).padStart(5)} creases=${String(r.creases).padStart(5)} fullUniform=${r.fullUniform}`);
