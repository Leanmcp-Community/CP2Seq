// LEVEL 2 CHECK -- replay each recorded sequence and compare the FOLDED STATE it ends in against
// the stored final frame, up to the symmetry group declared in state-compare.mjs.
//
// /!\ READ THIS BEFORE QUOTING THE PASS RATE. On THIS corpus the check is close to tautological:
// replay reruns the same fold calls the generator ran, so the two states agree face for face and
// the identity symmetry matches immediately. A green run here says the state is reproducible and
// the comparator does not reject a state against itself. It is NOT evidence that the comparator
// is right, and it is not a measurement of the corpus.
//
// WHAT THE COMPARATOR IS ACTUALLY FOR is scoring a MODEL'S proposal: a different sequence, from a
// different search, that has to be judged equal to the target state without being identical to
// the recorded one. That is where the symmetry group earns its place, and that run does not exist
// yet. This CLI exists so the comparator is exercised end to end on real data, and so the
// self-consistency it does check is checked.
//
// The --mutate flag is the useful half: it re-runs each comparison against a deliberately altered
// state (two adjacent layers swapped) and demands a REJECT. A comparator that accepts everything
// passes the plain run and fails this one.
//
//   node verify-state.mjs [corpus-dir] [--quiet] [--limit N] [--mutate] [--out FILE]
import fs from "fs";
import path from "path";
import { resolvePath, positional } from "./paths.mjs";
import { fileURLToPath } from "url";
import { foldLayers } from "./fold-engine-layers.mjs";
import { lineSpec } from "./fold-engine.mjs";
import { boundaryLoop, ID, ap } from "./geom.mjs";
import { sameFoldedState, layersFromFrame } from "./state-compare.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const ROOT = resolvePath(HERE, positional(argv, ["--out", "--limit"]), "out/release");
const QUIET = argv.includes("--quiet");
const MUTATE = argv.includes("--mutate");
const li = argv.indexOf("--limit");
const LIMIT = li >= 0 ? +argv[li + 1] : Infinity;
const oi = argv.indexOf("--out");
const OUT = oi >= 0 ? path.resolve(argv[oi + 1]) : path.join(ROOT, "state-check.json");

// Replay a sample's sequence and return its final layer stack, bottom to top.
// The fold-encoding decode is verify-exact.mjs's, kept identical on purpose: two verifiers that
// decode the corpus differently are two verifiers measuring different things.
function replayState(dir) {
    const cp = JSON.parse(fs.readFileSync(path.join(dir, "cp.fold"), "utf8"));
    const seq = JSON.parse(fs.readFileSync(path.join(dir, "seq.json"), "utf8"));
    const bEdges = cp.edges_assignment.map((a, i) => a === "B" ? cp.edges_vertices[i] : null).filter(Boolean);
    const sheet = boundaryLoop(bEdges, cp.vertices_coords);
    if (!sheet) return { error: "no boundary loop in cp.fold" };

    let st = { faces: [{ poly: sheet, T: ID, inv: ID, par: 0 }], order: [0] };
    for (const [i, f] of (seq.folds ?? []).entries()) {
        const line = f.line
            ?? (f.angle_index !== undefined
                ? { n: lineSpec(f.angle_index, f.offset).n, d: f.offset }
                : { n: f.normal, d: f.offset });
        const r = foldLayers(st, line, f.movePositive ?? f.move_positive,
                             f.selection ?? f.sel ?? { mode: "all" }, f.over ?? true);
        if (r.error) return { error: `fold ${i + 1} refused: ${r.error}` };
        st = r.state;
    }
    // Not currentPolys(): that drops the face's polygon on the ORIGINAL SHEET, and without it two
    // congruent layers from different parts of the paper are indistinguishable -- the bug the
    // negative control caught. Carry both, so the comparison identifies faces.
    const layers = st.order.map(i => ({
        poly: st.faces[i].poly.map(p => ap(st.faces[i].T, p)),
        sheet: st.faces[i].poly,
        par: st.faces[i].par,
    }));
    return { layers, folds: (seq.folds ?? []).length };
}

// The negative control: swap the two lowest layers. Same geometry, same creases, different stack
// -- exactly the difference Level 1 cannot see, which is the whole reason this file exists.
function swapTwoLayers(layers) {
    if (layers.length < 2) return null;
    const out = [...layers];
    [out[0], out[1]] = [out[1], out[0]];
    return out;
}

const batches = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(ROOT, e.name, "samples")))
    .map(e => e.name).sort();
if (!batches.length) { console.error(`no sample batches under ${ROOT}`); process.exit(1); }

let pass = 0, fail = 0, skipped = 0, weakened = 0, mutantsRejected = 0, mutantsAccepted = 0, mutantsNA = 0;
const failures = [], perBatch = [], bySymmetry = new Map();
const t0 = Date.now();

