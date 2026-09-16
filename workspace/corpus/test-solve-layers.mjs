// The round-trip gate for the some-layers solver.
//
// This is the check that turns the tier from "generatable and inspectable" into "scorable", and
// it is the same standard PR #13 set for the all-layers tier: crease sets EQUAL, not merely
// overlapping, and the SEQUENCE replayed rather than its length trusted.
//
// THE GATE. Sample a sequence with the corpus sampler, planarise it into a CP, hand the solver
// nothing but that CP, and then:
//   1. it must not return EXHAUSTED -- a CP built by folding is foldable, so a closed search is
//      a solver bug, and it is the one failure mode that would silently corrupt every downstream
//      number
//   2. its answer must be no longer than the sequence that built the CP (it searches by
//      iterative deepening, so it returns the shortest, which may be SHORTER -- that is a pass,
//      and worth recording rather than flagging)
//   3. replaying its sequence through the engine must reproduce the CP edge for edge
//
// /!\ WHAT A PASS DOES NOT PROVE. The sampler and the solver fold under the same restriction
// (contiguous run at the top or bottom of the stack). A pass says they agree; it says nothing
// about whether that restriction is the right model of origami. That asterisk is recorded in
// solve-layers.mjs's header and in notes/plan/corpus-plan.md, and it is not discharged here.
//
//   node test-solve-layers.mjs [--n 8] [--steps 4] [--partial 0.5] [--seed N] [--budget N]
import { sample } from "./generate-layers.mjs";
import { solveLayers } from "./solve-layers.mjs";
import { foldLayers } from "./fold-engine-layers.mjs";
import { planarize } from "./planarize.mjs";
import { boundaryLoop, ID } from "../probe-c/stage2.mjs";

const arg = (k, d) => {
    const i = process.argv.indexOf(`--${k}`);
    return i < 0 ? d : Number(process.argv[i + 1]);
};
const N = arg("n", 8), STEPS = arg("steps", 4), SEED = arg("seed", 20260916);
const PARTIAL = arg("partial", 0.5), BUDGET = arg("budget", 200000);

// A CP as a comparable set of creases: rounded endpoints, unordered within an edge, with the
// assignment. Boundary edges are dropped -- they are the paper, not the folding.
//
// /!\ ROUND BEFORE ORDERING THE ENDPOINTS, not after. Ordering on raw coordinates and rounding
// only on the way out makes two endpoints that agree to 1e-6 but differ in the last bit sort
// into opposite orders, so the same crease is written two ways and the comparison reports it as
// one missing and one extra. That is not a difference between the CPs, it is a difference
// between two float comparisons, and it cost a FAIL on a sequence that was perfectly correct.
//
// Zero-length edges are dropped and COUNTED rather than silently ignored: a crease of no length
// is not a crease, but it is also not supposed to exist, so it is reported alongside the verdict.
function creaseSet(fold) {
    const r = (v) => Math.round(v * 1e6) / 1e6;
    const out = [];
    let degenerate = 0;
    for (const [i, [u, w]] of fold.edges_vertices.entries()) {
        const a = fold.edges_assignment[i];
        if (a !== "M" && a !== "V") continue;
        const A = fold.vertices_coords[u].map(r), B = fold.vertices_coords[w].map(r);
        if (A[0] === B[0] && A[1] === B[1]) { degenerate++; continue; }
        const [p, q] = (A[0] < B[0] || (A[0] === B[0] && A[1] < B[1])) ? [A, B] : [B, A];
        out.push(`${p[0]},${p[1]},${q[0]},${q[1]},${a}`);
    }
    out.sort();
    out.degenerate = degenerate;
    return out;
}

