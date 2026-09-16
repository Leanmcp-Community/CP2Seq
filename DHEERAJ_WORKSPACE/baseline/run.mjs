// Harness for the CP -> sequence search baselines. Runs DFS / BFS / IDDFS over a dev set and
// reports the numbers side by side.
//
//   node DHEERAJ_WORKSPACE/baseline/run.mjs                      # mixed set, default budget
//   node DHEERAJ_WORKSPACE/baseline/run.mjs --set=synthetic      # one group only
//   node DHEERAJ_WORKSPACE/baseline/run.mjs --budget=1000000 --depth=20
//   node DHEERAJ_WORKSPACE/baseline/run.mjs --algos=bfs,iddfs
//
// THE DEV SET IS DELIBERATELY MIXED, and the reason is the whole story of this baseline:
//
//   instagram   10 real CPs. Probe C already searched all 195 viable ones and solved 2, so
//               these are expected to come back EXHAUSTED or TIMEOUT. That is a measurement of
//               the action space, not of the search -- it is reported, not hidden, but it
//               cannot tell DFS and BFS apart because both fail identically.
//   anchors      2 real CPs known to be solvable (probe C: 5,940 q / 4 steps and
//               256,480 q / 8 steps). These are the correctness check against real data.
//   synthetic   10 CPs built by folding a square forward with random simple folds and then
//               handing the CP back to the search. Solvable BY CONSTRUCTION with a KNOWN
//               sequence length, so this is the only group where "did it find the shortest
//               one" is answerable -- and therefore the only group that separates the three
//               searches.
import fs from "fs"; import path from "path";
import { ALGOS } from "./search.mjs";
import { generate } from "../../workspace/probe-c/selftest.mjs";
import { solve as stage2Solve } from "../../workspace/probe-c/stage2.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "../..");
const IG = process.env.INSTAGRAM_DIR || path.join(ROOT, "DHEERAJ_WORKSPACE/data/instagram");

