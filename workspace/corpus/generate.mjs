// The synthetic Pureland corpus generator.
//
//   square --random simple folds--> sequence --unfold--> crease pattern
//
// Bucket A BY CONSTRUCTION: the (CP, sequence) pair is built, not labelled, so there is
// nothing to annotate and nothing to trust (DATASET.md section 0).
//
// DIFFICULTY IS STRATIFIED, NOT SAMPLED AND HOPED FOR.
// Two axes, matching Learn2Fold's step count + non-local dependency (papers.md #4):
//
//   axis 1  STEPS -- the frozen main axis (experiment-spec-checklist.md B). Controlled
//           directly at generation time, and the strata below are calibrated to PurelandFold
//           so the synthetic corpus and the real anchor are read on one scale.
//
//           /!\ The cut points are NOT PurelandFold's raw step counts. 47 of its 337 frames
//           are PRE-CREASE steps (fold, then unfold, leaving only a crease), and pre-creasing
//           is outside the frozen action space, so those frames are merged into the step that
//           follows them (workspace/data/export_purelandfold_models.py applies the rule).
//           Measured on the raw counts the range reads 5-21 with tertiles <=11 / 12-14 / >14;
//           counting only steps that exist in the action space it is 4-19 with tertiles
//           <=10 / 11-13 / >13, and those are the cut points below. Calibrating against the
//           raw numbers would have meant our 12 folds and PurelandFold's 12 folds were not
//           the same quantity.
//
//           Do not transcribe these by hand. export_purelandfold_models.py prints the line
//           this file has to match, because the cut points were wrong twice already -- once
//           from using raw counts, once from an off-by-one in the tertile index.
//
//   axis 2  COUPLING -- creases created per fold, i.e. how many layers one fold cuts. Recorded
//           per step and summarised per sample, NOT yet used for quotas: its cut points are
//           "pending pilot" in the checklist, and the reason the axis was written off earlier
//           (PurelandFold p50=0.7 vs instagram p50=12.8) was measured on 27 sequences someone
//           else folded. We control this sampler, so the spread here is an open empirical
//           question -- `report.md` prints the distribution so the cut points can be chosen
//           from data rather than guessed. Pass --coupling-strata to turn it into quotas once
//           that number exists.
//
// WHAT COMES OUT. Every sample keeps both endpoints and the whole middle:
//   cp.fold          the crease pattern, planarised
//   seq.json         every fold: line, direction, the creases it made, its coupling
//   steps/*.fold     the folded state after each step (--export-steps)
//   meta.json        difficulty metrics, degeneracy flags, provenance
// Given the seed the whole sample rebuilds, so the corpus is reproducible without shipping it.
//
// VERIFICATION IS OPTIONAL AND THAT IS DELIBERATE (--verify).
// The sequence is not a claim that needs checking -- we folded it. Running the stage 2 solver
// back over a sample only asks a different question: can pure search recover it? It cannot
// past roughly 8 folds, so REQUIRING verification would silently delete the entire hard half
// of the corpus and cap difficulty exactly where it starts being interesting. So: keep every
// sample, and LABEL the solvable subset. The labelled subset is what the pure-search baseline
// curve is drawn on; the whole corpus is what the model is scored on.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { foldRandom, polyArea, bbox } from "./fold-engine.mjs";
import { planarize, foldedState } from "./planarize.mjs";
import { lineOf, lkey } from "../probe-c/stage2.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// mulberry32: small, seeded, and far better distributed than the LCG the probe used
const rngFrom = (seed) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// PurelandFold's tertiles counted in action-space steps only -- see the header note
const DEFAULT_STRATA = [
    { name: "easy", min: 4,  max: 10 },
    { name: "mid",  min: 11, max: 13 },
    { name: "hard", min: 14, max: 19 },
];

/* ---------- isomorphism: a CP and its 8 square symmetries are the same sample ------------ */
const SYMS = [
    (p) => [p[0], p[1]],         (p) => [1 - p[0], p[1]],
    (p) => [p[0], 1 - p[1]],     (p) => [1 - p[0], 1 - p[1]],
    (p) => [p[1], p[0]],         (p) => [1 - p[1], p[0]],
    (p) => [p[1], 1 - p[0]],     (p) => [1 - p[1], 1 - p[0]],
];
function canonical(fold) {
    const r = (v) => Math.round(v * 1e6) / 1e6;
    let best = null;
    for (const S of SYMS) {
        const rows = fold.edges_vertices.map(([u, w], i) => {
            const A = S(fold.vertices_coords[u]), B = S(fold.vertices_coords[w]);
            const [p, q] = (A[0] < B[0] || (A[0] === B[0] && A[1] <= B[1])) ? [A, B] : [B, A];
            return `${r(p[0])},${r(p[1])},${r(q[0])},${r(q[1])},${fold.edges_assignment[i]}`;
        }).sort();
        const s = rows.join(";");
        if (best === null || s < best) best = s;
    }
    // a short digest is enough for dedup and keeps meta.json readable
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < best.length; i++) {
        h1 = Math.imul(h1 ^ best.charCodeAt(i), 16777619) >>> 0;
        h2 = Math.imul(h2 + best.charCodeAt(i), 2246822519) >>> 0;
    }
    return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/* ---------- difficulty + degeneracy ----------------------------------------------------- */
