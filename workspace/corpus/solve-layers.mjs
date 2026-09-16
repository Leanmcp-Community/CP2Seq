// CP -> fold sequence search, SOME-LAYERS tier.
//
// This is what the tier was missing. Without it the some-layers corpus can be generated and
// looked at but not SCORED: no round-trip self-check, no pure-search query baseline, no pruning
// ground truth (notes/plan/corpus-plan.md, "两个已知天花板").
//
// ============================================================================================
// WHY THE ALL-LAYERS TRACTABILITY ARGUMENT DOES NOT CARRY OVER
// ============================================================================================
// probe-c/stage2.mjs opens by justifying a forward search from the flat square:
//
//     "An all-layers simple fold moves the entire stack rigidly across one infinite line, so
//      it can never self-intersect and imposes NO layer-ordering constraint. Foldability is
//      therefore a purely geometric question about which lines are folded and in which order,
//      with no combinatorial layer bookkeeping."
//
// Every one of those clauses fails here, and they fail in different ways, so they need
// different answers rather than one fix:
//
//   1. "can never self-intersect"  ->  it can, and the tier's engine forbids it BY
//      CONSTRUCTION rather than by a test: a moving run must be contiguous and taken from the
//      top (folded over) or the bottom (folded under). So self-intersection costs the search
//      nothing -- but it is a MODELLING RESTRICTION, and it is now part of what EXHAUSTED
//      means. See the asterisks at the bottom of this header.
//
//   2. "imposes no layer-ordering constraint"  ->  order is load-bearing. The state is an
//      ordered stack, not a set of layers, so stage 2's signature (per-layer descriptors,
//      SORTED, so order is thrown away) would merge states that are genuinely different and
//      report EXHAUSTED for CPs that are foldable. Answer: an ORDERED signature, which is
//      strictly weaker dedup -- and then two symmetries are taken back, below.
//
//   3. "purely geometric"  ->  it is not: tearing is a question about the sheet's CONNECTIVITY,
//      decidable only in original-sheet coordinates. fold-engine-layers.mjs already answers it;
//      this file does not re-derive it, it calls the engine and treats the engine as the sole
//      authority on what is physically legal. Two definitions of "legal" in one repo is how the
//      corpus and the solver end up disagreeing about the same fold.
//
//   4. The branching factor is no longer the number of target lines. A move is now
//      (line, moving side, SELECTION, over), and the selection ranges over 2(L-1)+2 runs, so
//      branching scales with the stack. The measured table (corpus-plan.md) says legal partial
//      folds overtake all-layers folds at sixteen layers and reach 418 at thirty-two-plus.
//
// ============================================================================================
// WHAT SURVIVES, AND WHAT IS NEW
// ============================================================================================
// SURVIVES -- and it is the load-bearing pruning, so it is worth being explicit that it still
// holds. A legal fold must create at least one crease (the engine refuses `no-crease`), and
// every crease it creates must already be in the target CP. Therefore the fold line, in the
// current plane, is the image of some TARGET crease line under some face's placement. So
// candidates are still generated as images of target lines -- stage2.candidates() is reused
// verbatim on our faces -- and the continuum of lines never has to be searched.
//
// /!\ The candidate lines come from the TARGET, never from generate-layers.mjs's four-normal
// grid. Inheriting the sampler's grid would make the solver able to find exactly the folds the
// sampler can build, which is the circularity the corpus plan already flags at a lower level.
//
// NEW 1: THE DIRECTION IS NO LONGER A BRANCH, AND IT PRUNES HARDER THAN IN STAGE 2.
// There, one fold had one unknown direction, discovered by reading the target and then checked
// for consistency across the creases the fold made. Here the engine hands back the M/V of every
// created crease, because parity is known and `over` is either chosen (all-layers) or FORCED by
// which end of the stack the run came from (partial). So each crease is checked against the
// target independently and a wrong direction kills the move immediately. This is a genuine
// compensation for the selection blowup, not a consolation prize.
//
// NEW 2: TURNING THE PAPER OVER IS FREE, AND THAT HALVES THE STATE SPACE.
// A person folding can flip the sheet on the table at any time, so a state and its turned-over
// twin must not be searched twice. Turning over reverses the stack, toggles every face's
// parity, and reflects the geometry. The reason it is SOUND to merge them is that the M/V a
// future fold writes is invariant under it:
//     a = ((par === 0) === over) ? "V" : "M"      [fold-engine-layers.mjs]
// and turning over sends par -> 1-par AND over -> !over, so (par===0)===over is unchanged.
// A turned-over state therefore writes exactly the same crease pattern.
//
// NEW 3: THE SIGNATURE IS FRAME-CANONICAL, WHICH STAGE 2'S IS NOT.
// Stage 2 keys on current-plane centroids, so the same configuration sitting somewhere else in
// the plane keys differently. That costs it nothing there; here the state space is bigger and
// every merge matters. Faces carry their polygon in ORIGINAL sheet coordinates already, and the
// only frame-dependent part is the placement T. Keying on RELATIVE placements
// inv(T_bottom) . T_i kills the global isometry: left-multiplying every T by the same G leaves
// every relative placement unchanged. So a configuration is recognised wherever it sits and
// whichever way up it is -- which buys back part of what the ordered signature gave away.
//
// ============================================================================================
// /!\ WHAT AN EXHAUSTED VERDICT MEANS HERE -- THREE ASTERISKS, NOT ONE
// ============================================================================================
//  (a) Inherited from stage 2: a fold is refused the moment it creases a line against the
//      assignment the target demands there, so EXHAUSTED means "no sequence exists that never
//      folds a crease against its final direction".
//  (b) NEW, and specific to this tier: the moving layers must be a contiguous run at the top or
//      the bottom of the stack. Middle runs, reverse folds and sinks are outside the model.
//      EXHAUSTED means "no such sequence of THOSE folds".
//  (c) NEW, and the one to keep an eye on: (b) is the same restriction generate-layers.mjs
//      samples under. corpus-plan.md already records the circular-argument risk for (a) --
//      generating with a restriction and then evaluating with a solver that assumes it. This
//      tier inherits that risk and adds a second instance of it. The honest reading: a
//      round-trip pass is a check that the solver and the engine agree, NOT evidence that the
//      restriction is the right model of origami.
//
//   node solve-layers.mjs <cp.fold> [--budget 200000] [--depth 16] [--layers 64]
import fs from "fs";
import path from "path";
import { buildTarget, candidates, demand, segCovered, boundaryLoop, lineOf, ID }
    from "../probe-c/stage2.mjs";
