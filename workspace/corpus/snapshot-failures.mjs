// Preserve the replay failures before they are removed from the release corpus.
//
// WHY THIS EXISTS. The three samples whose recorded sequence does not reproduce their stored
// pattern are being dropped: a sample whose ground truth is wrong cannot ship. But dropping them
// also drops the EVIDENCE, and the evidence is the more valuable half. Every previous failure of
// this shape -- four of them -- turned out to be a bug in the crease COMPARISON rather than in the
// data, most recently a decimal bucketing grid that split dyadic coordinates across two buckets.
// If that is true a fifth time, the bug is still live and is now unobserved, because the samples
// that pointed at it are gone. So: copy the sample verbatim, and record exactly which creases
// disagree, in a form someone can work from without regenerating anything.
//
//   node snapshot-failures.mjs [corpus-dir] [--out DIR]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { foldLayers } from "./fold-engine-layers.mjs";
import { lineSpec } from "./fold-engine.mjs";
import { planarize } from "./planarize.mjs";
import { boundaryLoop, ID } from "../probe-c/stage2.mjs";
import { creaseGeometry, pairsUp, TOL } from "./crease-compare.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const ROOT = path.resolve(HERE, argv.find(a => !a.startsWith("--")) ?? "out/release");
const oi = argv.indexOf("--out");
const OUT = path.resolve(HERE, oi >= 0 ? argv[oi + 1] : "failures-snapshot");

// Same decode as verify-replay.mjs. Duplicated here deliberately and marked: this file must keep
// working unchanged after the corpus and the verifier move on, because its whole purpose is to
// record what the comparison did ON THE DAY the samples were dropped.
function replayDetail(dir) {
    const cp = JSON.parse(fs.readFileSync(path.join(dir, "cp.fold"), "utf8"));
    const seq = JSON.parse(fs.readFileSync(path.join(dir, "seq.json"), "utf8"));
    const bEdges = cp.edges_assignment.map((a, i) => a === "B" ? cp.edges_vertices[i] : null).filter(Boolean);
    const sheet = boundaryLoop(bEdges, cp.vertices_coords);
    if (!sheet) return { error: "no boundary loop in cp.fold" };

    let st = { faces: [{ poly: sheet, T: ID, inv: ID, par: 0 }], order: [0] };
    const creases = [];
    const perFold = [];
    for (const [i, f] of (seq.folds ?? []).entries()) {
        const line = f.line
            ?? (f.angle_index !== undefined
                ? { n: lineSpec(f.angle_index, f.offset).n, d: f.offset }
                : { n: f.normal, d: f.offset });
        const mp = f.movePositive ?? f.move_positive;
        const sel = f.selection ?? f.sel ?? { mode: "all" };
        const over = f.over ?? true;
        const r = foldLayers(st, line, mp, sel, over);
        if (r.error) return { error: `fold ${i + 1} refused: ${r.error}`, perFold };
        perFold.push({ fold: i + 1, line, movePositive: mp, selection: sel, over, made: r.made.length });
        creases.push(...r.made);
        st = r.state;
    }
    const segs = [
        ...sheet.map((p, i) => ({ P: p, Q: sheet[(i + 1) % sheet.length], assignment: "B" })),
        ...creases.map(c => ({ P: c.P, Q: c.Q, assignment: c.a })),
    ];
    const got = creaseGeometry(planarize(segs).fold);
    const want = creaseGeometry(cp);

    // The point of the snapshot: not "they differ" but WHICH ones differ. creaseGeometry returns
    // merged creases as strings "nx,ny,d,assignment|lo|hi" -- a quantised LINE key plus the
    // extent along that line -- so the diagnosis has to parse them back rather than invent fields.
    const parse = (s) => {
        const [key, lo, hi] = s.split("|");
        const [nx, ny, d, a] = key.split(",");
        return { s, key, nx: +nx, ny: +ny, d: +d, a, lo: +lo, hi: +hi };
    };
    const A = got.map(parse), B = want.map(parse);

    // Match exactly as pairsUp does -- same line key, endpoints within TOL -- so the leftovers
    // here are the same creases that made the verifier report a failure, not a second opinion.
    const usedB = new Set();
    const onlyA = [];
    for (const a of A) {
        let hit = -1;
        for (let j = 0; j < B.length; j++) {
            if (usedB.has(j) || B[j].key !== a.key) continue;
            if (Math.abs(B[j].lo - a.lo) <= TOL && Math.abs(B[j].hi - a.hi) <= TOL) { hit = j; break; }
        }
        if (hit >= 0) usedB.add(hit); else onlyA.push(a);
    }
    const onlyB = B.filter((_, j) => !usedB.has(j));

    // For each unmatched replayed crease, the nearest unmatched stored one and the per-field
    // deltas. THIS IS THE FIELD THAT DECIDES WHAT THE BUG IS: a delta of ~1e-6 on one endpoint,
    // or a line key differing only in its last quantised digit, is the signature of a comparison
    // bug. A delta of order 0.1, or a different assignment, is a real difference in the paper.
    const near = onlyA.map(a => {
        let best = null, bd = Infinity;
        for (const b of onlyB) {
            const d = Math.abs(a.nx - b.nx) + Math.abs(a.ny - b.ny) + Math.abs(a.d - b.d)
                    + Math.abs(a.lo - b.lo) + Math.abs(a.hi - b.hi);
            if (d < bd) { bd = d; best = b; }
        }
        return best ? {
            replayed: a.s, nearestStored: best.s,
            sameLineKey: a.key === best.key,
            delta: { nx: a.nx - best.nx, ny: a.ny - best.ny, d: a.d - best.d,
                     lo: a.lo - best.lo, hi: a.hi - best.hi,
                     assignmentSame: a.a === best.a },
        } : { replayed: a.s, nearestStored: null };
    });

    return {
        counts: { replayed: got.length, stored: want.length, matched: usedB.size,
                   unmatchedReplayed: onlyA.length, unmatchedStored: onlyB.length },
        verdict: got.length !== want.length
            ? `${got.length} creases replayed vs ${want.length} stored`
            : (pairsUp(got, want) ? "pairs up (no failure reproduced)" : `crease mismatch: ${pairsUp.unmatched}`),
        tolerance: TOL,
        perFold,
        onlyReplayed: onlyA.map(x => x.s),
        onlyStored: onlyB.map(x => x.s),
        nearestPairs: near,
    };
}

