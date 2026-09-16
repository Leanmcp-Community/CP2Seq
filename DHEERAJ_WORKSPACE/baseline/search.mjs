// CP -> folding sequence: the three uninformed search baselines (DFS, BFS, IDDFS).
//
// WHAT THE PROBLEM ACTUALLY IS
// ----------------------------
// Given a crease pattern, find an ordered list of all-layers simple folds that, applied to the
// flat square, produces exactly that CP. This is a SEARCH OVER SEQUENCES, and it runs FORWARD
// from the square -- not backward from a folded state. The CP is the goal test, not the input
// to a peeling procedure. (There is no stored folded state to peel from: the instagram corpus
// is CP-only, and the median CP there has 256 distinct valid terminal states. See AUDIT.)
//
// WHY A FORWARD SEARCH IS TRACTABLE AT ALL: an all-layers simple fold carries the whole stack
// rigidly over one line, so it can never self-intersect and imposes no layer-ordering
// constraint. Foldability is purely geometric -- which lines, in which order.
//
// All of the geometry here is IMPORTED, not rewritten: buildTarget / applyFold / candidates /
// boundaryLoop come from workspace/probe-c/stage2.mjs, which is round-trip tested. Three
// geometry bugs were already found and fixed in that file the hard way; reimplementing them
// would be the single most likely way to produce confident wrong numbers. This module adds
// only the search strategies and the instrumentation.
//
// THE ONE STRUCTURAL CHANGE vs stage2: stage2 tracks crease coverage by mutating a `covered`
// flag on the target segments, which is correct for a single DFS path but impossible for BFS,
// where thousands of partial sequences are alive at once and each has its own coverage. Here
// coverage is a per-NODE set of segment indices. Same semantics, but it makes BFS expressible.
import {
    buildTarget, applyFold, candidates, boundaryLoop, ID,
} from "../../workspace/probe-c/stage2.mjs";
import { tolerantTarget } from "./tolerant.mjs";

class Budget extends Error { constructor() { super("BUDGET"); } }
class NodeCap extends Error { constructor() { super("NODECAP"); } }

/* ---------------------------------------------------------------- shared setup ---------- */

// Index every target crease segment so coverage can be a set of small integers.
//
// `opts.tolerance` swaps in the clustered target from tolerant.mjs, for corpora whose
// coordinates are stored at low precision (PurelandFold: 3 decimals). Off by default -- the
// instagram corpus is full precision and probe C's EXHAUSTED verdicts depend on exact keys.
export function prepare(fold, opts = {}) {
    const target = opts.tolerance ? tolerantTarget(fold, opts.tolerance) : buildTarget(fold);
    if (!target.total) return { err: "TRIVIAL" };
    let i = 0;
    for (const L of target.lines.values()) for (const s of L.want) s.idx = i++;

    const V = fold.vertices_coords, EV = fold.edges_vertices, EA = fold.edges_assignment;
    const bEdges = EA.map((a, k) => (a === "B" ? EV[k] : null)).filter(Boolean);
    const sheet = boundaryLoop(bEdges, V);
    if (!sheet) return { err: "NO_BOUNDARY" };

    return { target, start: [{ poly: sheet, T: ID, inv: ID, par: 0 }], total: target.total };
}

// A folded state's identity: each layer's centroid, vertex count, placement and parity.
// Order-independent (layers are a set, not a list), so the same stack keys the same way.
const stateSig = (st) => st.map((l) => {
    const r = (v) => Math.round(v * 1e6) / 1e6;
    let cx = 0, cy = 0;
    for (const p of l.poly) { cx += p[0]; cy += p[1]; }
    return `${r(cx / l.poly.length)},${r(cy / l.poly.length)},${l.poly.length},` +
           `${r(l.T.a)},${r(l.T.b)},${r(l.T.e)},${r(l.T.f)},${l.par}`;
}).sort().join("|");

