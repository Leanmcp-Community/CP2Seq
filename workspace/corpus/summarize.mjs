// Reduce a corpus run to the handful of numbers the write-up is allowed to quote.
//
// WHY A SEPARATE FILE. A run is ~95 MB and is gitignored, because it rebuilds byte-identically
// from its seed. But notes/facts.json has to be derivable on a fresh clone, so the numbers the
// docs cite cannot live inside an artefact nobody has. This writes the small summary that does
// get committed.
//
//   node summarize.mjs [runDir]      -> workspace/corpus/corpus-summary.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = process.argv[2] ?? path.join(HERE, "out/v2");
const man = JSON.parse(fs.readFileSync(path.join(RUN, "manifest.json"), "utf8"));

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b);
                       return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const col = (f) => man.samples.map(s => f(s.metrics));

const cells = man.strata.map(st => {
    const g = man.samples.filter(s => s.stratum === st.name);
    return { name: st.name, steps: [st.min, st.max], coupling_cap: st.coupling_cap ?? null,
             n: g.length, quota: man.n_per_stratum,
             steps_p50: g.length ? q(g.map(s => s.metrics.steps), .5) : null,
             coupling_max_p50: g.length ? q(g.map(s => s.metrics.coupling_max), .5) : null,
             crease_edges_p50: g.length ? q(g.map(s => s.metrics.crease_edges), .5) : null,
             degenerate: g.filter(s => s.metrics.degenerate).length };
});

const summary = {
    _how: "node workspace/corpus/summarize.mjs — derived from a run's manifest.json",
    run: path.basename(RUN),
    generated: man.generated,
    seed0: man.seed0,
    n_per_stratum: man.n_per_stratum,
    samples: man.samples.length,
    quota_total: man.n_per_stratum * man.strata.length,
    cells_filled: cells.filter(c => c.n >= c.quota).length,
    cells_total: cells.length,
    unique_cp_hashes: new Set(man.samples.map(s => s.cp_hash)).size,
    steps: { min: Math.min(...col(m => m.steps)), max: Math.max(...col(m => m.steps)),
             p50: q(col(m => m.steps), .5) },
    coupling_max: { p50: q(col(m => m.coupling_max), .5), max: Math.max(...col(m => m.coupling_max)) },
    coupling_mean: { p50: q(col(m => m.coupling_mean), .5),
                     max: Math.max(...col(m => m.coupling_mean)) },
    crease_edges: { p50: q(col(m => m.crease_edges), .5), max: Math.max(...col(m => m.crease_edges)) },
    degenerate: man.samples.filter(s => s.metrics.degenerate).length,
    cells,
};

const out = path.join(HERE, "corpus-summary.json");
fs.writeFileSync(out, JSON.stringify(summary, null, 1) + "\n");
console.log(`corpus-summary.json: ${summary.samples} samples, ` +
            `${summary.cells_filled}/${summary.cells_total} cells filled, ` +
            `steps ${summary.steps.min}-${summary.steps.max}, ` +
            `coupling p50 ${summary.coupling_mean.p50}`);
for (const c of cells) if (c.n < c.quota)
    console.log(`  under quota: ${c.name} ${c.n}/${c.quota}`);