import { foldLayers } from "./fold-engine-layers.mjs";

const r6 = (v) => Math.round(v * 1e6) / 1e6;

/* ---------- state identity -------------------------------------------------------------- */
// One variant of the signature: faces listed in stack order, each as its ORIGINAL-sheet polygon
// (frame-independent by construction) plus its placement RELATIVE to the bottom face, plus
// parity. See NEW 3 in the header for why relative placements are the right key.
function sigVariant(st, order, flipPar) {
    const base = st.faces[order[0]];
    const B = base.inv;                                   // inv(T_bottom)
    const parts = [];
    for (const fi of order) {
        const f = st.faces[fi];
        // rel = inv(T_bottom) . T_i, written out rather than built with mul() to stay cheap:
        // this runs once per face per expanded node.
        const T = f.T;
        const a = B.a * T.a + B.b * T.c, b = B.a * T.b + B.b * T.d;
        const c = B.c * T.a + B.d * T.c, d = B.c * T.b + B.d * T.d;
        const e = B.a * T.e + B.b * T.f + B.e, g = B.c * T.e + B.d * T.f + B.f;
        const poly = f.poly.map(p => `${r6(p[0])} ${r6(p[1])}`).join(";");
        parts.push(`${poly}|${r6(a)},${r6(b)},${r6(c)},${r6(d)},${r6(e)},${r6(g)}|` +
                   `${flipPar ? 1 - f.par : f.par}`);
    }
    return parts.join("/");
}

// The canonical key: the smaller of the state and its turned-over twin. Turning over is free
// (NEW 2), so the two are the same node and must not be expanded twice.
const sig = (st) => {
    const up = sigVariant(st, st.order, false);
    const over = sigVariant(st, [...st.order].reverse(), true);
    return up < over ? up : over;
};