// Two paths can reach the same geometry having creased different parts of the CP, so the
// dedup key is state AND coverage. Keying on state alone would prune a node that is not in
// fact equivalent -- cheaper, but it can lose solutions, and a search whose EXHAUSTED verdict
// means "proven unfoldable" cannot afford that.
const nodeKey = (node) =>
    stateSig(node.state) + "#" + [...node.cover].sort((a, b) => a - b).join(",");

// One QUERY = one simulated fold = one applyFold call. This is the unit probe-c budgeted in
// and the unit the query-efficiency claim is measured against, so it is counted here and
// nowhere else.
function expand(node, ctx) {
    const out = [];
    for (const line of candidates(node.state, ctx.target)) {
        for (const movePositive of [true, false]) {
            if (ctx.queries >= ctx.maxQueries) throw new Budget();
            ctx.queries++;
            const r = applyFold(node.state, line, movePositive, ctx.target);
            if (!r) continue;
            const cover = new Set(node.cover);
            for (const s of r.cover) cover.add(s.idx);
            out.push({
                state: r.state,
                cover,
                seq: node.seq.concat([{ line, movePositive }]),
                depth: node.depth + 1,
                gain: cover.size - node.cover.size,
            });
        }
    }
    // Try the folds that finish off the most creases first. Identical ordering in all three
    // searches, so any difference in the numbers is the search strategy and not the heuristic.
    out.sort((a, b) => b.gain - a.gain);
    return out;
}

const root = (start) => ({ state: start, cover: new Set(), seq: [], depth: 0, gain: 0 });
const solved = (node, ctx) => node.cover.size === ctx.total;

function newCtx(p, opts) {
    return {
        target: p.target, total: p.total,
        maxQueries: opts.maxQueries ?? 200000,
        maxDepth: opts.maxDepth ?? 32,
        maxNodes: opts.maxNodes ?? 2000000,
        queries: 0, expanded: 0, peak: 1, generated: 0,
    };
}
const report = (status, ctx, node) => ({
    status,
    queries: ctx.queries,
    expanded: ctx.expanded,
    generated: ctx.generated,
    peak: ctx.peak,
    steps: node ? node.seq.length : 0,
    seq: node ? node.seq.map((m) => ({ n: m.line.n, d: m.line.d, movePositive: m.movePositive })) : null,
});

/* ---------------------------------------------------------------- 1. plain DFS ----------- */
// Depth-first to the depth cap, first solution wins. The honest baseline: no optimality
// guarantee at all. On a CP that needs 4 folds this will happily return a 20-fold sequence
// that also produces it -- which is exactly why probe-c moved to iterative deepening, and
// why the optimality gap is reported as a column rather than hidden.
//
// Memory: O(depth) for the path, but the visited set is path-local (added on descent, removed
// on backtrack) exactly as in stage2, so peak memory is the recursion depth, not the tree.
export function dfs(fold, opts = {}) {
    const p = prepare(fold, opts);
    if (p.err) return { status: p.err, queries: 0, expanded: 0, generated: 0, peak: 0, steps: 0, seq: null };
    const ctx = newCtx(p, opts);
    const seen = new Set();
    let hitCap = false, found = null;

    function go(node) {
        if (solved(node, ctx)) { found = node; return true; }
        if (node.depth >= ctx.maxDepth) { hitCap = true; return false; }
        ctx.expanded++;
        const kids = expand(node, ctx);
        ctx.generated += kids.length;
        ctx.peak = Math.max(ctx.peak, node.depth + 1);
        for (const kid of kids) {
            const k = nodeKey(kid);
            if (seen.has(k)) continue;
            seen.add(k);
            if (go(kid)) return true;
            seen.delete(k);                       // path-local: this branch is abandoned
        }
        return false;
    }

    try {
        if (go(root(p.start))) return report("SOLVED", ctx, found);
        return report(hitCap ? "DEPTH_CAP" : "EXHAUSTED", ctx, null);
    } catch (e) {
        if (e instanceof Budget) return report("TIMEOUT", ctx, null);
        throw e;
    }
}