function measure(run, pl) {
    const created = run.seq.map(s => s.creases_created);
    const lines = new Set();
    for (const c of run.creases) { const l = lineOf(c.P, c.Q); if (l) lines.add(lkey(l)); }
    const angles = new Set(run.seq.map(s => s.angle_deg));
    const fin = bbox(run.layers);
    const mv = pl.stats.counts;

    const m = {
        steps: run.seq.length,
        crease_segments_raw: run.creases.length,
        crease_edges: (mv.M || 0) + (mv.V || 0),
        mountain: mv.M || 0, valley: mv.V || 0, border: mv.B || 0,
        distinct_crease_lines: lines.size,
        vertices: pl.stats.vertices,
        // --- axis 2: non-local coupling / layers bent at once ---
        coupling_max: Math.max(...created),
        coupling_mean: +(created.reduce((a, b) => a + b, 0) / created.length).toFixed(3),
        coupling_total: created.reduce((a, b) => a + b, 0),
        coupling_final_step: created[created.length - 1],
        layers_final: run.layers.length,
        distinct_angles: angles.size,
        bbox_area_final: +fin.area.toFixed(6),
        largest_face_final: +Math.max(...run.layers.map(l => polyArea(l.poly))).toFixed(6),
    };

    // Flags are RECORDED, not enforced. The checklist puts degeneracy cut points at
    // "pending pilot" and corpus-plan.md says explicitly: look at the first batch before
    // designing the filter. --reject turns any of these into a hard filter once that is done.
    m.flags = {
        // every fold on a handful of lines = "fold it in half over and over"
        repeated_halving: m.distinct_crease_lines < Math.ceil(m.steps * 0.75),
        // never cut more than one layer: the non-local coupling that makes this hard is absent
        no_coupling: m.coupling_max <= 1,
        // the paper collapsed to a sliver, so later folds are geometrically trivial
        collapsed: m.bbox_area_final < 0.05,
        // folds along a single direction family
        single_angle: m.distinct_angles <= 1,
    };
    m.degenerate = Object.values(m.flags).some(Boolean);
    return m;
}

/* ---------- one sample ------------------------------------------------------------------- */
function build(seed, steps, opts) {
    const rand = rngFrom(seed);
    const run = foldRandom(steps, rand, {
        snapshots: opts.snapshots,
        couplingCap: opts.couplingCap, couplingFrac: opts.couplingFrac });
    if (!run.ok) return { reject: `stalled at step ${run.stalledAt}` };
    if (!run.creases.length) return { reject: "no creases" };
    if (!run.exactOk) return { reject: "placement lost exactness" };

    const segs = [
        { P: [0, 0], Q: [1, 0], assignment: "B" }, { P: [1, 0], Q: [1, 1], assignment: "B" },
        { P: [1, 1], Q: [0, 1], assignment: "B" }, { P: [0, 1], Q: [0, 0], assignment: "B" },
        ...run.creases.map(c => ({ P: c.P, Q: c.Q, assignment: c.a })),
    ];
    const pl = planarize(segs);
    if (pl.stats.assignment_conflicts) return { reject: "M/V conflict survived planarisation" };
    if (pl.stats.non_bmv_edges) return { reject: "non-BMV edge (F edges are out of scope)" };

    const metrics = measure(run, pl);
    if (opts.reject.some(f => metrics.flags[f])) return { reject: `degenerate: ${opts.reject.filter(f => metrics.flags[f]).join(",")}` };

    return { run, fold: pl.fold, plStats: pl.stats, metrics, hash: canonical(pl.fold) };
}