// Replay a solver answer through the engine and planarise what it creases.
function replay(cp, seq) {
    const bEdges = cp.edges_assignment.map((a, i) => a === "B" ? cp.edges_vertices[i] : null)
                                      .filter(Boolean);
    const sheet = boundaryLoop(bEdges, cp.vertices_coords);
    if (!sheet) return { error: "no-boundary" };
    let st = { faces: [{ poly: sheet, T: ID, inv: ID, par: 0 }], order: [0] };
    const creases = [];
    for (const [i, s] of seq.entries()) {
        const r = foldLayers(st, s.line, s.movePositive, s.selection, s.over);
        if (r.error) return { error: `step ${i + 1}: ${r.error}` };
        creases.push(...r.made);
        st = r.state;
    }
    const segs = [
        ...sheet.map((p, i) => ({ P: p, Q: sheet[(i + 1) % sheet.length], assignment: "B" })),
        ...creases.map(c => ({ P: c.P, Q: c.Q, assignment: c.a })),
    ];
    return { fold: planarize(segs).fold };
}

let pass = 0, fail = 0, skipped = 0;
const shorter = [];
const queries = [];

console.log(`round trip: n=${N} steps=${STEPS} p(partial)=${PARTIAL} budget=${BUDGET}\n`);
for (let i = 0; i < N; i++) {
    const seed = SEED + i * 7919;
    const s = sample(seed, PARTIAL, STEPS);
    if (!s.ok) { skipped++; console.log(`  skip  seed ${seed}: sampler stalled at ${s.stalledAt}`); continue; }

    const want = creaseSet(s.pl.fold);
    const t0 = Date.now();
    const r = solveLayers(s.pl.fold, { maxQueries: BUDGET, maxDepth: STEPS, maxLayers: 64 });
    const ms = Date.now() - t0;
    const tag = `seed ${seed} (${STEPS} folds, ${s.partialUsed} partial, ${want.length} creases)`;

    if (r.status === "EXHAUSTED" || r.status === "LAYER_CAP" || r.status === "DEPTH_CAP") {
        // The one verdict that cannot be excused by budget: the CP was built by folding.
        fail++; console.log(`  FAIL  ${tag}: ${r.status} on a CP that was built by folding`);
        continue;
    }
    if (r.status !== "SOLVED") {
        // TIMEOUT is a budget statement, not a wrong answer. Reported, never counted as a pass.
        skipped++; console.log(`  time  ${tag}: ${r.status} after ${r.queries} queries`);
        continue;
    }

    const rep = replay(s.pl.fold, r.seq);
    if (rep.error) { fail++; console.log(`  FAIL  ${tag}: replay refused -- ${rep.error}`); continue; }
    const got = creaseSet(rep.fold);
    const same = got.length === want.length && got.every((x, k) => x === want[k]);
    if (!same) {
        fail++;
        console.log(`  FAIL  ${tag}: replayed CP differs (${got.length} creases vs ${want.length})`);
        if (got.degenerate || want.degenerate)
            console.log(`          zero-length edges dropped: ${got.degenerate} replayed, ${want.degenerate} original`);
        const missing = want.filter(x => !got.includes(x)).slice(0, 3);
        const extra = got.filter(x => !want.includes(x)).slice(0, 3);
        if (missing.length) console.log(`          missing: ${missing.join("  ")}`);
        if (extra.length) console.log(`          extra:   ${extra.join("  ")}`);
        continue;
    }
    if (r.depth > STEPS) {
        fail++; console.log(`  FAIL  ${tag}: ${r.depth} folds, longer than the ${STEPS} that built it`);
        continue;
    }
    if (r.depth < STEPS) shorter.push({ seed, found: r.depth });
    queries.push(r.queries);
    pass++;
    console.log(`  ok    ${tag}: ${r.depth} folds, ${r.queries} queries, ${ms}ms`);
}

const q = (p) => { const s = [...queries].sort((a, b) => a - b);
                   return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
console.log(`\n${pass} passed, ${fail} failed, ${skipped} not decided`);
if (queries.length)
    console.log(`queries to solve (the some-layers pure-search baseline): ` +
                `p10=${q(.1)} p50=${q(.5)} p90=${q(.9)} max=${q(1)}`);
if (shorter.length)
    console.log(`\n${shorter.length} CPs were solved in FEWER folds than built them ` +
                `(${shorter.slice(0, 5).map(s => `${s.seed}:${s.found}`).join(" ")}) -- ` +
                `expected from iterative deepening, and it is a statement about the CP, not a fault`);
process.exit(fail ? 1 : 0);