/* ---------------------------------------------------------------- 2. BFS ----------------- */
// Level-order, so the first solution found is a SHORTEST one -- guaranteed, unlike DFS.
// The price is the frontier: every node holds a full stack of layer polygons, and the
// branching factor is (number of target crease lines x 2 directions). `peak` is the real
// result here -- it is where BFS stops being usable on real CPs.
//
// Visited is GLOBAL, not path-local. That is the standard form of graph-search BFS and is what
// makes its shortest-path guarantee hold; it also means BFS and DFS are not doing identical
// bookkeeping. That asymmetry is inherent to the two algorithms, not a thumb on the scale.
export function bfs(fold, opts = {}) {
    const p = prepare(fold, opts);
    if (p.err) return { status: p.err, queries: 0, expanded: 0, generated: 0, peak: 0, steps: 0, seq: null };
    const ctx = newCtx(p, opts);

    const start = root(p.start);
    if (solved(start, ctx)) return report("SOLVED", ctx, start);

    let frontier = [start];
    const seen = new Set([nodeKey(start)]);
    let depth = 0;

    try {
        while (frontier.length) {
            if (depth >= ctx.maxDepth) return report("DEPTH_CAP", ctx, null);
            const next = [];
            for (const node of frontier) {
                ctx.expanded++;
                for (const kid of expand(node, ctx)) {
                    ctx.generated++;
                    const k = nodeKey(kid);
                    if (seen.has(k)) continue;
                    seen.add(k);
                    if (solved(kid, ctx)) return report("SOLVED", ctx, kid);
                    next.push(kid);
                    if (seen.size > ctx.maxNodes) throw new NodeCap();
                }
            }
            frontier = next;
            ctx.peak = Math.max(ctx.peak, frontier.length);
            depth++;
        }
        return report("EXHAUSTED", ctx, null);
    } catch (e) {
        if (e instanceof Budget) return report("TIMEOUT", ctx, null);
        if (e instanceof NodeCap) return report("MEMORY_CAP", ctx, null);
        throw e;
    }
}

/* ---------------------------------------------------------------- 3. IDDFS --------------- */
// Depth-limited DFS at limit 1, 2, 3, ... -- BFS's shortest-sequence guarantee at DFS's
// memory. This is the strategy probe-c/stage2.mjs settled on, reimplemented here on the
// per-node coverage representation so all three searches share one instrumented expand().
// run.mjs cross-checks it against stage2's own solve() on the two known-solvable CPs.
//
// `hitCap` is load-bearing: without it, a pass cut off by the depth limit is indistinguishable
// from a pass that closed the space, and "ran out of depth" would be reported as "proven
// unfoldable".
export function iddfs(fold, opts = {}) {
    const p = prepare(fold, opts);
    if (p.err) return { status: p.err, queries: 0, expanded: 0, generated: 0, peak: 0, steps: 0, seq: null };
    const ctx = newCtx(p, opts);
    let found = null, hitCap = false;
    const seen = new Set();

    function go(node, limit) {
        if (solved(node, ctx)) { found = node; return true; }
        if (node.depth >= limit) { hitCap = true; return false; }
        ctx.expanded++;
        const kids = expand(node, ctx);
        ctx.generated += kids.length;
        ctx.peak = Math.max(ctx.peak, node.depth + 1);
        for (const kid of kids) {
            const k = nodeKey(kid);
            if (seen.has(k)) continue;
            seen.add(k);
            if (go(kid, limit)) return true;
            seen.delete(k);
        }
        return false;
    }

    try {
        for (let limit = 1; limit <= ctx.maxDepth; limit++) {
            hitCap = false;
            seen.clear();
            if (go(root(p.start), limit)) return report("SOLVED", ctx, found);
            // No pass was cut short by the limit => the space is genuinely closed. Deepening
            // further cannot find anything, so stop and report the proof.
            if (!hitCap) return report("EXHAUSTED", ctx, null);
        }
        return report("DEPTH_CAP", ctx, null);
    } catch (e) {
        if (e instanceof Budget) return report("TIMEOUT", ctx, null);
        throw e;
    }
}

export const ALGOS = { dfs, bfs, iddfs };
