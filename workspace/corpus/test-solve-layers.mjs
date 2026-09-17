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
import { tolerantTarget } from "../../DHEERAJ_WORKSPACE/baseline/tolerant.mjs";

const arg = (k, d) => {
    const i = process.argv.indexOf(`--${k}`);
    return i < 0 ? d : Number(process.argv[i + 1]);
};
const N = arg("n", 8), STEPS = arg("steps", 4), SEED = arg("seed", 20260916);
const PARTIAL = arg("partial", 0.5), BUDGET = arg("budget", 200000);

import { creaseGeometry, pairsUp } from "./crease-compare.mjs";

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

    const want = creaseGeometry(s.pl.fold);
    const t0 = Date.now();
// /!\ THE TARGET LOOKUP MUST BE TOLERANT, AND THE REASON IS NOT "the data is noisy".
// Paper coordinates are DYADIC -- folding halves things, so intersections land on values like
// 0.1484375 = 19/128, exact in binary. lkey rounds on a DECIMAL 1e-6 grid, and 19/128 x 1e6 is
// 148437.5: exactly a rounding tie. Two computations of the same line then round in opposite
// directions, the line gets two keys, every fold is refused, and the search reports EXHAUSTED --
// a PROOF OF UNFOLDABILITY, on a crease pattern that was produced by folding. Measured on seed
// 20268835: 8 of its 58 coordinates sit on a tie; exact target EXHAUSTED in 10,800 queries,
// tolerant target SOLVED in 12,748.
//
// Using the opt-in injection point rather than loosening lkey, because that decision was already
// made and reverted once (3d4f350): a global tolerance cost a real verdict on the instagram
// corpus, whose EXHAUSTED results depend on exact matching. The repair belongs to the corpus.
// The deeper fix -- quantising on a BINARY grid, where dyadic coordinates cannot tie -- would
// remove the whole class, and it is not attempted here because it changes the shared key.
    const r = solveLayers(s.pl.fold, { maxQueries: BUDGET, maxDepth: STEPS, maxLayers: 64,
                                       target: tolerantTarget(s.pl.fold) });
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
    const got = creaseGeometry(rep.fold);
    // Compare with a TOLERANCE, not by string equality. Same root cause as above: 0.1484375
    // rounds to 0.148438 on one side and 0.148437 on the other, and the identical crease is
    // then reported as one missing plus one extra. The standard is still crease sets EQUAL --
    // same count, and every crease paired with one that agrees to 1e-6 on all four endpoints
    // and EXACTLY on M/V. Only the coordinate match is loosened.
    const same = got.length === want.length && pairsUp(got, want);
    if (!same) {
        fail++;
        console.log(`  FAIL  ${tag}: replayed CP differs (${got.length} creases vs ${want.length})`);
        if (got.degenerate || want.degenerate)
            console.log(`          zero-length edges dropped: ${got.degenerate} replayed, ${want.degenerate} original`);
        const missing = want.filter(x => !got.includes(x)).slice(0, 3);
        const extra = got.filter(x => !want.includes(x)).slice(0, 3);
        if (pairsUp.unmatched) console.log(`          unmatched by tolerance: ${pairsUp.unmatched}`);
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
