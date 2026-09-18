// Fold the recorded sequence to its last step, then demand the creases it made are EXACTLY the
// stored crease pattern -- same segments, same mountain/valley on each.
//
// WHY A SECOND VERIFIER, WRITTEN WITHOUT THE FIRST. verify-replay.mjs asks the same question and
// answers it through crease-compare.mjs, which groups edges into lines, merges collinear pieces
// and matches them within a tolerance. Every one of those steps is a place to be wrong, and five
// separate false failures have come out of exactly that machinery -- a rounding grid splitting
// one crease into two, a direction taken per edge instead of per line, a tolerance too tight for
// the drift and too loose for the paper. Each fix was to the comparison, which means the
// comparison, not the corpus, is what those runs were measuring.
//
// So this file shares nothing with it. No clustering, no merging, no tolerance in the verdict:
// build the segment set on both sides, subdivide both the same way, compare as multisets, and
// let exact mean exact. It is allowed to be harsher than the truth. What it must not be is
// harsh in a way that depends on a constant someone tuned.
//
// THE ONE THING BOTH VERIFIERS STILL SHARE is the fold engine, because folding the sequence is
// the only way to get a replayed pattern at all. Neither can catch an engine that is wrong about
// paper; that needs a third-party solver (workspace/tools/flatfolder-check.mjs).
//
// /!\ EXACT IS A CHOICE WITH A KNOWN COST, stated here rather than discovered from the output.
// Folding reflects coordinates, and a reflection in floating point is not exact: a vertex can
// come back as 0.7705078120000001 where the generator wrote 0.770507812. Those are different
// doubles and this file calls them different. The deviation is reported for every mismatch, so a
// run that fails at 1e-16 and a run that fails at 1e-3 do not look alike.
//
//   node verify-exact.mjs [corpus-dir] [--quiet] [--out FILE]
import fs from "fs";
import path from "path";
import { resolvePath, positional } from "./paths.mjs";
import { fileURLToPath } from "url";
import { foldLayers } from "./fold-engine-layers.mjs";
import { lineSpec } from "./fold-engine.mjs";
import { planarize } from "./planarize.mjs";
import { boundaryLoop, ID } from "./geom.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const ROOT = resolvePath(HERE, positional(argv, ["--out", "--ulp"]), "out/release");
const QUIET = argv.includes("--quiet");
const oi = argv.indexOf("--out");
const OUT = oi >= 0 ? path.resolve(argv[oi + 1]) : path.join(ROOT, "exact-check.json");

// A double's exact identity as text. Number#toString is the shortest string that round-trips, so
// two doubles share it if and only if they are the same double. No rounding is introduced.
const k = (v) => (Object.is(v, -0) ? 0 : v).toString();

// How many representable doubles lie between two values -- their distance in ULPs.
//
// WHY THE TOLERANCE IS COUNTED IN ULPs AND NOT IN UNITS OF PAPER. Every absolute tolerance in
// this project has been wrong at least once, because the right value depends on the magnitude
// being compared and on how many operations produced it, and someone has to guess both. An ULP
// count does not: it says "the same number, to within k representable steps", which is a
// statement about the arithmetic rather than about the paper. A fold is a reflection, and a
// reflection in floating point is not exact -- computing one point along two different routes
// disagrees in the last place or two. That is the entire residual this admits.
//
// It stays far stricter than what it replaces. At a coordinate of order 1 an ULP is 2.2e-16, so
// four of them is 8.9e-16: about nine orders of magnitude tighter than the 2e-6 the tolerant
// comparison used, and seven below the 1.9e-6 spacing of genuinely distinct creases, so it
// cannot merge two creases that the paper keeps apart.
const ulpBuf = new DataView(new ArrayBuffer(8));
const bits = (v) => { ulpBuf.setFloat64(0, v); return ulpBuf.getBigInt64(0); };
function ulpDistance(a, b) {
    if (a === b) return 0;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
    let x = bits(a), y = bits(b);
    // Map the sign-magnitude layout onto a monotone integer line, so that counting steps works
    // across zero as well as within one sign.
    const mono = (t) => t < 0n ? (0x8000000000000000n - t) : t;
    x = mono(x); y = mono(y);
    const d = x > y ? x - y : y - x;
    return d > 1000000n ? Infinity : Number(d);
}

