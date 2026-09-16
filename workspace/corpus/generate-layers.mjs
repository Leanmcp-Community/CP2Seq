// Random corpus generator, SOME-LAYERS tier.
//
// HOW MOVES ARE CHOSEN, AND WHY IT IS ENUMERATION. The first pilot proposed folds at random and
// threw away the illegal ones. It worked, and it could not control anything: asked for partial
// folds half the time, 9.4% of accepted folds were partial, because 88% of partial proposals
// tear the sheet. The knob named a quantity the sampler does not own -- the same failure as the
// all-layers pilot's proportional coupling cap, in a different costume.
//
// So this enumerates every legal move at each state and samples from that set. The objection
// raised against doing so -- that it compiles the physics into the sampler, and the corpus then
// contains only folds the sampler knew how to build -- applies to a HEURISTIC that dodges the
// joins. It does not apply to exact enumeration: enumerating the legal moves is not an
// assumption about the action space, it is that space's definition. Three things follow, and
// the third is why it is worth the cost:
//
//   * sampling is uniform INSIDE the legal set, so there is no bias toward the easy partials
//     that rejection sampling would have collected
//   * the partial fraction is genuinely controllable, because the denominator is the legal set
//     rather than the proposal space
//   * the BRANCHING FACTOR falls out, which is a real difficulty statistic and the first thing
//     a solver for this tier will need
//
// /!\ WHAT THE PILOT'S 11.9% DOES NOT MEAN. Enumeration refuted the reading that this tier's
// legal moves are rare: they GROW with depth -- 22 legal partial folds at two layers, 332 at
// thirty-eight, six times the all-layers moves available at the same state. What falls is the
// hit rate of uniform random proposal, because lines x layer-runs grows faster than the legal
// set inside it. A fact about a sampler, not about origami (notes/plan/corpus-plan.md).
//
// COST: enumeration is about O(L^3) -- O(L) candidates, each folding O(L) faces with an O(L^2)
// tear check. 4 ms at one layer, 1.1 s at thirty-three. That is why depth is modest here.
//
//   node generate-layers.mjs [--n 30] [--steps 7] [--partial 0.5] [--seed N] [--sweep]
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
const N = arg("n", 30), SEED = arg("seed", 20260916), STEPS = arg("steps", 7);
const SWEEP = process.argv.includes("--sweep");
const OUT = path.join(HERE, "out/layers-v2");

const rngFrom = (seed) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// The four-angle grid, kept from the core generator: those reflections have integer matrix
// entries, so a long composed sequence drifts by nothing. Authored models get the whole plane
// because they are six folds long; a sampler running to twenty does not.
const NORMALS = [[0, 1], [-Math.SQRT1_2, Math.SQRT1_2], [1, 0], [Math.SQRT1_2, Math.SQRT1_2]];

function offsetsFor(st, n) {
    let lo = Infinity, hi = -Infinity;
    for (const { poly } of currentPolys(st)) for (const p of poly) {
        const t = n[0] * p[0] + n[1] * p[1];
        lo = Math.min(lo, t); hi = Math.max(hi, t);
    }
    return Array.from({ length: 7 }, (_, k) => lo + (hi - lo) * (k + 1) / 8);
}

// Every legal move at this state, split by tier. `over` is a real choice for an all-layers fold
// -- the two directions write opposite M/V and are different moves -- and is forced for a
// partial run, so it is not enumerated there.
function legalMoves(st) {
    const L = layerCount(st);
    const all = [], partial = [];
    for (const n of NORMALS) for (const d of offsetsFor(st, n)) for (const mp of [true, false]) {
        const line = { n, d };
        for (const over of [true, false])
            if (!foldLayers(st, line, mp, { mode: "all" }, over).error)
                all.push({ line, mp, sel: { mode: "all" }, over });
        for (let k = 1; k < L; k++) {
            if (!foldLayers(st, line, mp, { mode: "top", k }, true).error)
                partial.push({ line, mp, sel: { mode: "top", k }, over: true });
            if (!foldLayers(st, line, mp, { mode: "bottom", k }, false).error)
                partial.push({ line, mp, sel: { mode: "bottom", k }, over: false });
        }
    }
    return { all, partial };
}

