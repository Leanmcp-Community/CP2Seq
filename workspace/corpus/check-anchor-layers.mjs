// Are the real Pureland models inside the SOME-LAYERS action space?
//
// check-anchor.mjs asked this of the all-layers tier and got a split: of 27 real models, 7 are
// foldable under all-layers rules, 12 are PROVEN not, 8 unknown. That result is what motivated
// building the some-layers tier in the first place -- 44.4% of a corpus of demonstrably folded
// paper being outside the action space is a statement about the action space, not the paper.
//
// The some-layers solver did not exist when that was measured. This re-asks the same question of
// the wider tier, and the answer matters more than a number: every model here is a real design by
// a real person -- dog, fox head, penguin, yacht -- so a model that moves from EXHAUSTED to
// SOLVED is a recognisable, named, human-designed instance with a VERIFIED action-level sequence.
// That is exactly what the corpus is short of. Twenty hand-authored models are twenty models one
// person made up; these are the real thing.
//
// /!\ WHAT A SOLVED VERDICT DOES AND DOES NOT SAY. It says the crease pattern is reachable by
// some some-layers simple-fold sequence. It does NOT say the designer used that sequence -- a CP
// generally admits many -- and it does not say the designer's own sequence is inside the tier.
// For the paper, "this model is expressible in the tier" is the claim; "this is how they folded
// it" is not.
//
// /!\ THE TWO REPAIRS ARE INHERITED FROM check-anchor.mjs AND BOTH ARE LOAD-BEARING. PurelandFold
// stores 3 decimals, and on that data snapping the coordinates to their lattice moved ELEVEN
// verdicts in the all-layers run -- the first version of that script reported 20 EXHAUSTED and
// that was a rounding artefact, not a finding. The tolerant target fixes the line indexing; the
// snap fixes the geometry every downstream exact check then runs on. Neither is applied inside
// the solvers, because the instagram corpus is full precision and its verdicts depend on exact
// matching there.
//
// /!\ F EDGES ARE COUNTED SEPARATELY, not folded into the tally. A CP carrying a flat crease is
// already outside scope by the pre-crease decision, so it is evidence about neither tier.
//
//   node check-anchor-layers.mjs [budget]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { solveLayers } from "./solve-layers.mjs";
import { tolerantTarget } from "../tools/tolerant.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.join(HERE, "../purelandfold/models");
const BUDGET = Number(process.argv[2] ?? 2000000);
const SNAP = 1e-4;

if (!fs.existsSync(MODELS)) {
    console.error("no models/ -- run: python workspace/data/export_purelandfold_models.py");
    process.exit(1);
}

// The all-layers verdicts, so the two tiers sit in one table. Without them a reader cannot see
// the only thing this run is for: which models the wider action space picks up.
const prevPath = path.join(HERE, "anchor-check.json");
const prev = fs.existsSync(prevPath)
    ? Object.fromEntries(JSON.parse(fs.readFileSync(prevPath, "utf8"))
        .map(r => [r.name ?? r.f, r.status]))
    : {};

const rows = [];
console.log(`${"model".padEnd(20)} ${"eff".padStart(3)} ${"creases".padStart(7)} ${"F".padStart(3)}  ` +
            `${"all-layers".padEnd(11)} ${"some-layers".padEnd(11)} queries`);

for (const name of fs.readdirSync(MODELS).sort()) {
    const d = path.join(MODELS, name);
    if (!fs.statSync(d).isDirectory()) continue;
    const info = JSON.parse(fs.readFileSync(path.join(d, "info.json"), "utf8"));
    const tag = `step-${String(info.max_step).padStart(2, "0")}.fold`;
    const p = path.join(d, tag);
    if (!fs.existsSync(p)) continue;
    const cp = JSON.parse(fs.readFileSync(p, "utf8"));
    const c = cp.edges_assignment.reduce((m, a) => (m[a] = (m[a] || 0) + 1, m), {});

    const snapped = { ...cp, vertices_coords:
        cp.vertices_coords.map(q => q.map(v => Math.round(v / SNAP) * SNAP)) };

    const t0 = Date.now();
    let r;
    // maxDepth is the model's own effective step count plus headroom: the tier may reach the
    // same pattern in fewer folds, and capping at the real number would forbid that rather than
    // measure it. maxLayers is generous because real models stack deeply.
    try {
        r = solveLayers(snapped, { maxQueries: BUDGET, maxDepth: (info.effective_steps ?? 12) + 2,
                                   maxLayers: 4096, target: tolerantTarget(snapped) });
    } catch (e) { r = { status: "ERROR", queries: 0, depth: 0, err: e.message }; }
    const ms = Date.now() - t0;

    const before = prev[name] ?? "-";
    const moved = before === "EXHAUSTED" && r.status === "SOLVED";
    rows.push({ name, eff: info.effective_steps, F: c.F || 0,
                creases: (c.M || 0) + (c.V || 0), allLayers: before,
                someLayers: r.status, queries: r.queries, depth: r.depth, ms, moved });
    console.log(`${name.padEnd(20)} ${String(info.effective_steps).padStart(3)} ` +
                `${String((c.M || 0) + (c.V || 0)).padStart(7)} ${String(c.F || 0).padStart(3)}  ` +
                `${before.padEnd(11)} ${r.status.padEnd(11)} ${String(r.queries).padStart(9)} ` +
                `${(ms / 1000).toFixed(0)}s` + (moved ? "   <- GAINED BY THE WIDER TIER" : ""));
}

const tally = {};
for (const r of rows) tally[r.someLayers] = (tally[r.someLayers] || 0) + 1;
const gained = rows.filter(r => r.moved);
const noF = rows.filter(r => r.F === 0);

console.log(`\n=== ${rows.length} real Pureland models against the SOME-LAYERS solver (budget ${BUDGET}) ===`);
for (const k of Object.keys(tally).sort()) console.log(`  ${k.padEnd(12)} ${tally[k]}`);
console.log(`\ncarrying F edges (out of scope by the pre-crease decision): ${rows.length - noF.length}/${rows.length}`);

if (gained.length) {
    console.log(`\n${gained.length} model${gained.length === 1 ? "" : "s"} moved from PROVEN-NOT-FOLDABLE`);
    console.log(`in the all-layers tier to SOLVED in the some-layers tier:`);
    for (const r of gained) console.log(`  ${r.name.padEnd(20)} ${r.depth} folds, ${r.queries.toLocaleString()} queries`);
    console.log(`\nThese are real designs by real people, with a verified action-level sequence.`);
    console.log(`They are the named instances the corpus was short of -- and the measurement that`);
    console.log(`justifies the some-layers tier existing, stated as a gain rather than asserted.`);
} else {
    console.log(`\nNothing moved from EXHAUSTED to SOLVED. The wider action space does not pick up`);
    console.log(`models the narrower one proved impossible -- which, if it holds at a larger`);
    console.log(`budget, says the gap to real Pureland is not the layer restriction but something`);
    console.log(`else, and that is a more interesting result than the one this run was hoping for.`);
}
console.log(`\n/!\\ TIMEOUT is not EXHAUSTED. Only a returned EXHAUSTED is a proof, and it carries`);
console.log(`the tier's three asterisks (solve-layers.mjs header).`);

fs.writeFileSync(path.join(HERE, "anchor-check-layers.json"),
                 JSON.stringify({ generated: new Date().toISOString(), budget: BUDGET, rows }, null, 1) + "\n");
console.log(`\n-> workspace/corpus/anchor-check-layers.json`);