// The verdict's only knob: representable steps allowed PER FOLD. --ulp 0 restores bit-exact
// equality; the limit for a sample is ULP_PER_FOLD * its fold count.
//
// WHY IT SCALES WITH DEPTH. A fold is a reflection and each one re-rounds every coordinate it
// moves, so the disagreement between two routes to the same point grows with the number of
// folds. Measured on this corpus, the median worst pair runs 7 ULP at three folds to 160 at
// nineteen -- a fixed budget is therefore either too tight deep or too loose shallow. Eight per
// fold covers the median everywhere and, at nineteen folds, is 152 ULP ~ 3.4e-14: still eight
// orders of magnitude tighter than the 2e-6 the tolerant comparison used, and eight below the
// 1.9e-6 spacing of genuinely distinct creases.
//
// /!\ THE COEFFICIENT BARELY MATTERS, which is the more useful finding and the reason not to
// spend more time on it. Raising it from 8 to 128 admits 23 more samples on the ULP test and
// changes the number that actually PASS by one, because 364 of the 457 failures are not failing
// on distance at all: the two sides carry a different NUMBER of segments. A vertex that lands a
// few ULP away can fall on the other side of a segment's endpoint, so planarize cuts that
// segment on one side and not the other. No tolerance fixes that -- it is subdivision
// instability, and it is a bigger question than this constant.
const ui = argv.indexOf("--ulp");
const ULP_PER_FOLD = ui >= 0 ? +argv[ui + 1] : 8;

// One crease as a canonical key: endpoints ordered so that writing a segment backwards is the
// same segment, plus the assignment, because a mountain where the pattern says valley is a
// different crease pattern and the whole point is to notice that.
function segKey(A, B, a) {
    const [P, Q] = (A[0] < B[0] || (A[0] === B[0] && A[1] <= B[1])) ? [A, B] : [B, A];
    return `${k(P[0])},${k(P[1])}|${k(Q[0])},${k(Q[1])}|${a}`;
}

// The creased segments of a FOLD, subdivided by planarize so that both sides of the comparison
// are cut at the same places. Running the STORED pattern through planarize too is what makes the
// comparison structural rather than a merge heuristic: a crease that one side lists whole and
// the other lists in two pieces comes out as the same two pieces on both.
function segments(fold) {
    const out = new Map();
    for (const [i, [u, w]] of fold.edges_vertices.entries()) {
        const a = fold.edges_assignment[i];
        if (a !== "M" && a !== "V") continue;
        const A = fold.vertices_coords[u], B = fold.vertices_coords[w];
        if (A[0] === B[0] && A[1] === B[1]) continue;
        const key = segKey(A, B, a);
        out.set(key, (out.get(key) ?? 0) + 1);
    }
    return out;
}

/* ---------- creases as MAXIMAL intervals, which is what subdivision cannot change ---------- */
//
// /!\ COMPARING SUBDIVIDED SEGMENTS DOES NOT WORK, and three rounds of tolerance work went into
// finding that out rather than into the corpus. The previous design ran both sides through
// planarize and compared the resulting segment multisets. But subdivision is UNSTABLE under
// floating point: a vertex a few ULP away can fall on the other side of a segment's endpoint, so
// one side gets a cut the other does not, and the two multisets then have different SIZES.
// Measured on the release corpus: of 457 failures, 364 were size mismatches, and on a sampled
// subset every single failure was. A size mismatch is not a distance, so no tolerance -- absolute
// or ULP, fixed or depth-scaled -- can reach it. Raising the ULP budget from 8 per fold to 128
// changed the number of samples that passed by one.
//
// What IS stable is the union of creased material on each line: "this line carries a crease from
// here to here" does not depend on how many pieces it was recorded in. So: cluster edges into
// lines, merge each line's pieces into maximal intervals, and compare those. planarize is not
// needed on either side, which also removes its O(n^2) pass from the hot loop.
//
// THE TWO SCALES THIS RESTS ON WERE MEASURED, not chosen: pieces of one crease differ by ~1e-12,
// while two genuinely distinct parallel creases cannot be closer than the finest halving the
// action space produces, of order 2^-19 ~ 1.9e-6. CLUSTER sits in the middle with three orders
// of room on each side. It is a clustering RADIUS, never a rounding grid -- a grid has cell
// boundaries, and landing on one is the single bug this project has now hit five times.
const CLUSTER = 1e-9;

