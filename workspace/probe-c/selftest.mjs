// Round-trip correctness test for the stage 2 search -- and the seed of the synthetic corpus.
//
// WHY THIS EXISTS: stage 2 returns EXHAUSTED ("proven not simple-foldable") for almost every
// real CP. That is either the finding or a bug, and the run itself cannot tell us which.
// So: generate a CP by ACTUALLY FOLDING it with random all-layers simple folds, then hand the
// result back to the search. A CP built this way is simple-foldable by construction, so
// anything but SOLVED is a bug in the solver -- no ground-truth dataset required.
//
// The generator is also exactly the synthetic-corpus method from notes/plan/corpus-plan.md (a):
// folding forward is trivial, recovering the sequence is the hard inverse problem.
import { solve, clip, chord, reflectT, ptOn, ap, mul, inv, ID, lineOf, lkey } from "./stage2.mjs";

const rng = (seed) => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// Angles and offsets are kept on a coarse grid on purpose: reflections compose, and float
// drift across a dozen folds would otherwise be mistaken for a geometry bug.
const ANGLES = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4];
const OFFSETS = [-0.5, -0.25, 0, 0.25, 0.5];

// do two crease segments lie on the same line, overlap, and disagree?
function conflicts(creases, m) {
    const lm = lineOf(m.P, m.Q);
    if (!lm) return false;
    const t = (p) => lm.dir[0] * p[0] + lm.dir[1] * p[1];
    const lo = Math.min(t(m.P), t(m.Q)), hi = Math.max(t(m.P), t(m.Q));
    for (const c of creases) {
        if (c.a === m.a) continue;
        const lc = lineOf(c.P, c.Q);
        if (!lc || lkey(lc) !== lkey(lm)) continue;
        const a = Math.min(t(c.P), t(c.Q)), b = Math.max(t(c.P), t(c.Q));
        if (Math.min(hi, b) - Math.max(lo, a) > 1e-7) return true;
    }
    return false;
}

export function generate(steps, rand) {
    let layers = [{ poly: [[0,0],[1,0],[1,1],[0,1]], T: ID, inv: ID, par: 0 }];
    const creases = [], seq = [];
    for (let s = 0, guard = 0; s < steps && guard < 200; s++, guard++) {
        let picked = null;
        for (let tries = 0; tries < 40 && !picked; tries++) {
            const th = ANGLES[Math.floor(rand() * ANGLES.length)];
            const dir = [Math.cos(th), Math.sin(th)];
            const n = [-dir[1], dir[0]];
            // anchor the line on a point of the current silhouette so it actually cuts
            const L = layers[Math.floor(rand() * layers.length)];
            const v = L.poly[Math.floor(rand() * L.poly.length)];
            const d = n[0] * v[0] + n[1] * v[1] + OFFSETS[Math.floor(rand() * OFFSETS.length)];
            const line = { n, d, dir };
            if (layers.some(l => clip(l.poly, n, d, true) && clip(l.poly, n, d, false))) picked = line;
        }
        if (!picked) break;
        const { n, d } = picked;
        const movePositive = rand() < 0.5;
        const dirOver = rand() < 0.5;
        const R = reflectT(n, d);

        // A crease folded one way and later folded back the other leaves ONE assignment in the
        // CP, not two. Emitting both is how the first version of this generator produced
        // self-contradictory CPs that no solver could ever satisfy -- which looked exactly like
        // a solver bug. Reject any fold that would contradict a crease already made.
        const made = [];
        for (const lay of layers) {
            if (!(clip(lay.poly, n, d, true) && clip(lay.poly, n, d, false))) continue;
            const c = chord(lay.poly, picked);
            if (!c) continue;
            made.push({ P: ap(lay.inv, ptOn(picked, c[0])), Q: ap(lay.inv, ptOn(picked, c[1])),
                        a: ((lay.par === 0) === dirOver) ? "V" : "M" });
        }
        if (made.some(m => conflicts(creases, m))) continue;   // try another line

        const next = [];
        for (const lay of layers) {
            const stay = clip(lay.poly, n, d, !movePositive);
            const move = clip(lay.poly, n, d, movePositive);
            // the half that stays is CLIPPED, not the layer it came from -- pushing the
            // original polygon back leaves every layer at full size, so a later fold creases
            // paper that is no longer there
            if (stay) next.push({ ...lay, poly: stay });
            if (move) { const T = mul(R, lay.T);
                next.push({ poly: move.map(p => ap(R, p)), T, inv: inv(T), par: 1 - lay.par }); }
        }
        creases.push(...made);
        seq.push({ line: picked, movePositive });
        layers = next;
    }
    // emit a FOLD file: the four borders plus every crease we actually made
    const verts = [[0,0],[1,0],[1,1],[0,1]];
    const EV = [[0,1],[1,2],[2,3],[3,0]], EA = ["B","B","B","B"];
    for (const c of creases) {
        verts.push(c.P, c.Q);
        EV.push([verts.length - 2, verts.length - 1]);
        EA.push(c.a);
    }
    return { fold: { vertices_coords: verts, edges_vertices: EV, edges_assignment: EA },
             nCreases: creases.length, seq };
}

const IS_MAIN = process.argv[1] && process.argv[1].endsWith("selftest.mjs");
if (IS_MAIN) {
const N = Number(process.argv[2] ?? 30);
const opts = { maxQueries: Number(process.argv[3] ?? 500000), maxDepth: 16 };
let pass = 0, fail = 0, skip = 0;
for (let i = 1; i <= N; i++) {
    const rand = rng(i * 7919);
    const steps = 2 + Math.floor(rand() * 5);
    const { fold, nCreases } = generate(steps, rand);
    if (!nCreases) { skip++; continue; }
    const r = solve(fold, opts);
    const ok = r.status === "SOLVED";
    if (ok) pass++; else fail++;
    console.log(`seed ${String(i).padStart(3)}  folds=${steps} creases=${String(nCreases).padStart(3)}  ` +
                `-> ${r.status.padEnd(10)} queries=${String(r.queries).padStart(7)} steps=${r.depth}` +
                (ok ? "" : "   <-- BUG: built by folding, so it IS foldable"));
}
console.log(`\n${pass} solved, ${fail} FAILED, ${skip} degenerate (no crease produced)`);
process.exit(fail ? 1 : 0);
}