function copyDir(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name), d = path.join(dst, e.name);
        if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
    }
}

const check = JSON.parse(fs.readFileSync(path.join(ROOT, "replay-check.json"), "utf8"));
if (!check.failures?.length) { console.log("no failures recorded; nothing to snapshot"); process.exit(0); }

fs.mkdirSync(OUT, { recursive: true });
const records = [];
for (const f of check.failures) {
    const [batch, id] = f.sample.split("/");
    const src = path.join(ROOT, batch, "samples", id);
    const dst = path.join(OUT, `${batch}__${id}`);
    copyDir(src, dst);
    let detail;
    try { detail = replayDetail(src); }
    catch (e) { detail = { error: `threw: ${e.message}`, stack: e.stack }; }
    fs.writeFileSync(path.join(dst, "diagnosis.json"), JSON.stringify(detail, null, 1) + "\n");
    records.push({ sample: f.sample, whyAtDropTime: f.why, copiedTo: path.basename(dst),
                   counts: detail.counts ?? null, verdict: detail.verdict ?? detail.error });
    console.log(`${f.sample.padEnd(34)} -> ${path.basename(dst)}   ${detail.verdict ?? detail.error}`);
}

fs.writeFileSync(path.join(OUT, "README.json"), JSON.stringify({
    generated: new Date().toISOString(),
    why: "replay failures preserved before removal from the release corpus; see snapshot-failures.mjs",
    sourceCorpus: path.relative(HERE, ROOT),
    replayCheckGenerated: check.generated,
    prior: "the four previous failures of this shape were all bugs in the crease comparison, " +
           "not in the data -- most recently a decimal bucketing grid splitting dyadic coordinates",
    samples: records,
}, null, 1) + "\n");
console.log(`\n-> ${path.relative(process.cwd(), OUT)}`);