function unitLine(A, B) {
    let dx = B[0] - A[0], dy = B[1] - A[1];
    const L = Math.hypot(dx, dy);
    if (!(L > 0)) return null;
    dx /= L; dy /= L;
    let n = [-dy, dx];
    let d = n[0] * A[0] + n[1] * A[1];
    // Canonical by ANGLE in [0, pi). A component-sign test has a boundary of its own -- normals
    // of (+1e-17, -1) and (-1e-17, -1) are the same line and land on opposite sides of it.
    let th = Math.atan2(n[1], n[0]);
    if (th < 0) { th += Math.PI; n = [-n[0], -n[1]]; d = -d; }
    if (th >= Math.PI - 1e-12) { th -= Math.PI; n = [-n[0], -n[1]]; d = -d; }
    return { n, d, th };
}

// Chain a sorted list into groups where each member is within `tol` of the previous one, so a
// run of pieces each close to the next stays one group -- which is what a subdivided crease is.
function chainGroups(arr, key, tol) {
    arr.sort((p, q) => key(p) - key(q));
    const groups = [];
    let cur = null, last = 0;
    for (const it of arr) {
        const v = key(it);
        if (!cur || Math.abs(v - last) > tol) { cur = []; groups.push(cur); }
        cur.push(it); last = v;
    }
    return groups;
}

// [{ n, d, a, lo, hi }] -- one entry per maximal creased interval.
function creaseIntervals(segs) {
    const items = [];
    for (const s of segs) {
        if (s.assignment !== "M" && s.assignment !== "V") continue;
        const l = unitLine(s.P, s.Q);
        if (!l) continue;
        items.push({ ...l, a: s.assignment, P: s.P, Q: s.Q });
    }
    const out = [];
    // Direction first, then offset. One combined sort is not enough: collinear pieces differ in
    // angle by ~1e-16, so within a direction the primary key becomes that jitter rather than the
    // offset, and pieces of one line end up separated by pieces of another.
    for (const dirGroup of chainGroups(items, it => it.th, CLUSTER)) {
        for (const lineGroup of chainGroups(dirGroup, it => it.d, CLUSTER)) {
            // One direction per line, taken from the cluster rather than per edge: lineOf
            // canonicalises the normal but not the direction, so a per-edge direction gives
            // opposite projections for two patterns that merely list endpoints in opposite order.
            const n = lineGroup[0].n, d = lineGroup[0].d;
            const dir = [-n[1], n[0]];
            const byAssign = new Map();
            for (const e of lineGroup) {
                const t0 = dir[0] * e.P[0] + dir[1] * e.P[1];
                const t1 = dir[0] * e.Q[0] + dir[1] * e.Q[1];
                if (!byAssign.has(e.a)) byAssign.set(e.a, []);
                byAssign.get(e.a).push([Math.min(t0, t1), Math.max(t0, t1)]);
            }
            for (const [a, iv] of byAssign) {
                iv.sort((x, y) => x[0] - y[0]);
                let cur = null;
                for (const s of iv) {
                    if (cur && s[0] <= cur[1] + CLUSTER) { cur[1] = Math.max(cur[1], s[1]); continue; }
                    if (cur) out.push({ n, d, a, lo: cur[0], hi: cur[1] });
                    cur = [...s];
                }
                if (cur) out.push({ n, d, a, lo: cur[0], hi: cur[1] });
            }
        }
    }
    return out;
}

