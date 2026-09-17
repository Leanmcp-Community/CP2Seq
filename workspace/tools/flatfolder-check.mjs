// Decide our crease patterns with SOMEONE ELSE'S solver.
//
// WHY THIS IS THE ONE CHECK THAT COUNTS. Everything else in this repo that says a sample is
// correct shares one fold engine with the thing that produced it: the generator folds the paper,
// verify-replay re-folds it, and the search baseline searches the same action space. If that
// engine is wrong about paper -- not about bookkeeping, about PAPER -- all three are wrong the
// same way and agree with each other. Tuning our own comparison until its failures go away is
// not verification, it is fitting a checker to its own data.
//
// Flat-Folder (github.com/origamimagiro/flat-folder, GPL-3.0) shares nothing with us. It takes a
// crease pattern with M/V assignments and decides whether a valid flat-folded state EXISTS, by
// solving the four local non-penetration constraint types (taco-taco, taco-tortilla,
// tortilla-tortilla, transitivity) over the overlap graph. It has no notion of a folding step,
// which is why it cannot be our simulator -- and no stake in our answers, which is why it can be
// our judge.
//
// THE CLAIM IT TESTS. Every sample in this corpus was made by folding a square, so every stored
// pattern is realisable BY CONSTRUCTION. If Flat-Folder reports that one admits no valid flat
// state, that is a genuine disagreement between two independent implementations of what paper
// does, and one of them is wrong. That is the finding this script exists to produce; a clean run
// is the weaker outcome, and is still worth having in writing.
//
// /!\ WHAT A PASS DOES NOT MEAN. Flat-Folder decides the PATTERN, not our SEQUENCE: it says a
// valid layer ordering exists, not that the ordering our folds produce is among them, and not
// that the sequence is reachable by simple folds. It is an independent check of the geometry,
// not of the sequence. Those are different claims and conflating them would give this script
// more authority than it has.
//
// Flat-Folder is NOT vendored here -- it is GPL and this repo is not -- so its checkout is
// located at run time and its path recorded in the output.
//
//   node flatfolder-check.mjs <corpus-dir> [--ff PATH] [--limit N] [--out FILE]
//   FLATFOLDER=/path/to/flat-folder-main node flatfolder-check.mjs ...
import fs from "fs";
import path from "path";
import os from "os";

const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const ROOT = path.resolve(argv.find(a => !a.startsWith("--")) ?? "../corpus/out/release");
const FF = path.resolve(arg("--ff", process.env.FLATFOLDER ?? path.join(os.homedir(), "Downloads/flat-folder-main")));
const LIMIT = +arg("--limit", Infinity);
const OUT = arg("--out", path.join(ROOT, "flatfolder-check.json"));

if (!fs.existsSync(path.join(FF, "src/solver.js"))) {
    console.error(`Flat-Folder not found at ${FF}`);
    console.error(`clone github.com/origamimagiro/flat-folder and pass --ff PATH or set FLATFOLDER`);
    process.exit(2);
}

// Flat-Folder's modules assume a browser at import time in places. Give them the few globals they
// touch before loading, rather than patching their source: a patched copy would no longer be an
// independent implementation, which is the entire point.
if (!("window" in globalThis)) {
    globalThis.window = globalThis;
    globalThis.document = {
        getElementById: () => null,
        createElement: () => ({ setAttribute() {}, appendChild() {}, style: {}, classList: { add() {}, remove() {} } }),
        createElementNS: () => ({ setAttribute() {}, appendChild() {}, style: {}, classList: { add() {}, remove() {} } }),
        body: { appendChild() {} },
    };
}

const { M }      = await import(path.join(FF, "src/math.js"));
const { NOTE }   = await import(path.join(FF, "src/note.js"));
const { CON }    = await import(path.join(FF, "src/constraints.js"));
const { X }      = await import(path.join(FF, "src/conversion.js"));
const { SOLVER } = await import(path.join(FF, "src/solver.js"));

NOTE.show = false;
CON.build();