/* ---------- CLI ------------------------------------------------------------------------- */
const arg = (k, dflt) => {
    const i = process.argv.indexOf(`--${k}`);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const has = (k) => process.argv.includes(`--${k}`);

const N = Number(arg("n", 30));                       // samples PER STRATUM
const SEED0 = Number(arg("seed", 20260916));
const OUT = path.resolve(HERE, arg("out", "out/pilot"));
const MAX_ATTEMPTS = Number(arg("max-attempts", 40)) * N;
const EXPORT_STEPS = has("export-steps");
const REJECT = (arg("reject", "") || "").split(",").filter(Boolean);
const VERIFY = has("verify");
const VERIFY_BUDGET = Number(arg("verify-budget", 200000));
// both unset by default -- see the coupling-cap note in fold-engine.mjs
const COUPLING_CAP = arg("coupling-cap", null) ? Number(arg("coupling-cap")) : undefined;
const COUPLING_FRAC = arg("coupling-frac", null) ? Number(arg("coupling-frac")) : undefined;

const strata = arg("strata", null)
    ? JSON.parse(fs.readFileSync(arg("strata"), "utf8"))
    : DEFAULT_STRATA;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "samples"), { recursive: true });

let solve = null;
if (VERIFY) ({ solve } = await import("../probe-c/stage2.mjs"));

const manifest = [], rejects = {}, seen = new Map();
let seed = SEED0;

console.log(`synthetic Pureland corpus -> ${path.relative(process.cwd(), OUT)}`);
console.log(`strata: ${strata.map(s => `${s.name}[${s.min}-${s.max}]`).join("  ")}   n=${N} each\n`);

for (const st of strata) {
    let made = 0, attempts = 0;
    while (made < N && attempts < MAX_ATTEMPTS) {
        attempts++;
        const s = seed++;
        const steps = st.min + Math.floor(rngFrom(s ^ 0x9e3779b9)() * (st.max - st.min + 1));
        // a stratum may carry its own cap, which is how the coupling axis becomes a CONTROLLED
        // variable rather than an observed one -- see strata-3x3.json
        const r = build(s, steps, { reject: REJECT, snapshots: EXPORT_STEPS,
                                    couplingCap: st.coupling_cap ?? COUPLING_CAP,
                                    couplingFrac: st.coupling_frac ?? COUPLING_FRAC });
        if (r.reject) { rejects[r.reject.split(":")[0]] = (rejects[r.reject.split(":")[0]] || 0) + 1; continue; }
        if (seen.has(r.hash)) { rejects["duplicate CP (isomorphic)"] = (rejects["duplicate CP (isomorphic)"] || 0) + 1; continue; }
        seen.set(r.hash, true);

        const id = `${st.name}-${String(made + 1).padStart(4, "0")}`;
        const dir = path.join(OUT, "samples", id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "cp.fold"), JSON.stringify(r.fold));
        fs.writeFileSync(path.join(dir, "seq.json"), JSON.stringify({
            id, seed: s, steps: r.run.seq.length, folds: r.run.seq }, null, 1));

        if (EXPORT_STEPS) {
            fs.mkdirSync(path.join(dir, "steps"), { recursive: true });
            r.run.states.forEach((st_, k) => fs.writeFileSync(
                path.join(dir, "steps", `step-${String(k).padStart(2, "0")}.fold`),
                JSON.stringify(foldedState(st_))));
        }

        let verdict = null;
        if (VERIFY) {
            const t0 = Date.now();
            let v; try { v = solve(r.fold, { maxQueries: VERIFY_BUDGET, maxDepth: 24 }); }
            catch (e) { v = { status: "ERROR", queries: 0, depth: 0, err: e.message }; }
            verdict = { ...v, ms: Date.now() - t0 };
        }

        const meta = { id, stratum: st.name, seed: s, requested_steps: steps,
                       cp_hash: r.hash, metrics: r.metrics, planarize: r.plStats,
                       pure_search: verdict };
        fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 1));
        manifest.push(meta);
        made++;
        process.stdout.write(`\r  ${st.name}: ${made}/${N}   (${attempts} attempts)      `);
    }
    console.log(made < N ? `\r  ${st.name}: ${made}/${N}  <-- QUOTA NOT FILLED in ${attempts} attempts` 
                         : `\r  ${st.name}: ${made}/${N}   (${attempts} attempts)      `);
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(
    { generated: new Date().toISOString(), seed0: SEED0, strata, n_per_stratum: N,
      reject_filters: REJECT, coupling_cap: COUPLING_CAP ?? null,
      coupling_frac: COUPLING_FRAC ?? null, verified: VERIFY, samples: manifest }, null, 1));

/* ---------- the distribution report: this is what the cut points get chosen from -------- */
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const col = (f) => manifest.map(m => f(m.metrics));
const line = (name, xs) => `| ${name} | ${q(xs,0)} | ${q(xs,.1)} | ${q(xs,.5)} | ${q(xs,.9)} | ${q(xs,1)} |`;