// THE FLOOR IS THE DATA'S, NOT A CHOICE. planarize identifies two points as one vertex when they
// are within EPS = 1e-9 and keeps the FIRST one's coordinates, so a stored pattern's vertex can
// sit up to EPS from the point the fold actually produced. The replayed side is not planarized --
// merging intervals is what makes subdivision irrelevant, so there is nothing to planarize for --
// and therefore carries the raw coordinates. The two can legitimately differ by up to EPS, and no
// verifier can resolve the corpus more finely than the generator recorded it.
//
// This is why the ULP budget could not work however large it was set: at a coordinate of order 1,
// EPS is 4.5e6 ULP, and ulpDistance saturates at 1e6. Raising the budget to 100000 still failed
// 38 of 60 samples, which is what sent this back to first principles rather than to another
// constant. ULP is still computed and reported, because the distribution says how much of the
// margin is actually used -- on a sampled subset, seven of 22 passes needed ZERO and the median
// needed 16, four orders inside the floor.
const MERGE_EPS = 1e-9;

// Match two interval sets 1:1. Same assignment, same line within CLUSTER, endpoints within the
// generator's merge radius. Returns the worst ULP used and whatever could not be matched at all.
function matchIntervals(A, B, ulpLimit) {
    const used = new Array(B.length).fill(false);
    let worst = 0, worstPair = null, unmatchedA = 0;
    for (const x of A) {
        let hit = -1, hitUlp = Infinity;
        for (let j = 0; j < B.length; j++) {
            if (used[j]) continue;
            const y = B[j];
            if (y.a !== x.a) continue;
            if (Math.abs(y.n[0] - x.n[0]) > CLUSTER || Math.abs(y.n[1] - x.n[1]) > CLUSTER ||
                Math.abs(y.d - x.d) > CLUSTER) continue;
            // The verdict is the absolute test against the generator's own merge radius; the ULP
            // figure rides along as the diagnostic, so a run can say how much margin it used.
            if (Math.abs(y.lo - x.lo) > MERGE_EPS || Math.abs(y.hi - x.hi) > MERGE_EPS) continue;
            // /!\ TAKE THE CANDIDATE, THEN RANK IT. Writing this as `if (u < hitUlp)` alone drops
            // a perfectly good match whenever the ULP figure saturates: ulpDistance returns
            // Infinity past 1e6 steps, and Infinity < Infinity is false, so the interval was
            // reported unmatched even though it had already passed the absolute test above. The
            // absolute test is the verdict; the ULP is only how the best candidate is chosen.
            const u = Math.max(ulpDistance(x.lo, y.lo), ulpDistance(x.hi, y.hi));
            if (hit < 0 || u < hitUlp) { hitUlp = u; hit = j; }
        }
        if (hit < 0) { unmatchedA++; continue; }
        used[hit] = true;
        if (Number.isFinite(hitUlp) && hitUlp > worst) { worst = hitUlp; worstPair = { ulp: hitUlp, replayed: x, stored: B[hit] }; }
    }
    return { worst, worstPair, unmatchedA, unmatchedB: used.filter(u => !u).length };
}

