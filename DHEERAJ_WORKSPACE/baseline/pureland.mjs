// DFS / BFS / IDDFS over PurelandFold's 27 sequences.
//
// This is the first time the CP -> sequence search meets data with a GROUND-TRUTH SEQUENCE.
// The instagram corpus is CP-only, so a solved instance there could only be checked for
// self-consistency. Here every CP comes with the number of keyframes the human actually took,
// so "did the search find a sequence" and "did it find THE sequence" are separate questions.
//
//   node DHEERAJ_WORKSPACE/baseline/pureland.mjs
//   node DHEERAJ_WORKSPACE/baseline/pureland.mjs --budget=2000000 --algos=dfs
//   node DHEERAJ_WORKSPACE/baseline/pureland.mjs --step=last      # or --step=all
//
// WHAT COUNTS AS THE TARGET: the final keyframe's cp.fold. Analysis of the corpus (see
// pureland/ANALYSIS.md) shows creases only ever accumulate across a sequence (27/27 monotone,
// zero vanishing segments), so the last state's CP contains every crease ever made -- which is
// exactly the assumption this forward search is built on.
//
// GROUND TRUTH IS AN UPPER BOUND, NOT AN EXACT TARGET. A keyframe is a photographed hand
// motion, and 34 of the 211 transitions in this corpus are the model being FLIPPED OVER rather
// than folded. So (keyframes - 1) over-counts the folds. A search returning fewer steps than
// the human is not necessarily wrong.
import fs from "fs"; import path from "path";
import { ALGOS } from "./search.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SEQ = process.env.PURELAND_DIR || path.join(HERE, "../data/pureland/seq");

const argv = Object.fromEntries(process.argv.slice(2).map((s) => {
    const i = s.indexOf("="); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));
const opts = {
    maxQueries: Number(argv["--budget"] ?? 400000),
    maxDepth: Number(argv["--depth"] ?? 24),
    maxNodes: Number(argv["--nodes"] ?? 300000),
    // PurelandFold stores coordinates at 3 decimals, which shatters each crease line into
    // fragments under an exact 1e-6 line key. See tolerant.mjs -- without this every run
    // reports EXHAUSTED for a reason that is about rounding, not about folding.
    tolerance: argv["--exact"] ? undefined : Number(argv["--tol"] ?? 4e-3),
};
const ALGO_NAMES = String(argv["--algos"] ?? "dfs,bfs,iddfs").split(",");

const fmt = (n) => (n === null || n === undefined ? "-" : n.toLocaleString("en-US"));
const pad = (s, w) => String(s).padEnd(w);
const rpad = (s, w) => String(s).padStart(w);

// PurelandFold stores coordinates rounded to 3 decimals (0.414 for 0.41421356...), which is
// coarser than the 1e-7 epsilon the geometry runs at. Rescale to the unit square so the
// absolute slack is at least consistent across sequences; nothing here can recover the lost
// precision, and that limitation is reported rather than papered over.
function loadFold(p) {
    const f = JSON.parse(fs.readFileSync(p, "utf8"));
    return {
        vertices_coords: f.vertices_coords,
        edges_vertices: f.edges_vertices,
        edges_assignment: f.edges_assignment,
        faces_vertices: f.faces_vertices,
    };
}

const seqs = fs.readdirSync(SEQ).filter((d) => fs.statSync(path.join(SEQ, d)).isDirectory()).sort();
console.log(`corpus: ${SEQ}  (${seqs.length} sequences)`);
console.log(`budget: ${fmt(opts.maxQueries)} queries · depth ${opts.maxDepth} · node cap ${fmt(opts.maxNodes)}\n`);

const header = `${pad("sequence", 20)} ${rpad("keyfr", 6)} ${rpad("creases", 8)} ${pad("algo", 6)} ` +
               `${pad("status", 11)} ${rpad("queries", 10)} ${rpad("peak", 7)} ${rpad("steps", 6)} ${rpad("vs gt", 6)}`;
console.log(header);
console.log("-".repeat(header.length));

const rows = [];
for (const name of seqs) {
    const files = fs.readdirSync(path.join(SEQ, name)).filter((f) => f.endsWith(".fold")).sort();
    const last = files[files.length - 1];
    const fold = loadFold(path.join(SEQ, name, last));
    const keyframes = files.length;
    const nCre = fold.edges_assignment.filter((a) => a === "M" || a === "V").length;

    for (const a of ALGO_NAMES) {
        const t0 = Date.now();
        let r;
        try { r = ALGOS[a](fold, opts); }
        catch (e) { r = { status: "ERROR", queries: 0, expanded: 0, peak: 0, steps: 0, err: e.message }; }
        const ms = Date.now() - t0;
        const gt = keyframes - 1;                        // upper bound: some keyframes are flips
        const vs = r.status === "SOLVED" ? r.steps - gt : null;
        rows.push({ sequence: name, keyframes, creases: nCre, algo: a, ...r, ms, gt, vs, seq: undefined });
        console.log(`${pad(name, 20)} ${rpad(keyframes, 6)} ${rpad(nCre, 8)} ${pad(a, 6)} ` +
                    `${pad(r.status, 11)} ${rpad(fmt(r.queries), 10)} ${rpad(fmt(r.peak), 7)} ` +
                    `${rpad(r.steps || "-", 6)} ${rpad(vs === null ? "-" : (vs > 0 ? "+" + vs : vs), 6)}`);
    }
    console.log("");
}

console.log("=".repeat(header.length));
console.log("\nsummary\n");
console.log(`${pad("algo", 6)} ${rpad("n", 3)} ${rpad("solved", 7)} ${rpad("exhaust", 8)} ` +
            `${rpad("timeout", 8)} ${rpad("memcap", 7)} ${rpad("other", 6)} ${rpad("med queries", 12)}`);
const med = (xs) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
for (const a of ALGO_NAMES) {
    const rs = rows.filter((r) => r.algo === a);
    const c = (st) => rs.filter((r) => r.status === st).length;
    const other = rs.length - c("SOLVED") - c("EXHAUSTED") - c("TIMEOUT") - c("MEMORY_CAP");
    console.log(`${pad(a, 6)} ${rpad(rs.length, 3)} ${rpad(c("SOLVED"), 7)} ${rpad(c("EXHAUSTED"), 8)} ` +
                `${rpad(c("TIMEOUT"), 8)} ${rpad(c("MEMORY_CAP"), 7)} ${rpad(other, 6)} ` +
                `${rpad(fmt(med(rs.map((r) => r.queries))), 12)}`);
}

const statuses = [...new Set(rows.map((r) => r.status))];
console.log(`\nstatuses seen: ${statuses.join(", ")}`);
const solved = rows.filter((r) => r.status === "SOLVED");
if (solved.length) {
    console.log(`\nsolved instances vs. human keyframe count:`);
    for (const r of solved) {
        console.log(`  ${pad(r.sequence, 20)} ${pad(r.algo, 6)} search=${r.steps} folds, ` +
                    `human=${r.gt} transitions (${r.vs > 0 ? "+" : ""}${r.vs})`);
    }
} else {
    console.log(`\nNOTHING SOLVED. That is the result, and the reason is in pureland/ANALYSIS.md:`);
    console.log(`  Pureland permits folding a SUBSET of the layers; this action space is`);
    console.log(`  all-layers simple folds only. They are different action spaces.`);
}

fs.writeFileSync(path.join(HERE, "pureland-results.json"),
                 JSON.stringify({ opts, rows }, null, 1));
console.log(`\nper-run rows -> DHEERAJ_WORKSPACE/baseline/pureland-results.json`);
