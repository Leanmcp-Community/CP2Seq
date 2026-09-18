// Replay every recorded sequence and check it reproduces the crease pattern beside it.
//
// WHY THIS EXISTS, AND WHY THE SPLITS WERE WRONG BEFORE IT. The corpus originally called a
// sample "verified" when the tier's SOLVER re-derived a sequence for it. That made verification
// cost grow with depth -- the solver cannot close six folds in the some-layers tier -- so the
// verified split stopped at five folds and, measured against this project's own step cut points,
// was 100% "easy". The difficulty axis and the verification ceiling had been welded together.
//
// They are not the same question. The solver answers "does the INVERSE problem have a solution
// findable by search inside a budget" -- a real claim, and a narrow one. What a corpus mainly
// needs checked is different and much cheaper: does the sequence we wrote down actually produce
// the pattern we wrote down? That is a forward simulation, O(folds), and it costs the same at
// nineteen folds as at three.
//
// It is not a formality. Replay is what caught planarize() emitting zero-length edges, and twice
// caught a comparison that reported identical paper as different. A generator that silently
// drifts between what it folded and what it serialised produces a corpus where the ground truth
// is wrong, and no amount of solving finds that.
//
// /!\ WHAT REPLAY DOES NOT CERTIFY, stated because it is the easy thing to overclaim. It shares
// the fold engine with the generator, so it cannot catch a wrong model of paper -- if the engine
// is wrong about tearing, replay is wrong the same way and agrees with itself. It catches drift
// between folding and recording, which is a different and more likely failure. The solver shares
// the engine too, so it does not close that gap either; a genuinely independent check would mean
// a third-party implementation, e.g. Flat-Folder deciding flat-foldability of our patterns.
//
//   node verify-replay.mjs <corpus-dir> [--quiet]
import fs from "fs";
import path from "path";
import { resolvePath, positional } from "./paths.mjs";
import { fileURLToPath } from "url";
import { foldLayers } from "./fold-engine-layers.mjs";
import { lineSpec } from "./fold-engine.mjs";
import { planarize } from "./planarize.mjs";
import { boundaryLoop, ID } from "./geom.mjs";
import { creaseGeometry, pairsUp } from "./crease-compare.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const ROOT = resolvePath(HERE, positional(argv, ["--out"]), "out/release");
const QUIET = argv.includes("--quiet");

// Both tiers' recorded sequences are replayed through the SOME-LAYERS engine. That is not a
// shortcut: an all-layers fold is the some-layers fold with selection "all", so the wider engine
// reproduces the narrower one exactly, and using one engine means one definition of a fold.
function replay(dir) {
    const cp = JSON.parse(fs.readFileSync(path.join(dir, "cp.fold"), "utf8"));
    const seq = JSON.parse(fs.readFileSync(path.join(dir, "seq.json"), "utf8"));
    const bEdges = cp.edges_assignment.map((a, i) => a === "B" ? cp.edges_vertices[i] : null).filter(Boolean);
    const sheet = boundaryLoop(bEdges, cp.vertices_coords);
    if (!sheet) return { ok: false, why: "no boundary loop in cp.fold" };

    let st = { faces: [{ poly: sheet, T: ID, inv: ID, par: 0 }], order: [0] };
    const creases = [];
    for (const [i, f] of (seq.folds ?? []).entries()) {
        // THE TWO GENERATORS RECORD A FOLD DIFFERENTLY, and both shapes are accepted rather than
        // one being normalised at write time -- the stored sequence should be the thing that was
        // executed, not a re-derivation of it.
        //
        // The all-layers generator writes (angle_index, offset) in fold-engine.mjs's
        // UN-NORMALISED normal frame, which is what keeps every offset dyadic: at 45 degrees the
        // normal is [-1, 1], not [-0.707, 0.707], and the offset is measured against that. The
        // table is imported rather than copied here, because a second copy of it would be a
        // second definition of what a fold line is.
        const line = f.line
            ?? (f.angle_index !== undefined
                ? { n: lineSpec(f.angle_index, f.offset).n, d: f.offset }
                : { n: f.normal, d: f.offset });
        const mp = f.movePositive ?? f.move_positive;
        const sel = f.selection ?? f.sel ?? { mode: "all" };
        const over = f.over ?? true;
        const r = foldLayers(st, line, mp, sel, over);
        if (r.error) return { ok: false, why: `fold ${i + 1} refused: ${r.error}` };
        creases.push(...r.made);
        st = r.state;
    }
    const segs = [
        ...sheet.map((p, i) => ({ P: p, Q: sheet[(i + 1) % sheet.length], assignment: "B" })),
        ...creases.map(c => ({ P: c.P, Q: c.Q, assignment: c.a })),
    ];
    const got = creaseGeometry(planarize(segs).fold);
    const want = creaseGeometry(cp);
    if (got.length !== want.length)
        return { ok: false, why: `${got.length} creases replayed vs ${want.length} stored` };
    if (!pairsUp(got, want))
        return { ok: false, why: `crease mismatch: ${pairsUp.unmatched}` };
    return { ok: true, folds: (seq.folds ?? []).length, creases: want.length };
}

const batches = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(ROOT, e.name, "samples")))
    .map(e => e.name).sort();
if (!batches.length) { console.error(`no sample batches under ${ROOT}`); process.exit(1); }

let pass = 0, fail = 0;
const failures = [];
const perBatch = [];
const t0 = Date.now();

for (const b of batches) {
    const sdir = path.join(ROOT, b, "samples");
    const ids = fs.readdirSync(sdir).sort();
    let p = 0, f = 0;
    for (const id of ids) {
        let r;
        try { r = replay(path.join(sdir, id)); }
        catch (e) { r = { ok: false, why: `threw: ${e.message}` }; }
        if (r.ok) { p++; pass++; }
        else { f++; fail++; failures.push({ sample: `${b}/${id}`, why: r.why }); }
    }
    perBatch.push({ batch: b, n: ids.length, pass: p, fail: f });
    if (!QUIET) console.log(`${b.padEnd(24)} ${String(p).padStart(5)}/${String(ids.length).padEnd(5)} replayed` +
                            (f ? `   ${f} FAILED` : ""));
}

console.log(`\n${pass} replayed correctly, ${fail} failed, in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failures.length) {
    console.log(`\nfailures (a failure means the stored sequence does NOT produce the stored pattern,`);
    console.log(`which makes that sample's ground truth wrong -- not a scoring question, a data bug):`);
    for (const f of failures.slice(0, 20)) console.log(`  ${f.sample.padEnd(34)} ${f.why}`);
    if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
}

fs.writeFileSync(path.join(ROOT, "replay-check.json"), JSON.stringify(
    { generated: new Date().toISOString(), root: path.basename(ROOT),
      pass, fail, seconds: +((Date.now() - t0) / 1000).toFixed(1),
      note: "replay shares the fold engine with the generator: it catches drift between what was " +
            "folded and what was recorded, NOT a wrong model of paper",
      batches: perBatch, failures }, null, 1) + "\n");
console.log(`\n-> ${path.relative(process.cwd(), path.join(ROOT, "replay-check.json"))}`);
process.exit(fail ? 1 : 0);