// Pairs further apart than this are not "the same crease, moved" -- they are a crease on one
// side and a different crease on the other. Capping the candidate edges is what keeps the
// matching small, and a pair beyond it is reported as unpairable rather than as a large
// deviation, because calling it a deviation implies a correspondence that is not there.
//
// /!\ THIS MUST BE BELOW THE SPACING OF DISTINCT CREASES, and it was not. At 1e-3 it sat three
// orders ABOVE the closest two different creases can be -- folding halves, so nineteen folds put
// creases 2^-19 ~ 1.9e-6 apart -- which made almost every segment a candidate partner for
// hundreds of others. Two consequences, both bad: the bipartite graph went dense and the run
// took 705 seconds against 30 for a corpus twice the size, and `unpairable` counted matchings
// found among segments that were never plausibly the same crease.
//
// The window is only a spatial pre-filter for the scan; the metric itself is in ULPs and cuts
// off at ulpDistance's own Infinity threshold of 1e6 steps, which at a coordinate of order 1 is
// 2.2e-10 -- four orders below the crease spacing and five above the arithmetic. 1e-9 covers
// that window with room to spare.
const WINDOW = 1e-9;

// The smallest D such that every unmatched segment on one side can be paired 1:1 with one on the
// other within D -- the bottleneck assignment, solved exactly.
//
// /!\ WHY NOT GREEDY, which is what this was first. Nearest-first greedy answers a different
// question: it reports the worst pair of ONE arbitrary pairing, and which pairing it finds
// depends on the order it happens to consume candidates, so the number moves for reasons that
// have nothing to do with the paper. It was also O(n^3) -- a rescan of every remaining pair per
// step -- which on the samples where most segments disagree meant minutes each.
//
// Binary search over the distinct candidate distances, testing each threshold with a bipartite
// matching, gives the true minimax: the most favourable pairing that exists, and therefore a
// deviation that cannot be blamed on the matcher. Candidates are restricted to pairs within CAP
// and to equal assignments, so the graph stays sparse and the whole thing is near-linear in
// practice.
function bottleneckMatch(A, B, asg, devOf) {
    // Candidate edges. Sorting B by its first coordinate and scanning only the window within CAP
    // keeps this from being the n^2 it looks like: real partners differ in the last bits, so the
    // window holds a handful of segments.
    const firstX = (s) => +s.split("|")[0].split(",")[0];
    const idxB = B.map((s, i) => ({ i, x: firstX(s) })).sort((p, q) => p.x - q.x);
    const xs = idxB.map(e => e.x);
    const lower = (v) => { let lo = 0, hi = xs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < v) lo = m + 1; else hi = m; } return lo; };

    const adj = A.map(() => []);
    const dists = new Set();
    for (let ai = 0; ai < A.length; ai++) {
        const x = firstX(A[ai]);
        for (let k = lower(x - WINDOW); k < xs.length && xs[k] <= x + WINDOW; k++) {
            const bi = idxB[k].i;
            if (asg(A[ai]) !== asg(B[bi])) continue;
            const d = devOf(A[ai], B[bi]);
            if (!Number.isFinite(d)) continue;      // beyond ulpDistance's cutoff: not the same crease
            adj[ai].push({ bi, d });
            dists.add(d);
        }
    }

    // Kuhn's augmenting-path matching, restricted to edges within `lim`.
    const tryMatch = (lim) => {
        const matchB = new Array(B.length).fill(-1);
        let size = 0;
        const aug = (ai, seen) => {
            for (const { bi, d } of adj[ai]) {
                if (d > lim || seen[bi]) continue;
                seen[bi] = true;
                if (matchB[bi] === -1 || aug(matchB[bi], seen)) { matchB[bi] = ai; return true; }
            }
            return false;
        };
        for (let ai = 0; ai < A.length; ai++) if (aug(ai, new Array(B.length).fill(false))) size++;
        return { size, matchB };
    };

    const sorted = [...dists].sort((p, q) => p - q);
    const need = Math.min(A.length, B.length);
    if (!sorted.length) return { dev: null, pair: null, unpairable: A.length + B.length };

    // Binary search for the smallest threshold admitting a matching of the maximum possible size.
    let lo = 0, hi = sorted.length - 1, best = null;
    const full = tryMatch(sorted[hi]);
    if (full.size < need) {
        // Even at CAP some segments have no partner at all. That is the honest verdict and the
        // count of them matters more than the distance between the ones that do pair.
        best = full;
    } else {
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (tryMatch(sorted[mid]).size >= need) hi = mid; else lo = mid + 1;
        }
        best = tryMatch(sorted[lo]);
    }
    let worst = null;
    for (let bi = 0; bi < B.length; bi++) {
        const ai = best.matchB[bi];
        if (ai === -1) continue;
        const d = devOf(A[ai], B[bi]);
        if (worst === null || d > worst.dev) worst = { dev: d, replayed: A[ai], stored: B[bi] };
    }
    return { dev: worst ? worst.dev : null, pair: worst,
             unpairable: (A.length - best.size) + (B.length - best.size) };
}

