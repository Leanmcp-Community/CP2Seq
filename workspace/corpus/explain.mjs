// A worked example: what ONE QUERY is, and what the search spends them on.
//
// The cost curve says a five-fold pattern takes a median of 4,002 simulated folds in the
// all-layers tier and 99,016 in the some-layers tier. Those numbers are meaningless to a reader
// who does not know what a query IS, and "one simulated fold" does not convey why there are
// thousands of them for a five-fold answer. This prints the answer to that, for one instance:
// at every step along the solution path, how many candidate folds were evaluated, why each was
// refused, and which one was taken.
//
// WHAT A QUERY IS, stated once here because the whole figure depends on it: the search proposes
// a fold, SIMULATES it against the current stack of paper, and reads off the creases it would
// make. That simulation is the query. It is the unit both tiers count, so the two are comparable
// (stage2.mjs, solve-layers.mjs), and it is the unit a learned method's tool calls are measured
// against.
//
// /!\ THE TWO TIERS GIVE DIFFERENT DETAIL, and the asymmetry is in the engines rather than here.
// The some-layers engine names its refusals -- would-tear, no-crease, nothing-to-move,
// direction-impossible -- so its breakdown is by cause. The all-layers engine returns a bare
// null, so its candidates can only be split into legal and refused. Reported as it is rather
// than padded to look symmetric.
//
// /!\ THIS IS THE SOLUTION PATH, NOT THE SEARCH TREE. It shows the branching the search faced at
// each state it kept, which is what a reader needs to understand the cost. It does NOT show the
// backtracking, and the total here is therefore a LOWER bound on the queries the search actually
// spent -- the real figure is printed beside it so the gap is visible.
//
//   node explain.mjs --tier some [--seed N] [--steps 4] [--partial 0.5]
//   node explain.mjs --tier all  [--seed N] [--steps 4]
//   node explain.mjs --file path/to/cp.fold --tier all
import fs from "fs";
import { solve, candidates, buildTarget, applyFold, demand, lineOf, boundaryLoop, ID }
    from "../probe-c/stage2.mjs";
import { solveLayers } from "./solve-layers.mjs";
import { foldLayers, currentPolys } from "./fold-engine-layers.mjs";
import { sample } from "./generate-layers.mjs";
import { build } from "./generate.mjs";
import { tolerantTarget } from "../tools/tolerant.mjs";

const argv = process.argv.slice(2);
const str = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const num = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : Number(argv[i + 1]); };

const TIER = str("tier", "some");
const SEED = num("seed", 20268835);
const STEPS = num("steps", 4);
const PARTIAL = num("partial", 0.5);
const FILE = str("file", null);

const pad = (v, n) => String(v).padStart(n);

/* ---------- get an instance ------------------------------------------------------------- */
let cp, provenance;
if (FILE) {
    cp = JSON.parse(fs.readFileSync(FILE, "utf8"));
    provenance = FILE;
} else if (TIER === "some") {
    const s = sample(SEED, PARTIAL, STEPS);
    if (!s.ok) { console.error(`sampler stalled at step ${s.stalledAt}`); process.exit(1); }
    cp = s.pl.fold;
    provenance = `generate-layers.mjs seed ${SEED}, ${STEPS} folds, p(partial)=${PARTIAL}`;
} else {
    const r = build(SEED, STEPS, { reject: [], snapshots: false });
    if (r.reject) { console.error(`sampler rejected: ${r.reject}`); process.exit(1); }
    cp = r.fold;
    provenance = `generate.mjs seed ${SEED}, ${STEPS} folds`;
}

const creaseCount = cp.edges_assignment.filter(a => a === "M" || a === "V").length;
console.log(`WORKED EXAMPLE -- ${TIER === "some" ? "some-layers" : "all-layers"} tier`);
console.log(`instance: ${provenance}`);
console.log(`target crease pattern: ${creaseCount} creases on ${cp.vertices_coords.length} vertices\n`);
console.log(`A QUERY is one proposed fold, simulated against the current stack of paper, with`);
console.log(`the creases it would make read off and checked against the target pattern.\n`);

// Would every crease this fold makes be a crease the target pattern already has, with the
// direction it demands? This is the second half of a query.
function creasesTarget(made) {
    for (const { P, Q, a } of made) {
        const l = lineOf(P, Q);
        if (!l) continue;
        const t0 = l.dir[0] * P[0] + l.dir[1] * P[1];
        const t1 = l.dir[0] * Q[0] + l.dir[1] * Q[1];
        const got = demand(target, l, Math.min(t0, t1), Math.max(t0, t1));
        if (!got) return false;
        if (got.want && got.want !== a) return false;
    }
    return true;
}

/* ---------- solve, then walk the answer -------------------------------------------------- */
const target = tolerantTarget(cp);
const solver = TIER === "some" ? solveLayers : solve;
const res = solver(cp, { maxQueries: 5000000, maxDepth: STEPS + 2, maxLayers: 4096, target });
if (res.status !== "SOLVED") {
    console.error(`solver returned ${res.status} after ${res.queries} queries -- pick another instance`);
    process.exit(1);
}
console.log(`The search found a ${res.depth}-fold answer and spent ${res.queries.toLocaleString()} queries doing it.`);
console.log(`Below is what it faced at each state ALONG THAT ANSWER; the difference between the`);
console.log(`two totals is the backtracking, which is where most of the cost lives.\n`);