function sample(seed, pPartial) {
    const rand = rngFrom(seed);
    let st = initSheet();
    const creases = [], seq = [], branching = [];
    let partialUsed = 0;

    for (let s = 0; s < STEPS; s++) {
        const moves = legalMoves(st);
        branching.push({ step: s + 1, layers: layerCount(st),
                         all: moves.all.length, partial: moves.partial.length });
        // Want a partial fold this step? Only if the legal set has one. Falling back to the
        // all-layers pool rather than stalling is what keeps the realised fraction honest: it
        // is reported, never assumed to equal pPartial.
        const wantPartial = rand() < pPartial && moves.partial.length > 0;
        const pool = wantPartial ? moves.partial
                   : (moves.all.length ? moves.all : moves.partial);
        if (!pool.length) return { ok: false, stalledAt: s, branching };

        const m = pool[Math.floor(rand() * pool.length)];
        const before = layerCount(st);
        const r = foldLayers(st, m.line, m.mp, m.sel, m.over);
        if (r.error) return { ok: false, stalledAt: s, branching };
        creases.push(...r.made);
        st = r.state;
        if (m.sel.mode !== "all") partialUsed++;
        seq.push({ step: s + 1, normal: m.line.n, offset: m.line.d, move_positive: m.mp,
                   selection: m.sel, over: r.over, layers_moved: r.moved,
                   creases_created: r.made.length,
                   layers_before: before, layers_after: layerCount(st),
                   legal_all: moves.all.length, legal_partial: moves.partial.length });
    }

    if (!creases.length) return { ok: false, stalledAt: 0, branching };
    const segs = [
        { P: [0, 0], Q: [1, 0], assignment: "B" }, { P: [1, 0], Q: [1, 1], assignment: "B" },
        { P: [1, 1], Q: [0, 1], assignment: "B" }, { P: [0, 1], Q: [0, 0], assignment: "B" },
        ...creases.map(c => ({ P: c.P, Q: c.Q, assignment: c.a })),
    ];
    const pl = planarize(segs);

    // How unlike each other the layers are. /!\ This was put in as the tier's signature -- "only
    // a partial fold can make the layers differ" -- and the sweep refutes it: the median is 18
    // with no partial folds at all and 14 with nothing but partial folds, i.e. slightly HIGHER
    // for pure all-layers folding, because an all-layers fold also cuts layers into pieces of
    // different size. It is kept as a recorded covariate. A measure that actually separates the
    // two tiers is still open.
    const areas = currentPolys(st).map(p => {
        let a = 0;
        for (let i = 0; i < p.poly.length; i++) {
            const u = p.poly[i], w = p.poly[(i + 1) % p.poly.length];
            a += u[0] * w[1] - w[0] * u[1];
        }
        return Math.round(Math.abs(a) / 2 * 1e4) / 1e4;
    });

    return { ok: true, seq, creases, pl, branching, partialUsed,
             layers: layerCount(st), area: +paperArea(st).toFixed(6),
             distinctAreas: new Set(areas).size };
}

/* ---------- run ---------- */
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b);
                       return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };

function batch(pPartial) {
    const rows = [], branch = [];
    let stalled = 0;
    for (let i = 0; i < N; i++) {
        const r = sample(SEED + i * 7919, pPartial);
        branch.push(...r.branching);
        if (!r.ok) { stalled++; continue; }
        rows.push({ seed: SEED + i * 7919, steps: r.seq.length, partial: r.partialUsed,
                    creases: (r.pl.stats.counts.M || 0) + (r.pl.stats.counts.V || 0),
                    layers: r.layers, area: r.area, distinctAreas: r.distinctAreas,
                    couplingMax: Math.max(...r.seq.map(s => s.creases_created)),
                    conflicts: r.pl.stats.assignment_conflicts });
    }
    const folds = rows.reduce((a, r) => a + r.steps, 0);
    return { pPartial, rows, branch, stalled,
             realised: folds ? rows.reduce((a, r) => a + r.partial, 0) / folds : 0,
             conflicts: rows.reduce((a, r) => a + r.conflicts, 0),
             conserved: rows.every(r => Math.abs(r.area - 1) < 1e-6) };
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const settings = SWEEP ? [0, 0.25, 0.5, 0.75, 1] : [arg("partial", 0.5)];
console.log(`some-layers v2, enumerated sampler: n=${N} steps=${STEPS} seed=${SEED}\n`);
console.log(`${"asked".padStart(6)} ${"got".padStart(7)} ${"stalled".padStart(8)} ` +
            `${"layers p50".padStart(11)} ${"creases p50".padStart(12)} ` +
            `${"distinct areas".padStart(15)} ${"conserved".padStart(10)}`);

const results = [];
for (const p of settings) {
    const b = batch(p);
    results.push(b);
    console.log(`${p.toFixed(2).padStart(6)} ${((100 * b.realised).toFixed(1) + "%").padStart(7)} ` +
                `${String(b.stalled).padStart(8)} ` +
                `${String(q(b.rows.map(r => r.layers), .5)).padStart(11)} ` +
                `${String(q(b.rows.map(r => r.creases), .5)).padStart(12)} ` +
                `${String(q(b.rows.map(r => r.distinctAreas), .5)).padStart(15)} ` +
                `${String(b.conserved).padStart(10)}`);
    if (b.conflicts) console.log(`  /!\\ ${b.conflicts} M/V conflicts`);
}

// the branching factor, which is the other reason to enumerate
const all = results.flatMap(r => r.branch);
console.log(`\nlegal moves per state (median), by stack thickness:`);
console.log(`  ${"layers".padEnd(9)} ${"states".padStart(7)} ${"all-layers".padStart(11)} ` +
            `${"partial".padStart(9)}`);
for (const [lo, hi] of [[1, 1], [2, 3], [4, 7], [8, 15], [16, 31], [32, 1e9]]) {
    const b = all.filter(x => x.layers >= lo && x.layers <= hi);
    if (!b.length) continue;
    const label = hi > 1e8 ? lo + "+" : lo + "-" + hi;
    console.log(`  ${label.padEnd(9)} ${String(b.length).padStart(7)} ` +
                `${String(q(b.map(x => x.all), .5)).padStart(11)} ` +
                `${String(q(b.map(x => x.partial), .5)).padStart(9)}`);
}

fs.writeFileSync(path.join(OUT, "sweep.json"), JSON.stringify(
    { generated: new Date().toISOString(), n: N, steps: STEPS, seed: SEED,
      settings: results.map(r => ({ p_partial: r.pPartial, realised: +r.realised.toFixed(4),
                                    stalled: r.stalled, conserved: r.conserved,
                                    conflicts: r.conflicts, samples: r.rows })) }, null, 1) + "\n");
console.log(`\n-> ${path.relative(process.cwd(), path.join(OUT, "sweep.json"))}`);