for (const b of batches) {
    const sdir = path.join(ROOT, b, "samples");
    const ids = fs.readdirSync(sdir).sort().slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);
    let p = 0, f = 0;
    for (const [i, id] of ids.entries()) {
        const dir = path.join(sdir, id);
        const stepsPath = path.join(dir, "steps.fold");
        if (!fs.existsSync(stepsPath)) { skipped++; continue; }

        let r;
        try {
            const got = replayState(dir);
            if (got.error) throw new Error(got.error);
            const frames = JSON.parse(fs.readFileSync(stepsPath, "utf8")).file_frames ?? [];
            if (!frames.length) throw new Error("steps.fold has no frames");
            const want = layersFromFrame(frames.at(-1));
            r = sameFoldedState(got.layers, want);
            if (r.ok && !r.identifiesFaces) weakened++;

            if (MUTATE) {
                // /!\ THE MUTANT IS COMPARED AGAINST THE REPLAYED STATE, not against `want`. The
                // stored frame carries no sheet coordinates, so comparing to it silently drops
                // face identity and tests the weaker path -- which is how 23 swapped stacks were
                // accepted before. Replay-vs-replay is also the shape the real scoring run has:
                // a model's sequence and the target sequence both go through the engine.
                const mutant = swapTwoLayers(got.layers);
                if (!mutant) mutantsNA++;
                else if (sameFoldedState(mutant, got.layers).ok) mutantsAccepted++;
                else mutantsRejected++;
            }
        } catch (e) { r = { ok: false, why: `threw: ${e.message}` }; }

        if (r.ok) { p++; pass++; bySymmetry.set(r.symmetry, (bySymmetry.get(r.symmetry) ?? 0) + 1); }
        else { f++; fail++; failures.push({ sample: `${b}/${id}`, why: r.why }); }
        if (!QUIET) process.stdout.write(`\r${b.padEnd(20)} ${String(i + 1).padStart(4)}/${ids.length}   ${p} ok  ${f} failed      `);
    }
    if (!QUIET) process.stdout.write("\r" + " ".repeat(64) + "\r");
    perBatch.push({ batch: b, n: ids.length, pass: p, fail: f });
    if (!QUIET) console.log(`${b.padEnd(24)} ${String(p).padStart(5)}/${String(ids.length).padEnd(5)} state-equal` +
                            (f ? `   ${f} FAILED` : ""));
}

const secs = +((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n${pass} state-equal, ${fail} failed${skipped ? `, ${skipped} skipped (no steps.fold)` : ""}, in ${secs}s`);

// Which symmetry matched is worth printing: on a self-replay every sample should match under the
// IDENTITY, and anything else means the replay is landing somewhere the generator did not.
if (bySymmetry.size) {
    console.log(`\nmatching symmetry:`);
    for (const [s, c] of [...bySymmetry].sort((x, y) => y[1] - x[1])) console.log(`  ${s.padEnd(8)} ${c}`);
    if (bySymmetry.size > 1 || !bySymmetry.has("id"))
        console.log(`  /!\\ a self-replay matching under anything but "id" needs explaining`);
}
if (weakened) {
    console.log(`\n/!\\ ${weakened} comparison(s) ran WITHOUT face identity: the stored steps.fold`);
    console.log(`    frames carry current-plane coordinates only, so those samples were checked on`);
    console.log(`    geometry and parity alone. Strictly weaker than what the comparator can do.`);
}
if (MUTATE) {
    console.log(`\nnegative control (two lowest layers swapped -- must be REJECTED):`);
    console.log(`  rejected ${mutantsRejected}   ACCEPTED ${mutantsAccepted}   n/a (single layer) ${mutantsNA}`);
    if (mutantsAccepted) console.log(`  /!\\ ${mutantsAccepted} mutant(s) accepted: the comparator is not seeing layer order`);
}
for (const f of failures.slice(0, 10)) console.log(`  ${f.sample}: ${f.why}`);

fs.writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString(), root: path.basename(ROOT),
    pass, fail, skipped, seconds: secs,
    note: "LEVEL 2: folded-state equality up to the declared symmetry group (8 square symmetries " +
          "x arbitrary translation; reflections also reverse the stack and flip parity). On a " +
          "self-replay this is near-tautological -- it checks reproducibility and that the " +
          "comparator does not reject a state against itself, NOT that the comparator is right. " +
          "Its purpose is scoring model proposals against a target state.",
    symmetries: Object.fromEntries(bySymmetry),
    comparisonsWithoutFaceIdentity: weakened,
    ...(MUTATE ? { negativeControl: { rejected: mutantsRejected, accepted: mutantsAccepted, na: mutantsNA } } : {}),
    batches: perBatch, failures,
}, null, 1) + "\n");
console.log(`\n-> ${path.relative(process.cwd(), OUT)}`);
process.exit(fail || mutantsAccepted ? 1 : 0);