const bEdges = cp.edges_assignment.map((a, i) => a === "B" ? cp.edges_vertices[i] : null).filter(Boolean);
const sheet = boundaryLoop(bEdges, cp.vertices_coords);

let onPath = 0;

if (TIER === "some") {
    let st = { faces: [{ poly: sheet, T: ID, inv: ID, par: 0 }], order: [0] };
    console.log(`${"step".padEnd(5)} ${"layers".padStart(6)} ${"candidates".padStart(11)} ` +
                `${"legal".padStart(6)} ${"tear".padStart(6)} ${"no-crease".padStart(10)} ` +
                `${"off-target".padStart(11)}  the fold taken`);
    for (const [i, mv] of res.seq.entries()) {
        const L = st.order.length;
        let tried = 0, legal = 0, tear = 0, noCrease = 0, offTarget = 0;
        for (const line of candidates(st.faces, target)) {
            for (const mp of [true, false]) {
                const sels = [[{ mode: "all" }, true], [{ mode: "all" }, false]];
                for (let k = 1; k < L; k++) {
                    sels.push([{ mode: "top", k }, true]);
                    sels.push([{ mode: "bottom", k }, false]);
                }
                for (const [sel, over] of sels) {
                    tried++;
                    const r = foldLayers(st, line, mp, sel, over);
                    if (r.error === "would-tear") { tear++; continue; }
                    if (r.error === "no-crease" || r.error === "nothing-to-move") { noCrease++; continue; }
                    if (r.error) { offTarget++; continue; }
                    // Physically legal is only half a query. The other half is the target check:
                    // every crease this fold would make has to already be in the pattern, at the
                    // right place and with the direction the pattern demands. Counting the two
                    // halves separately is the point of the figure -- the first is about paper,
                    // the second is about this particular target.
                    if (creasesTarget(r.made)) legal++; else offTarget++;
                }
            }
        }
        const what = `${mv.selection.mode}${mv.selection.k ?? ""} ${mv.over ? "over" : "under"}, ` +
                     `moved ${mv.layersMoved} layer${mv.layersMoved === 1 ? "" : "s"}`;
        console.log(`${String(i + 1).padEnd(5)} ${pad(L, 6)} ${pad(tried, 11)} ${pad(legal, 6)} ` +
                    `${pad(tear, 6)} ${pad(noCrease, 10)} ${pad(offTarget, 11)}  ${what}`);
        onPath += tried;
        const r = foldLayers(st, mv.line, mv.movePositive, mv.selection, mv.over);
        if (r.error) { console.error(`  replay failed at step ${i + 1}: ${r.error}`); process.exit(1); }
        st = r.state;
    }
    console.log(`\nfinal state: ${st.order.length} layers, ${currentPolys(st).length} faces`);
    console.log(`\nThe columns say where the queries go, and it is not where one would guess.`);
    console.log(`"no-crease" dominates: the proposed line misses the selected layers, or moves`);
    console.log(`them without creasing anything, which for one sheet of paper means tearing them`);
    console.log(`free. "tear" is the refusal that cannot occur in the all-layers tier at all --`);
    console.log(`the moving layers are joined to the stationary ones off the fold line, so the`);
    console.log(`sheet would come apart -- and it grows with the stack, which is the some-layers`);
    console.log(`tier's cost showing up as a column.`);
} else {
    let state = [{ poly: sheet, T: ID, inv: ID, par: 0 }];
    console.log(`${"step".padEnd(5)} ${"layers".padStart(6)} ${"candidates".padStart(11)} ` +
                `${"legal".padStart(6)} ${"refused".padStart(8)}  the fold taken`);
    for (const [i, mv] of res.seq.entries()) {
        let tried = 0, legal = 0;
        for (const line of candidates(state, target)) {
            for (const mp of [true, false]) {
                tried++;
                if (applyFold(state, line, mp, target)) legal++;
            }
        }
        console.log(`${String(i + 1).padEnd(5)} ${pad(state.length, 6)} ${pad(tried, 11)} ` +
                    `${pad(legal, 6)} ${pad(tried - legal, 8)}  ` +
                    `fold ${mv.movePositive ? "+" : "-"} across n=[${mv.line.n.map(v => v.toFixed(3))}] d=${mv.line.d.toFixed(3)}`);
        onPath += tried;
        const r = applyFold(state, mv.line, mv.movePositive, target);
        if (!r) { console.error(`  replay failed at step ${i + 1}`); process.exit(1); }
        state = r.state;
    }
    console.log(`\nfinal state: ${state.length} layers`);
    console.log(`\nThe all-layers engine returns a bare refusal, so "refused" cannot be broken`);
    console.log(`down by cause here. Nearly all of it is one cause: the fold would crease a line`);
    console.log(`the target pattern leaves flat, or crease it against the direction the pattern`);
    console.log(`demands. Tearing is not among the causes -- it cannot happen in this tier.`);
}

console.log(`\nqueries on the solution path: ${onPath.toLocaleString()}`);
console.log(`queries the search actually spent: ${res.queries.toLocaleString()}` +
            `  (${(res.queries / onPath).toFixed(1)}x -- the rest is backtracking)`);