let rep = `# Synthetic Pureland corpus -- pilot batch\n\n`;
rep += `${manifest.length} samples, seed0 ${SEED0}, generated ${new Date().toISOString().slice(0,10)}.\n`;
rep += `coupling cap: ${COUPLING_CAP ?? "none"}   coupling frac: ${COUPLING_FRAC ?? "none"}   `;
rep += `reject filters: ${REJECT.length ? REJECT.join(",") : "none"}\n\n`;
rep += `> Read this before fixing any cut point. Both the coupling strata and the degeneracy\n`;
rep += `> filters are deliberately unset in this batch -- the numbers below are what they are\n`;
rep += `> supposed to be chosen from.\n\n## Distribution\n\n`;
rep += `| metric | min | p10 | p50 | p90 | max |\n| --- | --- | --- | --- | --- | --- |\n`;
rep += [
    line("steps", col(m => m.steps)),
    line("crease edges", col(m => m.crease_edges)),
    line("distinct crease lines", col(m => m.distinct_crease_lines)),
    line("**coupling max**", col(m => m.coupling_max)),
    line("**coupling mean**", col(m => m.coupling_mean)),
    line("coupling total", col(m => m.coupling_total)),
    line("layers final", col(m => m.layers_final)),
    line("vertices", col(m => m.vertices)),
    line("bbox area final", col(m => m.bbox_area_final)),
].join("\n");

rep += `\n\n## Per stratum\n\n| stratum | cap | n | steps p50 | coupling max p50 | crease edges p50 | degenerate |\n| --- | --- | --- | --- | --- | --- | --- |\n`;
for (const st of strata) {
    const g = manifest.filter(m => m.stratum === st.name);
    const cap = st.coupling_cap ?? COUPLING_CAP ?? (st.coupling_frac ?? COUPLING_FRAC ? `x${st.coupling_frac ?? COUPLING_FRAC}` : "none");
    if (!g.length) { rep += `| ${st.name} | ${cap} | 0 | - | - | - | - |\n`; continue; }
    rep += `| ${st.name} | ${cap} | ${g.length} | ${q(g.map(m=>m.metrics.steps),.5)} | ${q(g.map(m=>m.metrics.coupling_max),.5)} | ${q(g.map(m=>m.metrics.crease_edges),.5)} | ${g.filter(m=>m.metrics.degenerate).length} |\n`;
}

rep += `\n## Degeneracy flags (recorded, not filtered)\n\n| flag | n | share |\n| --- | --- | --- |\n`;
for (const f of ["repeated_halving", "no_coupling", "collapsed", "single_angle"]) {
    const n = manifest.filter(m => m.metrics.flags[f]).length;
    rep += `| ${f} | ${n} | ${manifest.length ? (100*n/manifest.length).toFixed(1) : 0}% |\n`;
}

rep += `\n## Rejected during sampling\n\n| reason | n |\n| --- | --- |\n`;
for (const [k, v] of Object.entries(rejects).sort((a,b)=>b[1]-a[1])) rep += `| ${k} | ${v} |\n`;

if (VERIFY) {
    rep += `\n## Pure search over the corpus (budget ${VERIFY_BUDGET} queries)\n\n`;
    rep += `The corpus does not depend on this -- every sample is ground truth by construction.\n`;
    rep += `This only labels the subset the pure-search baseline curve can be drawn on.\n\n`;
    rep += `| stratum | SOLVED | TIMEOUT | EXHAUSTED | other |\n| --- | --- | --- | --- | --- |\n`;
    for (const st of strata) {
        const g = manifest.filter(m => m.stratum === st.name);
        const c = (s) => g.filter(m => m.pure_search?.status === s).length;
        rep += `| ${st.name} | ${c("SOLVED")} | ${c("TIMEOUT")} | ${c("EXHAUSTED")} | ${g.length - c("SOLVED") - c("TIMEOUT") - c("EXHAUSTED")} |\n`;
    }
    const sv = manifest.filter(m => m.pure_search?.status === "SOLVED");
    if (sv.length) {
        rep += `\nqueries to solve: p10=${q(sv.map(m=>m.pure_search.queries),.1)} `;
        rep += `p50=${q(sv.map(m=>m.pure_search.queries),.5)} `;
        rep += `p90=${q(sv.map(m=>m.pure_search.queries),.9)}\n`;
        rep += `\ndeepest SOLVED sample: ${Math.max(...sv.map(m=>m.metrics.steps))} steps `;
        rep += `-- anything past this is where pure search stops being a usable baseline.\n`;
    }
    rep += `\n⚠️ EXHAUSTED on a sample we folded ourselves would be a SOLVER BUG, not a finding.\n`;
}

fs.writeFileSync(path.join(OUT, "report.md"), rep);
console.log(`\n${manifest.length} samples, ${Object.values(rejects).reduce((a,b)=>a+b,0)} rejected`);
console.log(`report  -> ${path.relative(process.cwd(), path.join(OUT, "report.md"))}`);