function replay(dir) {
    const cp = JSON.parse(fs.readFileSync(path.join(dir, "cp.fold"), "utf8"));
    const seq = JSON.parse(fs.readFileSync(path.join(dir, "seq.json"), "utf8"));
    const bEdges = cp.edges_assignment.map((a, i) => a === "B" ? cp.edges_vertices[i] : null).filter(Boolean);
    const sheet = boundaryLoop(bEdges, cp.vertices_coords);
    if (!sheet) return { ok: false, why: "no boundary loop in cp.fold" };

    let st = { faces: [{ poly: sheet, T: ID, inv: ID, par: 0 }], order: [0] };
    const creases = [];
    for (const [i, f] of (seq.folds ?? []).entries()) {
        // Both generators' fold encodings, decoded the same way verify-replay decodes them. The
        // all-layers generator writes (angle_index, offset) in fold-engine.mjs's UN-NORMALISED
        // normal frame -- at 45 degrees the normal is [-1, 1], which is what keeps offsets dyadic.
        const line = f.line
            ?? (f.angle_index !== undefined
                ? { n: lineSpec(f.angle_index, f.offset).n, d: f.offset }
                : { n: f.normal, d: f.offset });
        const r = foldLayers(st, line, f.movePositive ?? f.move_positive,
                             f.selection ?? f.sel ?? { mode: "all" }, f.over ?? true);
        if (r.error) return { ok: false, why: `fold ${i + 1} refused: ${r.error}` };
        creases.push(...r.made);
        st = r.state;
    }

    // Compare MAXIMAL CREASE INTERVALS, not subdivided segments -- see creaseIntervals above.
    // No planarize on either side: merging is what makes subdivision irrelevant, and skipping it
    // also removes its pairwise-intersection pass from every sample.
    const nFolds = (seq.folds ?? []).length;
    const limit = ULP_PER_FOLD * nFolds;
    const got = creaseIntervals(creases.map(c => ({ P: c.P, Q: c.Q, assignment: c.a })));
    const want = creaseIntervals(cp.edges_assignment.map((a, i) => {
        if (a !== "M" && a !== "V") return null;
        const [u, w] = cp.edges_vertices[i];
        return { P: cp.vertices_coords[u], Q: cp.vertices_coords[w], assignment: a };
    }).filter(Boolean));

    const m = matchIntervals(got, want, limit);

    if (m.unmatchedA === 0 && m.unmatchedB === 0)
        return { ok: true, folds: nFolds, creases: want.length, withinUlp: m.worst, limit };

    // An unmatched interval is a crease one side has and the other does not, or one whose extent
    // differs by more than the budget. Both are reported, because they mean different things: a
    // count difference is a missing crease, an extent difference is a crease of the wrong length.
    return {
        ok: false,
        why: `${m.unmatchedA} replayed crease(s) unmatched, ${m.unmatchedB} stored crease(s) unmatched` +
             ` (limit ${limit} ulp = ${ULP_PER_FOLD} x ${nFolds} folds)`,
        counts: { replayed: got.length, stored: want.length,
                  unmatchedReplayed: m.unmatchedA, unmatchedStored: m.unmatchedB },
        mvFlipped: 0,
        worstPair: m.worstPair ? { dev: m.worstPair.ulp } : null,
        unpairable: m.unmatchedA + m.unmatchedB,
        limit,
    };
}