/* ---------- one candidate move, checked against the target ------------------------------- */
// Returns null when the fold is illegal -- either physically (the engine says so) or against
// the CP (it would crease paper the CP leaves flat, or crease it the wrong way).
function tryFold(st, line, movePositive, sel, over, target) {
    const r = foldLayers(st, line, movePositive, sel, over);
    if (r.error) return null;

    const cover = [];
    for (const { P, Q, a } of r.made) {
        const l = lineOf(P, Q);
        if (!l) continue;
        const t0 = l.dir[0] * P[0] + l.dir[1] * P[1];
        const t1 = l.dir[0] * Q[0] + l.dir[1] * Q[1];
        const got = demand(target, l, Math.min(t0, t1), Math.max(t0, t1));
        if (!got) return null;                            // not a crease of the CP at all
        // The engine already resolved this crease's direction from parity and over, so unlike
        // stage 2 there is nothing to infer and nothing to reconcile across the fold: a clash
        // with what the CP demands is fatal right here.
        if (got.want && got.want !== a) return null;
        cover.push(...got.touched);
    }
    if (!cover.length) return null;
    return { state: r.state, cover, moved: r.moved, over: r.over };
}

/* ---------- the search -------------------------------------------------------------------- */
/**
 * @param fold  a FOLD crease pattern
 * @param opts  { maxQueries, maxDepth, maxLayers, target }
 *
 * Verdicts, and they are deliberately not collapsed into each other:
 *   SOLVED      a sequence was found; `seq` replays it
 *   EXHAUSTED   the space was closed, subject to the three asterisks in the header
 *   TIMEOUT     query budget hit -- status unknown
 *   DEPTH_CAP   depth limit reached without closing
 *   LAYER_CAP   the stack cap cut branches off, so a failure is NOT a proof of anything
 */
