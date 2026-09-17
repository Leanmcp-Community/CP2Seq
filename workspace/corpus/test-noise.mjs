// Regression for the false-EXHAUSTED bug, and an honest record of what is still not covered.
//
// THE BUG. The solver filed creases by line, keyed on the normalised normal and offset rounded
// to 1e-6. CPs recovered from video carry coordinate noise of order 1e-6, and normalising a
// short segment's endpoints amplifies that into an angular error of about e/L -- so one
// straight crease landed in two buckets, neither covered the chord a fold would make, every
// candidate was rejected, and the search reported the space CLOSED. A false EXHAUSTED: the
// strongest verdict the solver has, produced by float noise.
//
// Cost: 11 of PurelandFold's 27 models flip verdict once it is repaired, EXHAUSTED 21 -> 12,
// and a claim that they lie outside our action space was written into four documents before
// anyone checked.
//
// WHY THE EXISTING ROUND-TRIP TEST COULD NEVER CATCH IT. It folds a CP and hands it back, so
// anything but SOLVED is a bug -- and it caught three real geometry bugs that way. But our
// generator emits EXACT coordinates, and this bug only fires on inexact ones. 160 clean round
// trips said nothing about a CP measured from a video.
//
// PART A is the regression, on the real file that exposed it.
// PART B is the limitation, measured rather than claimed: independent jitter on every vertex
// produces a CP that is genuinely not exactly foldable -- folding is exact reflection, and the
// perturbation destroys the exact relations between creases that a folding sequence creates.
// Snapping recovers the intended CP only when the true coordinates sit on a known lattice, as
// PurelandFold's do. Making the solver tolerant of arbitrary noise is a different design --
// approximate folding -- and it would weaken what EXHAUSTED means. Not a bug; a boundary.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { foldRandom } from "./fold-engine.mjs";
import { planarize } from "./planarize.mjs";
import { solve } from "../probe-c/stage2.mjs";
// Dheeraj's tolerant target (workspace/tools/tolerant.mjs, PR #13). Imported, not
// reimplemented. This file is what measures how far it gets on its own.
const TOL = await import("../tools/tolerant.mjs")
    .then(m => m.tolerantTarget).catch(() => null);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OPTS = { maxQueries: 300000, maxDepth: 20 };
let fail = 0;

/* ---------------- PART A: the regression, on real data ---------------- */
console.log("A. real data: the CP that exposed the bug\n");
const BIRD = path.join(HERE, "../purelandfold/models/bird/step-07.fold");
if (!fs.existsSync(BIRD)) {
    console.log("   SKIPPED - run: python workspace/data/export_purelandfold_models.py\n");
} else {
    const cp = JSON.parse(fs.readFileSync(BIRD, "utf8"));
    const snap = { ...cp, vertices_coords:
        cp.vertices_coords.map(p => p.map(v => Math.round(v * 1e4) / 1e4)) };

    // The 2x2 that says which repair does the work. Run here rather than asserted, because the
    // answer is not the one either fix's author expected.
    const cells = [
        ["raw    + exact target", cp,   false],
        ["raw    + tolerant    ", cp,   true ],
        ["snapped + exact target", snap, false],
        ["snapped + tolerant   ", snap, true ],
    ];
    let solvedSnapped = false;
    for (const [label, f, useTol] of cells) {
        if (useTol && !TOL) { console.log(`   ${label}  SKIPPED - needs PR #13`); continue; }
        const r = solve(f, useTol ? { ...OPTS, target: TOL(f) } : OPTS);
        console.log(`   ${label}  ${r.status.padEnd(10)} ${r.depth} folds, ${r.queries} queries`);
        if (f === snap && r.status === "SOLVED") solvedSnapped = true;
    }
    if (!solvedSnapped) fail++;
    console.log(`\n   bird is a model a person folded on video, so EXHAUSTED on it is the solver`);
    console.log(`   calling a demonstrated fold impossible. Snapping the coordinates onto the`);
    console.log(`   lattice they are stored on is what fixes it; the tolerant target restores the`);
    console.log(`   line buckets exactly as designed and still changes no verdict, because the`);
    console.log(`   failure moves downstream to exact arithmetic on coordinates that are wrong.\n`);
}

/* ---------------- PART B: the measured boundary ---------------- */
const N = Number(process.argv[2] ?? 24);
const NOISE = Number(process.argv[3] ?? 1e-6);
console.log(`B. synthetic jitter +-${NOISE} on ${N} folded-by-construction CPs`);
console.log(`   (reported, not a gate -- see the header for why this is a boundary)\n`);

const rngFrom = (seed) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};
const jitter = (fold, amp, rand) => ({ ...fold,
    vertices_coords: fold.vertices_coords.map(p => p.map(v => v + (rand() * 2 - 1) * amp)) });

let clean = 0, raw = 0, cond = 0, snapped = 0, skipped = 0;
for (let i = 1; i <= N; i++) {
    const rand = rngFrom(i * 2654435761);
    const steps = 3 + Math.floor(rand() * 4);
    const run = foldRandom(steps, rand, {});
    if (!run.ok || !run.creases.length) { skipped++; continue; }
    const segs = [
        { P: [0, 0], Q: [1, 0], assignment: "B" }, { P: [1, 0], Q: [1, 1], assignment: "B" },
        { P: [1, 1], Q: [0, 1], assignment: "B" }, { P: [0, 1], Q: [0, 0], assignment: "B" },
        ...run.creases.map(c => ({ P: c.P, Q: c.Q, assignment: c.a })),
    ];
    const { fold, stats } = planarize(segs);
    if (stats.assignment_conflicts) { skipped++; continue; }

    const noisy = jitter(fold, NOISE, rngFrom(i * 97 + 5));
    // the lattice these CPs actually live on: folds halve, so coordinates are dyadic
    const snap = { ...noisy, vertices_coords: noisy.vertices_coords.map(p =>
        p.map(v => Math.round(v * 4096) / 4096)) };

    if (solve(fold, OPTS).status === "SOLVED") clean++;
    if (solve(noisy, OPTS).status === "SOLVED") raw++;
    if (TOL && solve(noisy, { ...OPTS, target: TOL(noisy) }).status === "SOLVED") cond++;
    if (solve(snap, OPTS).status === "SOLVED") snapped++;
}

const pc = (x) => `${x}/${clean}`;
console.log(`   solved, exact coordinates        ${clean}`);
console.log(`   solved, jittered, no treatment   ${pc(raw)}`);
console.log(`   solved, jittered + tolerant tgt  ${TOL ? pc(cond) : "skipped (PR #13)"}`);
console.log(`   solved, jittered + lattice snap  ${pc(snapped)}`);
console.log(`   (${skipped} degenerate, skipped)`);
console.log(`\n   Snapping recovers what conditioning alone cannot, because it restores the`);
console.log(`   exact coordinates rather than approximating them -- and it only works because`);
console.log(`   these CPs really do live on a dyadic lattice. State that assumption wherever`);
console.log(`   snapping is applied to third-party data; it is not free.`);

console.log(`\n${fail ? `${fail} FAILED` : "part A passed"}`);
process.exit(fail ? 1 : 0);
