// How search cost grows with sequence length, BOTH TIERS ON ONE AXIS.
//
// This is the measurement the corpus exists to support. "Generation is trivial, the inverse
// problem is hard" has been asserted since DATASET.md §0 and evidenced twice in passing -- the
// all-layers pilot solved 25/25 at 2-6 folds and 2/15 at 8-12, and the some-layers gate solved
// 8/8 at 4 folds and 3/6 at 6. Both are side effects of runs done for other reasons, at n=8 and
// n=6, with different budgets and different sample sets. Neither is a curve, and the two cannot
// be compared to each other, which is the comparison that carries the claim.
//
// So: one sampler per tier, one budget, one set of depths, n big enough to quote. The output is
// queries-to-solve as a function of fold count, per tier, with the unsolved fraction reported
// beside it rather than dropped -- an unsolved instance is the expensive tail, and excluding it
// from the percentiles would make the curve look flatter exactly where it is steepest.
//
// /!\ TIMEOUT IS NOT FAILURE AND NOT PROOF. Budget exhausted means the status is unknown. It is
// counted, never folded into "unsolvable" and never silently dropped from the denominator.
//
// /!\ THE TWO TIERS' QUERY COUNTS ARE COMPARABLE BY CONSTRUCTION, and that is not free: both
// solvers count one simulated fold as one query (stage2.mjs, solve-layers.mjs). They are NOT
// comparable in wall clock -- a some-layers query carries an O(L^2) tear check that an
// all-layers query does not -- so ms is recorded for cost planning and is not the axis.
//
//   node scaling.mjs [--n 30] [--depths 3,4,5,6] [--budget 1000000] [--partial 0.5]
//                    [--tier both|all|some] [--seed N] [--out out/scaling]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { solve } from "../probe-c/stage2.mjs";
import { solveLayers } from "./solve-layers.mjs";
import { build } from "./generate.mjs";
import { sample } from "./generate-layers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const N = Number(arg("n", 30));
const DEPTHS = String(arg("depths", "3,4,5,6")).split(",").map(Number);
const BUDGET = Number(arg("budget", 1000000));
const PARTIAL = Number(arg("partial", 0.5));
const TIER = String(arg("tier", "both"));
const SEED = Number(arg("seed", 20260916));
const OUT = path.resolve(HERE, String(arg("out", "out/scaling")));

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b);
                       return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };

// One instance: sample a CP of the requested length, hand the solver nothing but the CP.
function runOne(tier, seed, depth) {
    if (tier === "all") {
        const r = build(seed, depth, { reject: [], snapshots: false });
        if (r.reject) return { skip: r.reject };
        const t0 = Date.now();
        const v = solve(r.fold, { maxQueries: BUDGET, maxDepth: depth });
        return { ...v, ms: Date.now() - t0,
                 creases: r.metrics.crease_edges, layers: r.metrics.layers_final };
    }
    const s = sample(seed, PARTIAL, depth);
    if (!s.ok) return { skip: `stalled at ${s.stalledAt}` };
    const t0 = Date.now();
    const v = solveLayers(s.pl.fold, { maxQueries: BUDGET, maxDepth: depth, maxLayers: 4096 });
    return { ...v, ms: Date.now() - t0,
             creases: (s.pl.stats.counts.M || 0) + (s.pl.stats.counts.V || 0), layers: s.layers };
}

const tiers = TIER === "both" ? ["all", "some"] : [TIER];
const rows = [];
fs.mkdirSync(OUT, { recursive: true });

console.log(`scaling: n=${N} depths=${DEPTHS.join(",")} budget=${BUDGET} p(partial)=${PARTIAL}\n`);
console.log(`${"tier".padEnd(6)} ${"folds".padStart(5)} ${"n".padStart(4)} ${"solved".padStart(6)} ` +
            `${"timeout".padStart(7)} ${"q p10".padStart(9)} ${"q p50".padStart(9)} ${"q p90".padStart(9)} ` +
            `${"ms p50".padStart(8)}`);

for (const tier of tiers) {
    for (const depth of DEPTHS) {
        const got = [];
        let skipped = 0;
        for (let i = 0; i < N; i++) {
            const r = runOne(tier, SEED + i * 7919 + depth * 104729, depth);
            if (r.skip) { skipped++; continue; }
            got.push(r);
        }
        const solved = got.filter(r => r.status === "SOLVED");
        const timeout = got.filter(r => r.status === "TIMEOUT");
        const other = got.filter(r => r.status !== "SOLVED" && r.status !== "TIMEOUT");
        const qs = solved.map(r => r.queries);
        const row = { tier, depth, n: got.length, skipped,
                      solved: solved.length, timeout: timeout.length,
                      other: other.map(r => r.status),
                      q10: q(qs, .1), q50: q(qs, .5), q90: q(qs, .9),
                      ms50: q(solved.map(r => r.ms), .5),
                      creases50: q(got.map(r => r.creases), .5),
                      layers50: q(got.map(r => r.layers), .5) };
        rows.push(row);
        console.log(`${tier.padEnd(6)} ${String(depth).padStart(5)} ${String(row.n).padStart(4)} ` +
                    `${String(row.solved).padStart(6)} ${String(row.timeout).padStart(7)} ` +
                    `${String(row.q10 ?? "-").padStart(9)} ${String(row.q50 ?? "-").padStart(9)} ` +
                    `${String(row.q90 ?? "-").padStart(9)} ${String(row.ms50 ?? "-").padStart(8)}`);
        if (other.length) console.log(`       /!\\ ${other.length} other verdicts: ${[...new Set(row.other)].join(",")}`);
        // written after every cell, so a run killed halfway still leaves usable data
        fs.writeFileSync(path.join(OUT, "scaling.json"), JSON.stringify(
            { generated: new Date().toISOString(), n: N, budget: BUDGET, p_partial: PARTIAL,
              seed: SEED, depths: DEPTHS, rows }, null, 1) + "\n");
    }
}

// The growth factor per two folds, which is the number the claim is made in. Reported only
// where BOTH depths solved enough instances to have a median -- a median over three survivors
// of thirty is not a median, and quoting a ratio built on one would overstate the curve.
console.log(`\ngrowth in median queries, per +2 folds:`);
for (const tier of tiers) {
    const t = rows.filter(r => r.tier === tier);
    for (const r of t) {
        const prev = t.find(x => x.depth === r.depth - 2);
        if (!prev || !prev.q50 || !r.q50) continue;
        const thin = r.solved < r.n / 2 || prev.solved < prev.n / 2;
        console.log(`  ${tier.padEnd(6)} ${prev.depth} -> ${r.depth} folds: ${(r.q50 / prev.q50).toFixed(1)}x` +
                    (thin ? `   /!\\ fewer than half solved at one end -- the true factor is LARGER` : ""));
    }
}
console.log(`\n-> ${path.relative(process.cwd(), path.join(OUT, "scaling.json"))}`);