export function solveLayers(fold, opts = {}) {
    const maxQueries = opts.maxQueries ?? 200000;
    const maxDepth   = opts.maxDepth   ?? 16;
    const maxLayers  = opts.maxLayers  ?? 64;
    const target = opts.target ?? buildTarget(fold);
    if (!target.total) return { status: "TRIVIAL", queries: 0, depth: 0, seq: [] };

    const V = fold.vertices_coords, EV = fold.edges_vertices, EA = fold.edges_assignment;
    const bEdges = EA.map((a, i) => a === "B" ? EV[i] : null).filter(Boolean);
    const sheet = boundaryLoop(bEdges, V);
    if (!sheet) return { status: "NO_BOUNDARY", queries: 0, depth: 0, seq: [] };

    // The flat sheet. initSheet() is not used because the paper is the CP's own boundary, which
    // need not be the unit square.
    const start = { faces: [{ poly: sheet, T: ID, inv: ID, par: 0 }], order: [0] };

    let queries = 0, best = 0, hitCap = false, hitLayers = false;
    const seq = [];
    const seen = new Set();

    const remaining = () => {
        let r = 0;
        for (const L of target.lines.values()) for (const s of L.want) if (!segCovered(s)) r++;
        return r;
    };

    // Every legal move at this state. One engine call = one QUERY, the same accounting stage 2
    // uses, so the two tiers' query counts are comparable -- that comparison is the point of
    // having a baseline at all.
    function expand(st) {
        const L = st.order.length;
        const out = [];
        const push = (line, mp, sel, over) => {
            if (queries >= maxQueries) throw new Error("BUDGET");
            queries++;
            const r = tryFold(st, line, mp, sel, over, target);
            if (!r) return;
            if (r.state.order.length > maxLayers) { hitLayers = true; return; }
            out.push({ line, mp, sel, over: r.over, r,
                       gain: r.cover.filter(c => !segCovered(c.seg)).length });
        };
        for (const line of candidates(st.faces, target)) {
            for (const mp of [true, false]) {
                // all-layers: both directions are real, distinct moves (opposite M/V)
                push(line, mp, { mode: "all" }, true);
                push(line, mp, { mode: "all" }, false);
                // partial: the direction is forced by which end the run is taken from, so it is
                // passed, not searched (fold-engine-layers.mjs refuses the other value)
                for (let k = 1; k < L; k++) {
                    push(line, mp, { mode: "top", k }, true);
                    push(line, mp, { mode: "bottom", k }, false);
                }
            }
        }
        // finish off the most creases first
        out.sort((a, b) => b.gain - a.gain);
        return out;
    }

    function dfs(st, depth, limit) {
        if (remaining() === 0) return true;
        if (depth >= limit) { hitCap = true; return false; }
        for (const m of expand(st)) {
            const k = sig(m.r.state);
            if (seen.has(k)) continue;
            seen.add(k);
            // interval-level coverage, shared with stage2 -- a fold that creases only part of a
            // demanded crease retires only that part. See segCovered() in stage2.mjs for what
            // the old boolean got wrong.
            for (const c of m.r.cover) c.seg.cov.push([c.lo, c.hi]);
            seq.push({ line: { n: m.line.n, d: m.line.d }, movePositive: m.mp,
                       selection: m.sel, over: m.over, layersMoved: m.r.moved });
            best = Math.max(best, depth + 1);
            if (dfs(m.r.state, depth + 1, limit)) return true;
            seq.pop();
            for (let i = m.r.cover.length - 1; i >= 0; i--) m.r.cover[i].seg.cov.pop();
            seen.delete(k);
        }
        return false;
    }

    // Iterative deepening, for the same reason stage 2 uses it: the query baseline has to be
    // measured against the SHORTEST sequence, or a 20-fold answer to a 5-fold CP makes the step
    // counts and the efficiency claim meaningless.
    //
    // /!\ It costs more here than it does there. Expanding a node is O(L) engine calls and each
    // call is O(L^2) in the tear check, so re-expansion on every deepening pass is the dominant
    // cost of this file. Left in because correctness of the baseline comes first; a
    // transposition table over `expand` is the obvious next move if the batch says it is needed.
    try {
        for (let limit = 1; limit <= maxDepth; limit++) {
            hitCap = false; hitLayers = false; seen.clear();
            if (dfs(start, 0, limit))
                return { status: "SOLVED", queries, depth: seq.length, seq: seq.slice() };
            if (!hitCap) {
                // Closed the space -- but only honestly so if no branch was cut by the layer
                // cap, otherwise this is a budget artefact wearing a proof's clothes.
                return { status: hitLayers ? "LAYER_CAP" : "EXHAUSTED", queries, depth: best };
            }
        }
        return { status: "DEPTH_CAP", queries, depth: maxDepth };
    } catch (e) {
        if (e.message === "BUDGET") return { status: "TIMEOUT", queries, depth: best };
        throw e;
    }
}

/* ---------- driver ------------------------------------------------------------------------ */
// basename, not endsWith: `test-solve-layers.mjs` ends with `solve-layers.mjs` too, so an endsWith test
// makes importing the test run this driver, which then reads an argument as a filename.
const IS_MAIN = process.argv[1] && path.basename(process.argv[1]) === "solve-layers.mjs";
if (IS_MAIN) {
    const argv = process.argv.slice(2);
    const file = argv.find(a => !a.startsWith("--"));
    const num = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : Number(argv[i + 1]); };
    if (!file) { console.error("usage: node solve-layers.mjs <cp.fold> [--budget N] [--depth N] [--layers N]"); process.exit(1); }
    const cp = JSON.parse(fs.readFileSync(file, "utf8"));
    const t0 = Date.now();
    const r = solveLayers(cp, { maxQueries: num("budget", 200000),
                                maxDepth: num("depth", 16),
                                maxLayers: num("layers", 64) });
    console.log(`${path.basename(file)}  ${r.status}  queries=${r.queries} steps=${r.depth} ${Date.now() - t0}ms`);
    for (const [i, s] of (r.seq ?? []).entries())
        console.log(`  ${String(i + 1).padStart(2)}. n=[${s.line.n.map(v => v.toFixed(3))}] d=${s.line.d.toFixed(3)}` +
                    ` ${s.movePositive ? "+" : "-"} ${s.selection.mode}${s.selection.k ?? ""}` +
                    ` ${s.over ? "over" : "under"} moved=${s.layersMoved}`);
}
