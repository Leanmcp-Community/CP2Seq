// Why did the search close? Enumerate the FIRST fold and report the reason each candidate
// was rejected.
//
//   node DHEERAJ_WORKSPACE/baseline/diagnose.mjs <file.fold>
//
// EXHAUSTED is not "the search gave up" -- DFS and BFS are complete, so it means the search
// graph was closed without reaching the goal: no sequence exists IN THIS ACTION SPACE. This
// tool shows that concretely by taking the flat square, trying every candidate first fold, and
// printing why each one was refused.
import fs from "fs"; import path from "path";
import { applyFold, candidates, boundaryLoop, lineOf, lkey, ptOn, ap, ID }
    from "../../workspace/probe-c/stage2.mjs";
import { tolerantTarget } from "./tolerant.mjs";
import { buildTarget } from "../../workspace/probe-c/stage2.mjs";

const file = process.argv[2];
if (!file) { console.error("usage: diagnose.mjs <file.fold>"); process.exit(1); }
const fold = JSON.parse(fs.readFileSync(file, "utf8"));

const TOL = process.env.SNAP_TOL ? Number(process.env.SNAP_TOL) : 0;
const target = TOL ? tolerantTarget(fold, TOL) : buildTarget(fold);
const V = fold.vertices_coords, EV = fold.edges_vertices, EA = fold.edges_assignment;
const bEdges = EA.map((a, i) => (a === "B" ? EV[i] : null)).filter(Boolean);
const sheet = boundaryLoop(bEdges, V);
if (!sheet) { console.error("no boundary loop"); process.exit(1); }
const start = [{ poly: sheet, T: ID, inv: ID, par: 0 }];

console.log(`${path.basename(file)}`);
console.log(`  ${target.total} target crease segments on ${target.lines.size} distinct lines\n`);

// --- per-line: does the CP demand more than one direction along it? ------------------------
// A single all-layers fold moves the whole stack one way, so it writes ONE direction along its
// line. If the CP wants M on part of a line and V on another part, no single fold can produce
// that line -- it has to be built up by folds that touch different layers, which is outside
// this action space.
let mixed = 0, spanning = 0, spanningConsistent = 0;
const xs = sheet.map((p) => p[0]), ys = sheet.map((p) => p[1]);
const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
const diag = Math.hypot(w, h);

console.log("  line inventory (a first fold needs ONE line, spanning the sheet, one direction):");
for (const L of target.lines.values()) {
    const kinds = new Set(L.want.map((s) => s.a).filter((a) => a !== "U"));
    const lo = Math.min(...L.want.map((s) => s.lo)), hi = Math.max(...L.want.map((s) => s.hi));
    const len = hi - lo;
    const spans = len > diag * 0.55;                 // crosses most of the sheet
    if (kinds.size > 1) mixed++;
    if (spans) spanning++;
    if (spans && kinds.size <= 1) spanningConsistent++;
}
console.log(`    lines demanding BOTH M and V somewhere along them : ${mixed} / ${target.lines.size}`);
console.log(`    lines long enough to span the sheet               : ${spanning}`);
console.log(`    ...of those, with a single consistent direction   : ${spanningConsistent}`);

// --- now actually try every candidate first fold -------------------------------------------
const reasons = new Map();
let legal = 0, tried = 0;
const legalMoves = [];

for (const line of candidates(start, target)) {
    for (const movePositive of [true, false]) {
        tried++;
        const r = applyFold(start, line, movePositive, target);
        if (r) { legal++; legalMoves.push({ line, movePositive, covers: r.cover.length }); continue; }

        // applyFold returns null without saying why; re-derive the reason here.
        const { n, d } = line;
        let side = 0, opp = 0;
        for (const p of sheet) {
            const s = n[0] * p[0] + n[1] * p[1] - d;
            if (s > 1e-7) side++; else if (s < -1e-7) opp++;
        }
        let why;
        if (!side || !opp) why = "line misses the sheet (no split)";
        else {
            // the chord this fold would crease, in original coordinates
            const L = target.lines.get(lkey(line));
            if (!L) why = "fold line is not a crease line of the CP at all";
            else {
                const kinds = new Set(L.want.map((s) => s.a).filter((a) => a !== "U"));
                if (kinds.size > 1) why = "CP demands BOTH M and V along this line";
                else why = "crease would extend past the CP's creases on this line (gap)";
            }
        }
        reasons.set(why, (reasons.get(why) || 0) + 1);
    }
}

console.log(`\n  first fold: ${tried} candidates tried, ${legal} legal`);
if (!legal) {
    console.log(`\n  NO LEGAL FIRST FOLD EXISTS. The search closes at the root -- that is the`);
    console.log(`  EXHAUSTED verdict, and it is a proof, not a timeout.\n`);
}
console.log("  rejection reasons:");
for (const [k, v] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(v).padStart(4)}  ${k}`);
}
if (legal) {
    console.log(`\n  legal first folds (line -> creases covered):`);
    for (const m of legalMoves.slice(0, 8)) {
        console.log(`    n=(${m.line.n[0].toFixed(3)},${m.line.n[1].toFixed(3)}) d=${m.line.d.toFixed(3)} ` +
                    `move=${m.movePositive ? "+" : "-"}  covers ${m.covers}`);
    }
}
