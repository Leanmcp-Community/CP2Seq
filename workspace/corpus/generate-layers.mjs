// Random corpus generator, SOME-LAYERS tier -- pilot batch.
//
// WHAT IS DELIBERATELY NOT DECIDED HERE. How to sample "which layers does this fold move" is
// the one new degree of freedom the tier introduces, and it is left as a knob rather than
// designed up front. That is the same discipline the all-layers pilot followed and the reason
// its anti-degeneracy knob is defensible: the absolute coupling cap was chosen because 556
// samples stalled under the proportional one, not because it sounded right
// (notes/plan/corpus-plan.md). So this run reports the distribution and decides nothing.
//
// TWO THINGS THE ALL-LAYERS AXES DO NOT SURVIVE INTO THIS TIER, and they need saying before any
// number here is read as difficulty:
//
//   COUPLING STOPS BEING A DIFFICULTY AXIS. In the core tier, "how many layers did this fold
//   cut" is a CONSEQUENCE of the geometry -- the fold crosses the stack and you get what you
//   get, which is why it works as a difficulty knob. Here it is an ARGUMENT: the sampler picks
//   how many layers move. A quantity you set is not a measure of how hard the instance is.
//
//   THERE IS NO SOLVER FOR THIS TIER. So a sample cannot be round-trip checked, cannot carry a
//   pure-search query baseline, and cannot supply the "was this branch still solvable" ground
//   truth that the pruning experiment needs. This corpus is generatable and inspectable, not
//   yet scorable. Stated here so nobody quotes a difficulty stratum off it by accident.
//
// WHAT IS WORTH MEASURING, and is the actual point of the pilot: how often a randomly proposed
// partial fold is physically impossible. Every partial fold risks tearing the sheet -- a moving
// face joined to a stationary one along a crease that is not on the fold line -- and nobody
// knows yet whether that makes the tier rare-and-precious or routine.
//
//   node generate-layers.mjs [--n 60] [--seed 20260916] [--steps 8] [--partial 0.5]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initSheet, foldLayers, currentPolys, paperArea, layerCount }
    from "./fold-engine-layers.mjs";
import { planarize } from "./planarize.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => {
    const i = process.argv.indexOf(`--${k}`);
    return i < 0 ? d : Number(process.argv[i + 1]);
};
const N = arg("n", 60), SEED = arg("seed", 20260916);
const STEPS = arg("steps", 8), P_PARTIAL = arg("partial", 0.5);
const OUT = path.join(HERE, "out/layers-pilot");

const rngFrom = (seed) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// The four-angle grid, kept from the core generator on purpose: those reflections have integer
// matrix entries, so a long composed sequence drifts by nothing. Authored models get the whole
// plane because they are six folds long; a sampler running to twenty does not.
const NORMALS = [[0, 1], [-Math.SQRT1_2, Math.SQRT1_2], [1, 0], [Math.SQRT1_2, Math.SQRT1_2]];

// offsets that actually cut the current paper, on a coarse grid
function offsetsFor(st, n) {
    let lo = Infinity, hi = -Infinity;
    for (const { poly } of currentPolys(st)) for (const p of poly) {
        const t = n[0] * p[0] + n[1] * p[1];
        lo = Math.min(lo, t); hi = Math.max(hi, t);
    }
    const out = [];
    for (let k = 1; k <= 7; k++) out.push(lo + (hi - lo) * k / 8);
    return out;
}

function sample(seed) {
    const rand = rngFrom(seed);
    let st = initSheet();
    const creases = [], seq = [];
    const reject = { "would-tear": 0, "no-crease": 0, "nothing-to-move": 0,
                     "direction-impossible": 0 };
    // Does a partial fold get harder as the stack grows? That is the question the sampler's
    // design turns on, and it cannot be read off a total.
    const byDepth = [];              // { layers, attempted, accepted } per partial proposal
    let partial = 0;

    for (let s = 0; s < STEPS; s++) {
        let done = null;
        for (let tries = 0; tries < 80 && !done; tries++) {
            const n = NORMALS[Math.floor(rand() * 4)];
            const offs = offsetsFor(st, n);
            const line = { n, d: offs[Math.floor(rand() * offs.length)] };
            const movePositive = rand() < 0.5;
            const L = layerCount(st);

            let sel = { mode: "all" }, over = rand() < 0.5;
            if (L > 1 && rand() < P_PARTIAL) {
                const fromTop = rand() < 0.5;
                sel = { mode: fromTop ? "top" : "bottom",
                        k: 1 + Math.floor(rand() * (L - 1)) };
                over = fromTop;                       // forced by physics; see the engine
            }
            const r = foldLayers(st, line, movePositive, sel, over);
            if (sel.mode !== "all") byDepth.push({ layers: L, ok: !r.error });
            if (r.error) { reject[r.error] = (reject[r.error] ?? 0) + 1; continue; }
            done = { line, movePositive, sel, r };
        }
        if (!done) return { ok: false, stalledAt: s, reject };

        const { line, movePositive, sel, r } = done;
        const before = layerCount(st);
        creases.push(...r.made);
        st = r.state;
        if (sel.mode !== "all") partial++;
        seq.push({ step: s + 1, normal: line.n, offset: line.d,
                   move_positive: movePositive, selection: sel, over: r.over,
                   layers_moved: r.moved, creases_created: r.made.length,
                   layers_before: before, layers_after: layerCount(st) });
    }

    if (!creases.length) return { ok: false, stalledAt: 0, reject };
    const segs = [
        { P: [0, 0], Q: [1, 0], assignment: "B" }, { P: [1, 0], Q: [1, 1], assignment: "B" },
        { P: [1, 1], Q: [0, 1], assignment: "B" }, { P: [0, 1], Q: [0, 0], assignment: "B" },
        ...creases.map(c => ({ P: c.P, Q: c.Q, assignment: c.a })),
    ];
    const pl = planarize(segs);

    // How unlike each other the layers are. All-layers folding moves every layer's boundary
    // together, so this stays low however long it runs; a partial fold is the only thing that
    // can raise it. It is the tier's signature, not a difficulty measure.
    const areas = currentPolys(st).map(p => {
        let a = 0;
        for (let i = 0; i < p.poly.length; i++) {
            const u = p.poly[i], w = p.poly[(i + 1) % p.poly.length];
            a += u[0] * w[1] - w[0] * u[1];
        }
        return Math.round(Math.abs(a) / 2 * 1e4) / 1e4;
    });

    return { ok: true, seq, creases, pl, reject, partial, byDepth,
             layers: layerCount(st), area: +paperArea(st).toFixed(6),
             distinctAreas: new Set(areas).size };
}