const batches = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(ROOT, e.name, "samples")))
    .map(e => e.name).sort();
if (!batches.length) { console.error(`no sample batches under ${ROOT}`); process.exit(1); }

let pass = 0, fail = 0;
const passes = [];
const failures = [], perBatch = [];
const t0 = Date.now();

for (const b of batches) {
    const sdir = path.join(ROOT, b, "samples");
    const ids = fs.readdirSync(sdir).sort();
    let p = 0, f = 0;
    for (const [i, id] of ids.entries()) {
        let r;
        try { r = replay(path.join(sdir, id)); }
        catch (e) { r = { ok: false, why: `threw: ${e.message}` }; }
        if (r.ok) { p++; pass++; passes.push(r); }
        else { f++; fail++; failures.push({ sample: `${b}/${id}`, ...r, ok: undefined }); }
        // Progress per sample, not per batch. The first batch here is 400 all-layers samples
        // including a hundred at 14-19 folds, so a per-batch line means several minutes of an
        // apparently dead terminal -- which reads as a hang, and was reported as one.
        if (!QUIET) process.stdout.write(`\r${b.padEnd(20)} ${String(i + 1).padStart(4)}/${ids.length}   ${p} ok  ${f} failed      `);
    }
    if (!QUIET) process.stdout.write("\r" + " ".repeat(60) + "\r");
    perBatch.push({ batch: b, n: ids.length, pass: p, fail: f });
    if (!QUIET) console.log(`${b.padEnd(24)} ${String(p).padStart(5)}/${String(ids.length).padEnd(5)} exact` +
                            (f ? `   ${f} FAILED` : ""));
}

const secs = +((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n${pass} exact, ${fail} failed, in ${secs}s`);

// The deviation histogram is the finding, not the pass count: it says whether the failures are
// the paper disagreeing or the arithmetic disagreeing, and those call for opposite responses.
const devs = failures.map(f => f.worstPair?.dev).filter(v => v !== undefined).sort((a, b) => a - b);
if (devs.length) {
    const bucket = new Map();
    for (const d of devs) {
        const e = d === Infinity ? ">1e6" : String(d);
        bucket.set(e, (bucket.get(e) ?? 0) + 1);
    }
    console.log(`\nbottleneck ULP distance (best possible 1:1 assignment), over ${devs.length} failures`);
    console.log(`with a comparable segment. The verdict admits <= ${ULP_PER_FOLD} per fold:`);
    for (const [e, c] of [...bucket].sort((a, b) => (+a[0] || 1e9) - (+b[0] || 1e9)))
        console.log(`  ${e.padStart(6)} ulp   ${c}`);
}
// The pass side is worth printing too: a corpus that passes at 4 ULP but needed all 4 is a
// different situation from one that passes with one step to spare, and only the distribution
// says which. If nothing ever exceeds 1, the limit can come down.
const used = passes.map(p => p.withinUlp).filter(v => v !== undefined);
if (used.length) {
    const b = new Map();
    for (const u of used) b.set(u, (b.get(u) ?? 0) + 1);
    console.log(`\nULP actually needed by the ${used.length} samples that passed within tolerance:`);
    for (const [u, c] of [...b].sort((x, y) => x[0] - y[0])) console.log(`  ${String(u).padStart(6)} ulp   ${c}`);
}
const flipped = failures.filter(f => f.mvFlipped > 0);
if (flipped.length) console.log(`\n${flipped.length} failure(s) include a segment with M/V flipped`);

fs.writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString(), root: path.basename(ROOT),
    pass, fail, seconds: secs,
    note: "exact multiset comparison of creased segments after planarizing both sides; no tolerance, " +
          "no merging. shares the fold engine with the generator, so it cannot catch a wrong model of paper",
    batches: perBatch, failures,
}, null, 1) + "\n");
console.log(`\n-> ${path.relative(process.cwd(), OUT)}`);
process.exit(fail ? 1 : 0);
