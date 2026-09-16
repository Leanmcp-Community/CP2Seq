// Is the "reality anchor" actually inside our frozen action space?
//
// THE QUESTION. Every synthetic sample is an abstract, symmetric, grid-like pattern, while
// PurelandFold's real models are recognisable things -- a dog, a horse head. If that gap is
// just "random folding has no intent", fine: named models have to be authored rather than
// sampled. But there is a second possible cause, and it would be much more serious.
//
// Our action space is frozen to ALL-LAYERS simple folding: every fold flips the entire stack
// across one line. That operation cannot touch a subset of layers, so what it can build is
// necessarily symmetric and repetitive. Recognisable shapes generally need a fold that moves
// SOME layers and leaves others -- which the theory names as a different model entirely
// (one-layer / some-layers / all-layers, notes/plan/track1-surface-simulator.md).
//
// If PurelandFold's models use one-layer folds, then the anchor is NOT in our action space,
// "reality anchor" is the wrong label for it, and the abstractness of the corpus is a
// consequence of the frozen decision rather than of random sampling.
//
// This runs the all-layers solver over each real model's final CP and reports what it finds.
// F edges are counted separately: a CP carrying them is already out of scope by the pre-crease
// decision, so it cannot be evidence either way about layers.
//
//   node check-anchor.mjs [budget]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { solve } from "../probe-c/stage2.mjs";
// The tolerant target is Dheeraj's (DHEERAJ_WORKSPACE/baseline/tolerant.mjs, PR #13). It is
// used rather than reimplemented, and rather than the vertex-snapping this script tried first:
// his header records that re-fitting lines and snapping vertices leaves a residual around 1e-6,
// which is exactly the scale lkey rounds at, so repairing the data cannot beat the key. The
// lookup is what has to be tolerant.
import { tolerantTarget } from "../../DHEERAJ_WORKSPACE/baseline/tolerant.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.join(HERE, "../purelandfold/models");
const BUDGET = Number(process.argv[2] ?? 200000);
const SNAP = 1e-4;              // PurelandFold stores 3 decimals; this is the lattice they sit on

if (!fs.existsSync(MODELS)) {
    console.error("no models/ — run: python workspace/data/export_purelandfold_models.py");
    process.exit(1);
}

const rows = [];
for (const name of fs.readdirSync(MODELS).sort()) {
    const d = path.join(MODELS, name);
    if (!fs.statSync(d).isDirectory()) continue;
    const info = JSON.parse(fs.readFileSync(path.join(d, "info.json"), "utf8"));
    const tag = `step-${String(info.max_step).padStart(2, "0")}.fold`;
    const p = path.join(d, tag);
    if (!fs.existsSync(p)) continue;
    const cp = JSON.parse(fs.readFileSync(p, "utf8"));
    const c = cp.edges_assignment.reduce((m, a) => (m[a] = (m[a] || 0) + 1, m), {});

    // /!\ TWO REPAIRS, AND THEY FIX DIFFERENT HALVES OF THE SAME BUG. Measured over all 27
    // models as a 2x2 (raw/snapped x exact/tolerant target):
    //
    //                  EXHAUSTED  SOLVED  TIMEOUT
    //   raw   + exact       21       1        5
    //   raw   + tolerant    21       1        5     <- tolerance alone changes NO verdict
    //   snap  + exact       12       7        8
    //   snap  + tolerant    12       7        8
    //
    // The tolerant target does what it claims -- on bird it merges 8 line buckets into 6 and
    // restores the full 1.414-long diagonal -- but through this solver that is not enough,
    // because the failure simply moves downstream to demand()'s 1e-7 coverage test and to the
    // clipping, which still do exact arithmetic on noisy coordinates. Snapping repairs the
    // geometry itself, so every exact check downstream passes too.
    //
    // Both are applied: tolerance costs nothing and is the right fix for the indexing, and the
    // snap is what actually moves verdicts. /!\ The snap assumes the source's true coordinates
    // are simple fractions -- PurelandFold stores 3 decimals, so they are. Stated, not hidden.
    // Neither is applied inside stage2.mjs: instagram is full precision and Probe C's EXHAUSTED
    // verdicts depend on exact matching there.
    const snapped = { ...cp, vertices_coords:
        cp.vertices_coords.map(q => q.map(v => Math.round(v / SNAP) * SNAP)) };
    const t0 = Date.now();
    let r;
    try { r = solve(snapped, { maxQueries: BUDGET, maxDepth: 24, target: tolerantTarget(snapped) }); }
    catch (e) { r = { status: "ERROR", queries: 0, depth: 0, err: e.message }; }
    r.ms = Date.now() - t0;

    rows.push({ name, eff: info.effective_steps, F: c.F || 0,
                creases: (c.M || 0) + (c.V || 0), ...r });
    console.log(`${name.padEnd(20)} eff=${String(info.effective_steps).padStart(2)} ` +
                `creases=${String((c.M||0)+(c.V||0)).padStart(3)} F=${String(c.F||0).padStart(2)}  ` +
                `${r.status.padEnd(10)} q=${String(r.queries).padStart(7)} ${r.ms}ms`);
}

const t = (s) => rows.filter(r => r.status === s).length;
const noF = rows.filter(r => r.F === 0);
console.log(`\n=== ${rows.length} real Pureland models against the ALL-LAYERS solver ` +
            `(budget ${BUDGET}) ===`);
for (const s of [...new Set(rows.map(r => r.status))].sort())
    console.log(`  ${s.padEnd(12)} ${t(s)}`);
console.log(`\ncarrying F edges (already out of scope by the pre-crease decision): ` +
            `${rows.length - noF.length}/${rows.length}`);
console.log(`of the ${noF.length} with no F edge: ` +
            `${noF.filter(r => r.status === "SOLVED").length} SOLVED, ` +
            `${noF.filter(r => r.status === "EXHAUSTED").length} EXHAUSTED, ` +
            `${noF.filter(r => r.status === "TIMEOUT").length} TIMEOUT`);
console.log(`\nEXHAUSTED on a model a person demonstrably folded means the sequence they used is`);
console.log(`not expressible as all-layers simple folds. SOLVED means it is -- by some sequence,`);
console.log(`not necessarily theirs, since a CP generally has many.`);
console.log(`\nSo the answer is a split, not a verdict: part of PurelandFold is inside our action`);
console.log(`space and part is demonstrably outside it. Neither "it is the reality anchor" nor`);
console.log(`"it is entirely out of scope" survives this table.`);
console.log(`\n/!\\ The first run of this script said 20 EXHAUSTED and that was a rounding artefact,`);
console.log(`not a finding. Eleven verdicts move between raw and snapped coordinates, so the`);
console.log(`repair above is load-bearing -- see its comment for the 2x2 that isolates which`);
console.log(`half does the work. Re-run this rather than quoting old numbers.`);

fs.writeFileSync(path.join(HERE, "anchor-check.json"), JSON.stringify(rows, null, 1) + "\n");