/* ---------- run the batch ---------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const rows = [], rejectTotal = {}, depthStats = [];
let stalled = 0;
for (let i = 0; i < N; i++) {
    const r = sample(SEED + i * 7919);
    for (const [k, v] of Object.entries(r.reject)) rejectTotal[k] = (rejectTotal[k] ?? 0) + v;
    if (r.byDepth) depthStats.push(...r.byDepth);
    if (!r.ok) { stalled++; continue; }
    rows.push({ seed: SEED + i * 7919, steps: r.seq.length, partial: r.partial,
                creases: (r.pl.stats.counts.M || 0) + (r.pl.stats.counts.V || 0),
                layers: r.layers, area: r.area, distinctAreas: r.distinctAreas,
                couplingMax: Math.max(...r.seq.map(s => s.creases_created)),
                conflicts: r.pl.stats.assignment_conflicts });
}

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b);
                       return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const col = (f) => rows.map(f);
const acceptedFolds = rows.reduce((a, r) => a + r.steps, 0);
const rejects = Object.values(rejectTotal).reduce((a, b) => a + b, 0);

console.log(`some-layers pilot: n=${N} seed=${SEED} steps=${STEPS} p(partial)=${P_PARTIAL}\n`);
console.log(`built ${rows.length}, stalled ${stalled}`);
console.log(`paper conserved in all: ${rows.every(r => Math.abs(r.area - 1) < 1e-6)}`);
console.log(`M/V conflicts: ${rows.reduce((a, r) => a + r.conflicts, 0)}`);
console.log(`\nper sample          p10   p50   p90   max`);
for (const [name, f] of [["folds that were partial", r => r.partial],
                         ["layers", r => r.layers],
                         ["creases", r => r.creases],
                         ["distinct layer areas", r => r.distinctAreas],
                         ["max creases in one fold", r => r.couplingMax]])
    console.log(`  ${name.padEnd(24)} ${String(q(col(f), .1)).padStart(4)} ` +
                `${String(q(col(f), .5)).padStart(5)} ${String(q(col(f), .9)).padStart(5)} ` +
                `${String(Math.max(...col(f))).padStart(5)}`);

console.log(`\nproposals rejected: ${rejects} against ${acceptedFolds} accepted folds ` +
            `(${(100 * rejects / (rejects + acceptedFolds)).toFixed(1)}% of all proposals)`);
for (const [k, v] of Object.entries(rejectTotal).sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(22)} ${String(v).padStart(6)}  ` +
                `${(100 * v / rejects).toFixed(1)}% of rejects`);

fs.writeFileSync(path.join(OUT, "pilot.json"), JSON.stringify(
    { generated: new Date().toISOString(), n: N, seed: SEED, steps: STEPS,
      p_partial: P_PARTIAL, built: rows.length, stalled,
      rejects: rejectTotal, samples: rows }, null, 1) + "\n");
console.log(`\n-> ${path.relative(process.cwd(), path.join(OUT, "pilot.json"))}`);

// The number the sampler's design turns on: does a partial fold get harder as the stack grows?
const buckets = [[1, 2], [3, 4], [5, 8], [9, 16], [17, 32], [33, 1e9]];
console.log(`\npartial folds, by how many layers were on the stack when proposed:`);
console.log(`  ${"layers".padEnd(10)} ${"proposed".padStart(9)} ${"accepted".padStart(9)}  rate`);
for (const [lo, hi] of buckets) {
    const b = depthStats.filter(d => d.layers >= lo && d.layers <= hi);
    if (!b.length) continue;
    const ok = b.filter(d => d.ok).length;
    console.log(`  ${(hi > 1e8 ? `${lo}+` : `${lo}-${hi}`).padEnd(10)} ` +
                `${String(b.length).padStart(9)} ${String(ok).padStart(9)}  ` +
                `${(100 * ok / b.length).toFixed(1)}%`);
}
const okPartial = depthStats.filter(d => d.ok).length;
console.log(`  ${"overall".padEnd(10)} ${String(depthStats.length).padStart(9)} ` +
            `${String(okPartial).padStart(9)}  ${(100 * okPartial / depthStats.length).toFixed(1)}%`);
console.log(`\nasked for partial ${(100 * P_PARTIAL).toFixed(0)}% of the time; ` +
            `${(100 * rows.reduce((a, r) => a + r.partial, 0) / acceptedFolds).toFixed(1)}% ` +
            `of ACCEPTED folds are partial -- the gap is the tear rate, not the knob.`);

console.log(`Nothing is decided from this run by itself. The question it is here to answer is`);
console.log(`whether a random partial fold is usually possible or usually a tear.`);