const argv = Object.fromEntries(process.argv.slice(2).map((s) => {
    const i = s.indexOf("="); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));
const opts = {
    maxQueries: Number(argv["--budget"] ?? 400000),
    maxDepth: Number(argv["--depth"] ?? 16),
    maxNodes: Number(argv["--nodes"] ?? 300000),
};
const WHICH = String(argv["--set"] ?? "mixed");
const ALGO_NAMES = String(argv["--algos"] ?? "dfs,bfs,iddfs").split(",");

const rng = (seed) => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const readFold = (f) => JSON.parse(fs.readFileSync(path.join(IG, f), "utf8"));

/* ------------------------------------------------------------------ the dev set ---------- */

// The two CPs probe C proved solvable. Their recorded results double as a regression test.
const ANCHORS = [
    { f: "012_ku_4x4_Grid_Unassigned.fold", knownQueries: 5940, knownSteps: 4 },
    { f: "301_boxhard_Assigned_Crossover.fold", knownQueries: 256480, knownSteps: 8 },
];

// 10 real CPs: the smallest by face count among those stage 1 left IN_PLAY, minus the anchors.
// Smallest-first is the search's best case -- if it fails here it fails everywhere, so this is
// the most favourable honest sample rather than a random one.
function instagramSet() {
    const vp = path.join(ROOT, "workspace/probe-c/stage1-verdicts.json");
    if (!fs.existsSync(vp)) { console.error("missing stage1-verdicts.json"); process.exit(1); }
    const anchorNames = new Set(ANCHORS.map((a) => a.f));
    return JSON.parse(fs.readFileSync(vp, "utf8"))
        .filter((v) => v.stage1 === "IN_PLAY" && !anchorNames.has(v.f))
        .sort((a, b) => a.faces - b.faces)
        .slice(0, 10)
        .map((v) => ({ name: v.f.replace(/\.fold$/, ""), group: "instagram",
                       fold: readFold(v.f), truth: null, faces: v.faces }));
}

// Built by folding, so a sequence provably exists and its length is known. `seq.length` is the
// generator's own count -- it can be shorter than the requested step count, because a fold that
// would contradict an existing crease is skipped rather than emitted.
function syntheticSet(n = 10) {
    const out = [];
    for (let i = 1; out.length < n && i < 200; i++) {
        const rand = rng(i * 7919);
        const steps = 2 + Math.floor(rand() * 5);
        const g = generate(steps, rand);
        if (!g.nCreases) continue;
        out.push({ name: `synth_seed${i}_${g.seq.length}folds`, group: "synthetic",
                   fold: g.fold, truth: g.seq.length, faces: g.nCreases });
    }
    return out;
}

function anchorSet() {
    return ANCHORS.map((a) => ({ name: a.f.replace(/\.fold$/, ""), group: "anchor",
                                 fold: readFold(a.f), truth: a.knownSteps, faces: null }));
}

function devSet(which) {
    if (which === "instagram") return instagramSet();
    if (which === "synthetic") return syntheticSet();
    if (which === "anchors") return anchorSet();
    return [...syntheticSet(), ...anchorSet(), ...instagramSet()];
}

/* ------------------------------------------------------------------ gates ---------------- */

// GATE 1. The round trip. These CPs are built BY FOLDING, so anything but SOLVED is a solver
// bug, not a finding. Probe C's first run reported 155 "proven unfoldable" that were all wrong
// from three geometry bugs, and the numbers looked entirely plausible. Never trust a run that
// has not passed this first.
function gateRoundTrip() {
    let pass = 0, fail = [];
    for (let i = 1; i <= 12; i++) {
        const rand = rng(i * 7919);
        const g = generate(2 + Math.floor(rand() * 4), rand);
        if (!g.nCreases) continue;
        for (const a of ["dfs", "bfs", "iddfs"]) {
            const r = ALGOS[a](g.fold, { maxQueries: 300000, maxDepth: 12, maxNodes: 200000 });
            if (r.status === "SOLVED") pass++; else fail.push(`seed${i}/${a}=${r.status}`);
        }
    }
    return { pass, fail };
}

// GATE 2. This module reimplements coverage tracking (per-node sets instead of stage2's
// mutable flags) so BFS is expressible. That rewrite could silently change what the search
// explores. Check the new IDDFS against stage2's own solve() on the two anchors: same verdict,
// same sequence length. Query counts are allowed to differ -- the dedup key now includes
// coverage, which is a real algorithmic difference, not a discrepancy.
function gateAgreesWithStage2() {
    const rows = [];
    for (const a of ANCHORS) {
        const fold = readFold(a.f);
        const mine = ALGOS.iddfs(fold, { maxQueries: 2000000, maxDepth: 16, maxNodes: 500000 });
        const theirs = stage2Solve(fold, { maxQueries: 2000000, maxDepth: 16 });
        rows.push({
            f: a.f, mineStatus: mine.status, theirStatus: theirs.status,
            mineSteps: mine.steps, theirSteps: theirs.depth,
            mineQ: mine.queries, theirQ: theirs.queries,
            ok: mine.status === theirs.status && mine.steps === theirs.depth
                && mine.steps === a.knownSteps,
        });
    }
    return rows;
}

/* ------------------------------------------------------------------ run ------------------ */

const fmt = (n) => (n === null || n === undefined ? "-" : n.toLocaleString("en-US"));
const pad = (s, w) => String(s).padEnd(w);
const rpad = (s, w) => String(s).padStart(w);

console.log(`corpus: ${IG}`);
console.log(`budget: ${fmt(opts.maxQueries)} queries/instance · depth ${opts.maxDepth} · node cap ${fmt(opts.maxNodes)}\n`);

console.log("GATE 1 — round trip (built by folding, so anything but SOLVED is a bug)");
const g1 = gateRoundTrip();
console.log(`  ${g1.pass} solved, ${g1.fail.length} FAILED${g1.fail.length ? ": " + g1.fail.join(" ") : ""}`);
if (g1.fail.length) { console.error("\n  refusing to report numbers from a search that fails its own round trip."); process.exit(1); }

console.log("\nGATE 2 — new IDDFS vs probe-c/stage2.mjs solve() on the known-solvable CPs");
const g2 = gateAgreesWithStage2();
for (const r of g2) {
    console.log(`  ${pad(r.f.slice(0, 34), 35)} mine=${r.mineStatus}/${r.mineSteps}steps  ` +
                `stage2=${r.theirStatus}/${r.theirSteps}steps  ${r.ok ? "agree" : "*** DISAGREE ***"}`);
}
if (g2.some((r) => !r.ok)) { console.error("\n  refusing to report: the rewrite changed the answer."); process.exit(1); }

const set = devSet(WHICH);
console.log(`\n\ndev set "${WHICH}": ${set.length} instances\n`);

const header = `${pad("instance", 34)} ${pad("group", 10)} ${pad("algo", 6)} ${pad("status", 11)} ` +
               `${rpad("queries", 10)} ${rpad("expanded", 9)} ${rpad("peak", 8)} ${rpad("steps", 6)} ${rpad("opt", 5)}`;
console.log(header);
console.log("-".repeat(header.length));

const rows = [];
for (const inst of set) {
    for (const a of ALGO_NAMES) {
        const t0 = Date.now();
        let r;
        try { r = ALGOS[a](inst.fold, opts); }
        catch (e) { r = { status: "ERROR", queries: 0, expanded: 0, generated: 0, peak: 0, steps: 0, err: e.message }; }
        const ms = Date.now() - t0;
        // Optimality gap: only meaningful where the true shortest length is known, i.e. the
        // synthetic CPs (known by construction) and the anchors (IDDFS returns the shortest).
        const gap = r.status === "SOLVED" && inst.truth != null ? r.steps - inst.truth : null;
        const row = { instance: inst.name, group: inst.group, algo: a, ...r, ms,
                      truth: inst.truth, gap, seq: undefined };
        rows.push(row);
        console.log(`${pad(inst.name.slice(0, 33), 34)} ${pad(inst.group, 10)} ${pad(a, 6)} ` +
                    `${pad(r.status, 11)} ${rpad(fmt(r.queries), 10)} ${rpad(fmt(r.expanded), 9)} ` +
                    `${rpad(fmt(r.peak), 8)} ${rpad(r.steps || "-", 6)} ` +
                    `${rpad(gap === null ? "-" : (gap > 0 ? "+" + gap : gap), 5)}`);
    }
    console.log("");
}

/* ------------------------------------------------------------------ summary -------------- */

console.log("=".repeat(header.length));
console.log(`\nper algorithm, by group\n`);
console.log(`${pad("group", 11)} ${pad("algo", 6)} ${rpad("n", 3)} ${rpad("solved", 7)} ` +
            `${rpad("exhaust", 8)} ${rpad("timeout", 8)} ${rpad("memcap", 7)} ${rpad("med queries", 12)} ${rpad("med peak", 9)}`);
const med = (xs) => xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null;
for (const grp of [...new Set(set.map((s) => s.group))]) {
    for (const a of ALGO_NAMES) {
        const rs = rows.filter((r) => r.group === grp && r.algo === a);
        const c = (st) => rs.filter((r) => r.status === st).length;
        console.log(`${pad(grp, 11)} ${pad(a, 6)} ${rpad(rs.length, 3)} ${rpad(c("SOLVED"), 7)} ` +
                    `${rpad(c("EXHAUSTED"), 8)} ${rpad(c("TIMEOUT"), 8)} ${rpad(c("MEMORY_CAP"), 7)} ` +
                    `${rpad(fmt(med(rs.map((r) => r.queries))), 12)} ${rpad(fmt(med(rs.map((r) => r.peak))), 9)}`);
    }
    console.log("");
}

const optRows = rows.filter((r) => r.gap !== null);
if (optRows.length) {
    console.log("optimality — sequences found vs. the shortest that exists\n");
    for (const a of ALGO_NAMES) {
        const rs = optRows.filter((r) => r.algo === a);
        if (!rs.length) continue;
        const exact = rs.filter((r) => r.gap === 0).length;
        const worst = Math.max(...rs.map((r) => r.gap));
        console.log(`  ${pad(a, 6)} ${exact}/${rs.length} shortest` +
                    (worst > 0 ? `   worst overshoot +${worst} folds` : "   never overshot"));
    }
    console.log("");
}

const out = path.join(HERE, "results.json");
fs.writeFileSync(out, JSON.stringify({ opts, set: WHICH, gates: { roundTrip: g1, stage2: g2 }, rows }, null, 1));
console.log(`per-run rows -> DHEERAJ_WORKSPACE/baseline/results.json`);
