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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.join(HERE, "../purelandfold/models");
const BUDGET = Number(process.argv[2] ?? 200000);

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

    const t0 = Date.now();
    let r;
    try { r = solve(cp, { maxQueries: BUDGET, maxDepth: 24 }); }
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
console.log(`\nEXHAUSTED on a model a person demonstrably folded means the sequence they used`);
console.log(`is not expressible as all-layers simple folds -- i.e. the anchor is outside the`);
console.log(`frozen action space, and the abstractness of the synthetic corpus follows from`);
console.log(`that decision rather than from random sampling.`);

fs.writeFileSync(path.join(HERE, "anchor-check.json"), JSON.stringify(rows, null, 1) + "\n");
