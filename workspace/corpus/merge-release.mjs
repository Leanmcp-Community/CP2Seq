// Fold the release batches into one manifest, one row per sample, with tier and depth on it.
//
// The batches are generated separately because the two tiers have different generators and run
// at different depths. A consumer should not have to know that.
//
// EVERY SAMPLE IS CORRECT BY CONSTRUCTION. It was produced by folding, and the pattern is what
// the folding left behind. There is no solver here and no "verified" split: an earlier version
// ran a search back over the shallow batches and split the corpus on whether the search closed
// them, which made the split a statement about the search's budget rather than about the data.
// The forward check that matters is verify-replay.mjs -- replay the recorded sequence, confirm
// it reproduces the pattern beside it -- and it costs the same at any depth.
//
// /!\ THE RECORDED SEQUENCE IS NOT NECESSARILY THE SHORTEST. A pattern can admit a shorter
// sequence than the one that built it. So a scorer must judge "does replaying this sequence
// produce the target pattern", never "does it match the recorded sequence step by step".
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
    for (const s of man.samples ?? []) {
        const steps = s.metrics?.steps ?? s.steps;
        rows.push({
            id: `${b}/${s.id}`, batch: b, tier, folds: steps,
            path: `${b}/samples/${s.id}`,
            creases: s.metrics?.crease_edges ?? s.metrics?.creases ?? null,
            layers: s.metrics?.layers_final ?? s.metrics?.layers ?? null,
            partial_folds: s.partial_used ?? 0,
            cp_hash: s.cp_hash,
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
console.log(`${"batch".padEnd(22)} ${"tier".padEnd(12)} ${"n".padStart(4)} ${"folds".padStart(7)}`);
for (const b of batches) {
    const g = rows.filter(r => r.batch === b);
    const lo = Math.min(...g.map(r => r.folds)), hi = Math.max(...g.map(r => r.folds));
    console.log(`${b.padEnd(22)} ${g[0].tier.padEnd(12)} ${fmt(g.length, 4)} ` +
                `${(lo === hi ? `${lo}` : `${lo}-${hi}`).padStart(7)}`);
}

const byTier = (tier) => rows.filter(r => r.tier === tier);
console.log(`\n${"".padEnd(22)} ${"n".padStart(5)} ${"folds".padStart(9)}`);
for (const tier of ["all-layers", "some-layers"]) {
    const g = byTier(tier);
    if (!g.length) continue;
    const lo = Math.min(...g.map(r => r.folds)), hi = Math.max(...g.map(r => r.folds));
    console.log(`${tier.padEnd(22)} ${fmt(g.length, 5)} ${`${lo}-${hi}`.padStart(9)}`);
}

console.log(`\ntotal ${rows.length} samples, every one correct by construction`);
console.log(`isomorphic duplicates across batches: ${cross} (kept, marked with duplicate_of)`);
console.log(`  -> a scorer must replay the sequence and compare crease sets, never compare steps`);
console.log(`     to the recorded sequence: the recorded one is A solution, not THE shortest.`);

fs.writeFileSync(path.join(ROOT, "manifest.json"), JSON.stringify(
    { generated: new Date().toISOString(),
      provenance: "every sample correct by construction: produced by folding, pattern is what the folding left behind",
      counts: { total: rows.length,
                all_layers: rows.filter(r => r.tier === "all-layers").length,
                some_layers: rows.filter(r => r.tier === "some-layers").length,
                cross_batch_duplicates: cross },
      samples: rows }, null, 1) + "\n");
console.log(`\n-> ${path.relative(process.cwd(), path.join(ROOT, "manifest.json"))}`);