// One sample, through Flat-Folder's own pipeline. The steps and their order are taken from
// BATCH.process_file in flat-folder's src/batch.js; the face derivation is taken from
// IO.doc_type_side_2_... , because our cp.fold carries no faces_vertices (it is a crease pattern,
// not a folded mesh) and Flat-Folder's batch path assumes one.
function decide(cp, lim) {
    let V = cp.vertices_coords.map(p => [p[0], p[1]]);
    const EV = cp.edges_vertices.map(e => [e[0], e[1]]);
    let EA = cp.edges_assignment.slice();

    // Faces from the planar graph. flip_Y matches Flat-Folder's default side convention; without
    // it every face comes out with negative area and the solver reads every M as a V.
    V = V.map(([x, y]) => [x, -y + 1]);
    const [, FV0] = X.V_EV_2_VV_FV(V, EV);
    let FV = FV0;
    let [EF, FE] = X.EV_FV_2_EF_FE(EV, FV);
    if (FV.length > 1) FV = FV.filter((F, i) => !FE[i].every(e => EA[e] === "B"));   // drop the outer face
    [EF, FE] = X.EV_FV_2_EF_FE(EV, FV);

    const [Vf, Ff] = X.V_FV_EV_EA_2_Vf_Ff(V, FV, EV, EA);
    const L = EV.map((P) => M.expand(P, Vf));
    const [P, SP, SE, eps_i] = X.L_2_V_EV_EL(L);
    if (P.length === 0) return { status: "precision", why: "no stable graph" };

    const [, CP] = X.V_EV_2_VV_FV(P, SP);
    const [SC, CS] = X.EV_FV_2_EF_FE(SP, CP);
    const [CF, FC] = X.EF_FV_P_SP_SE_CP_SC_2_CF_FC(EF, FV, P, SP, SE, CP, SC);
    const BF = X.EF_SP_SE_CP_CF_2_BF(EF, SP, SE, CP, CF);
    const BI = new Map();
    for (const [i, F] of BF.entries()) BI.set(F, i);
    const BT = X.BF_BI_EF_SE_CF_SC_2_BT(BF, BI, EF, SE, CF, SC);
    const CC = X.FC_BF_BI_BT_2_CC(FC, BF, BI, BT);
    const BA0 = SOLVER.EF_EA_Ff_BF_BI_2_BA0(EF, EA, Ff, BF, BI);
    const trans_count = { all: 0, reduced: 0 };

    // THE INTERESTING FAILURE. initial_assignment returns [type, F, E] when the constraints are
    // already contradictory: type names WHICH of the four physical laws is violated and F names
    // the faces. That is a positive claim that this pattern cannot be flat-folded -- exactly the
    // statement our own engine can never make about its own output.
    const out = SOLVER.initial_assignment(BA0, BF, BT, BI, FC, CF, CC, trans_count);
    if (out.length === 3 && out[0].length === undefined) {
        const [type, F] = out;
        return { status: "unfoldable", constraint: CON.names[type], faces: F, stage: "initial" };
    }
    const GB = SOLVER.get_components(BI, BF, BT, out, FC, CF, CC, trans_count);
    const GA = SOLVER.solve(BI, BF, BT, out, GB, FC, CF, CC, lim);
    if (GA.length === undefined) return { status: "unfoldable", component: GA, stage: "solve" };

    const n = GA.reduce((s, A) => s * BigInt(A.length), BigInt(1));
    return { status: n > 0n ? "foldable" : "unfoldable", states: n.toString(),
             faces: FV.length, variables: BF.length, components: GB.length };
}

const batches = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(ROOT, e.name, "samples")))
    .map(e => e.name).sort();

const tally = {};
const disagreements = [];
let n = 0;
const t0 = Date.now();

outer:
for (const b of batches) {
    const sdir = path.join(ROOT, b, "samples");
    for (const id of fs.readdirSync(sdir).sort()) {
        if (n >= LIMIT) break outer;
        n++;
        let r;
        try { r = decide(JSON.parse(fs.readFileSync(path.join(sdir, id, "cp.fold"), "utf8")), 10000); }
        catch (e) { r = { status: "threw", why: e.message }; }
        tally[r.status] = (tally[r.status] ?? 0) + 1;
        // Everything here was made by folding, so anything but "foldable" is a disagreement
        // between two independent implementations and is recorded in full.
        if (r.status !== "foldable") disagreements.push({ sample: `${b}/${id}`, ...r });
        if (n % 50 === 0) process.stdout.write(`\r${n} checked  ${JSON.stringify(tally)}   `);
    }
}

const secs = +((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n\n${n} patterns decided by Flat-Folder in ${secs}s`);
for (const [k, v] of Object.entries(tally)) console.log(`  ${k.padEnd(12)} ${v}`);
if (disagreements.length) {
    console.log(`\n${disagreements.length} disagreement(s) -- patterns we PRODUCED BY FOLDING that`);
    console.log(`Flat-Folder says have no valid flat state. One of the two engines is wrong:`);
    for (const d of disagreements.slice(0, 20))
        console.log(`  ${d.sample.padEnd(34)} ${d.status}${d.constraint ? ` (${d.constraint})` : ""}${d.why ? ` ${d.why}` : ""}`);
    if (disagreements.length > 20) console.log(`  ... and ${disagreements.length - 20} more`);
}

fs.writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString(),
    flatFolder: FF,
    corpus: path.relative(process.cwd(), ROOT),
    checked: n, seconds: secs, tally,
    note: "Flat-Folder decides whether the PATTERN admits a valid flat-folded state. It does not " +
          "check our sequence, and it shares no code with our fold engine -- which is the point.",
    disagreements,
}, null, 1) + "\n");
console.log(`\n-> ${path.relative(process.cwd(), OUT)}`);
