// Fold the eight release batches into one manifest, and say honestly what is in each split.
//
// The batches are generated separately because the two tiers have different generators and the
// verified depths differ per tier. A consumer should not have to know that: one manifest, one
// row per sample, with tier / split / depth / verdict on it.
//
// WHAT THE SPLITS MEAN, which is the only thing here that needs defending:
//
//   verified   the tier's own solver was run on the pattern and returned a verdict. SOLVED means
//              an independent search reproduced a sequence for it. This is a check on the
//              GENERATOR, not on the physics -- both share the fold engine -- so it catches a
//              broken sampler and would not catch a wrong model of paper.
//   generated  deeper samples with no verdict. Correct BY CONSTRUCTION: they were produced by
//              folding, and the pattern is what the folding left behind. The split exists
//              because the solver cannot close these in reasonable time, and labelling them
//              honestly is better than stopping the corpus at the depth the solver can reach --
//              the difficulty the benchmark is about lives past that depth.
//
// /!\ A TIMEOUT IN A VERIFIED BATCH STAYS IN THE CORPUS, marked. Dropping it would bias the
// verified split toward the instances the solver finds easy, which is the one bias a
// difficulty-graded corpus cannot afford.
//
// /!\ THE RECORDED SEQUENCE IS NOT ALWAYS THE SHORTEST. Measured on the all-layers verified
// batch: 26 of 399 solved samples (6.5%) were solved in one fold FEWER than the generator used,
// rising from 1/100 at three folds to 10/99 at six. So a scorer must judge "does replaying this
// sequence produce the target pattern", never "does it match the recorded sequence step by
// step", and step-count metrics belong against the SHORTEST known sequence. This is recorded per
// sample as shorter_known.
//
//   node merge-release.mjs [out/release]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, process.argv[2] ?? "out/release");

const batches = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(ROOT, e.name, "manifest.json")))
    .map(e => e.name).sort();

const rows = [];
for (const b of batches) {
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, b, "manifest.json"), "utf8"));
    const tier = b.startsWith("all") ? "all-layers" : "some-layers";
    const split = b.includes("verified") ? "verified" : "generated";
    for (const s of man.samples ?? []) {
        const steps = s.metrics?.steps ?? s.steps;
        const ps = s.pure_search ?? null;
        rows.push({
            id: `${b}/${s.id}`, batch: b, tier, split, folds: steps,
            path: `${b}/samples/${s.id}`,
            creases: s.metrics?.crease_edges ?? s.metrics?.creases ?? null,
            layers: s.metrics?.layers_final ?? s.metrics?.layers ?? null,
            partial_folds: s.partial_used ?? 0,
            cp_hash: s.cp_hash,
            verdict: ps ? ps.status : null,
            queries: ps ? ps.queries : null,
            // The shortest sequence anyone has found for this pattern: the solver's, when it
            // beat the generator. Null when nothing shorter is known, NOT when none exists --
            // an unverified sample simply has not been looked at.
            shorter_known: ps && ps.status === "SOLVED" && ps.depth < steps ? ps.depth : null,
        });
    }
}

// isomorphic duplicates ACROSS batches -- each generator only deduplicates within its own run,
// so a three-fold pattern could legitimately reappear in a deeper batch as a prefix
const seen = new Map();
let cross = 0;
for (const r of rows) {
    if (!r.cp_hash) continue;
    if (seen.has(r.cp_hash)) { r.duplicate_of = seen.get(r.cp_hash); cross++; }
    else seen.set(r.cp_hash, r.id);
}

const fmt = (n, w) => String(n).padStart(w);
console.log(`${"batch".padEnd(22)} ${"tier".padEnd(12)} ${"split".padEnd(10)} ${"n".padStart(4)} ` +
            `${"folds".padStart(7)} ${"SOLVED".padStart(7)} ${"TIMEOUT".padStart(8)} ${"none".padStart(5)}`);
for (const b of batches) {
    const g = rows.filter(r => r.batch === b);
    const lo = Math.min(...g.map(r => r.folds)), hi = Math.max(...g.map(r => r.folds));
    console.log(`${b.padEnd(22)} ${g[0].tier.padEnd(12)} ${g[0].split.padEnd(10)} ${fmt(g.length, 4)} ` +
                `${(lo === hi ? `${lo}` : `${lo}-${hi}`).padStart(7)} ` +
                `${fmt(g.filter(r => r.verdict === "SOLVED").length, 7)} ` +
                `${fmt(g.filter(r => r.verdict === "TIMEOUT").length, 8)} ` +
                `${fmt(g.filter(r => !r.verdict).length, 5)}`);
}

const byGroup = (tier, split) => rows.filter(r => r.tier === tier && r.split === split);
console.log(`\n${"".padEnd(22)} ${"n".padStart(5)} ${"with a verdict".padStart(15)}`);
for (const tier of ["all-layers", "some-layers"])
    for (const split of ["verified", "generated"]) {
        const g = byGroup(tier, split);
        if (!g.length) continue;
        console.log(`${(tier + " / " + split).padEnd(22)} ${fmt(g.length, 5)} ` +
                    `${fmt(g.filter(r => r.verdict === "SOLVED").length, 15)}`);
    }

const shorter = rows.filter(r => r.shorter_known !== null);
console.log(`\ntotal ${rows.length} samples, ${rows.filter(r => r.verdict === "SOLVED").length} with a SOLVED verdict`);
console.log(`isomorphic duplicates across batches: ${cross} (kept, marked with duplicate_of)`);
console.log(`patterns with a sequence SHORTER than the one that built them: ${shorter.length}`);
console.log(`  -> a scorer must replay the sequence and compare crease sets, never compare steps`);
console.log(`     to the recorded sequence: the recorded one is A solution, not THE shortest.`);

fs.writeFileSync(path.join(ROOT, "manifest.json"), JSON.stringify(
    { generated: new Date().toISOString(),
      splits: { verified: "solver verdict present", generated: "correct by construction, no verdict" },
      counts: { total: rows.length,
                solved: rows.filter(r => r.verdict === "SOLVED").length,
                timeout: rows.filter(r => r.verdict === "TIMEOUT").length,
                unverified: rows.filter(r => !r.verdict).length,
                cross_batch_duplicates: cross,
                shorter_sequence_known: shorter.length },
      samples: rows }, null, 1) + "\n");
console.log(`\n-> ${path.relative(process.cwd(), path.join(ROOT, "manifest.json"))}`);
