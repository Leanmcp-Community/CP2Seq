// A tolerant target for CPs stored at low coordinate precision.
//
// THE PROBLEM, concretely (walrus, PurelandFold, final keyframe):
//   the main diagonal is creased end to end, all mountain, as six collinear fragments
//     (0,0)-(.25,.25) (.25,.25)-(.346,.346) (.346,.346)-(.5,.5)
//     (.5,.5)-(.654,.654) (.654,.654)-(.75,.75) (.75,.75)-(1,1)
//   Their normals come out at -45.0002, -45.0000 and -44.9999 degrees -- they differ by about
//   5e-6 radians, because the vertices are stored rounded to 3 decimals. stage2's lkey() rounds
//   normals at 1e-6, so those six fragments land in SIX different line buckets.
//
//   The search then sees six stubs of length <= 0.476 instead of one crease of length 1.414,
//   and every candidate fold is refused with "the chord extends past the CP's creases on this
//   line". It reports EXHAUSTED, which reads exactly like "proven not foldable" but is really
//   "the coordinates were rounded".
//
// WHY NOT JUST MOVE THE VERTICES: tried first (see git history). Re-fitting lines and snapping
// each vertex to the least-squares meet of the lines through it leaves a residual around 1e-6 --
// the vertex is a compromise between several lines -- which is exactly the scale lkey rounds at.
// Repairing the data cannot reliably beat the key.
//
// WHAT THIS DOES INSTEAD: leaves the geometry alone and makes the LOOKUP tolerant. buildTarget
// returns { lines: Map, total }; `lines` is only ever used as `.get(lkey(line))` by demand() and
// `.values()` by candidates(). So cluster the exact buckets into real lines and hand back an
// object with those two methods, where get() resolves a key to the nearest cluster within
// tolerance. applyFold / candidates / the searches are all untouched and never learn about it.
//
// This is opt-in per corpus. The instagram corpus is stored at full precision and must keep
// using the exact target -- probe C's EXHAUSTED verdicts depend on it.
import { buildTarget } from "../../workspace/probe-c/stage2.mjs";

const parseKey = (k) => k.split(",").map(Number);

/**
 * @param fold  a FOLD object
 * @param tol   how far apart two fragments may sit and still be one line. 4e-3 comfortably
 *              covers 3-decimal rounding while staying far below the distance between
 *              genuinely distinct parallel creases (0.354 on walrus).
 */
export function tolerantTarget(fold, tol = 4e-3) {
    const exact = buildTarget(fold);

    // ---- cluster the exact buckets into lines ---------------------------------------------
    const clusters = [];                       // { line, want[] }
    for (const [, bucket] of exact.lines) {
        const [nx, ny] = bucket.line.n, d = bucket.line.d;
        let hit = null;
        for (const C of clusters) {
            const [cx, cy] = C.line.n;
            // normals are already sign-canonicalised by lineOf, so a plain difference is the
            // angular distance to first order; no wrap handling needed.
            if (Math.abs(cx - nx) > tol || Math.abs(cy - ny) > tol) continue;
            if (Math.abs(C.line.d - d) > tol) continue;
            hit = C; break;
        }
        if (!hit) { clusters.push({ line: bucket.line, want: bucket.want.slice() }); continue; }

        // Merge. buildTarget measured each bucket's intervals along ITS OWN dir; the cluster
        // may run the other way, so re-project rather than concatenating blindly -- otherwise
        // half the creases land mirrored and read as a contradiction later.
        const flip = hit.line.dir[0] * bucket.line.dir[0] + hit.line.dir[1] * bucket.line.dir[1] < 0;
        for (const s of bucket.want) {
            hit.want.push(flip ? { ...s, lo: -s.hi, hi: -s.lo } : { ...s });
        }
    }

    // ---- expose the Map surface demand() and candidates() actually use --------------------
    const lines = {
        get(key) {
            const [nx, ny, d] = parseKey(key);
            let best = null, bestErr = Infinity;
            for (const C of clusters) {
                const [cx, cy] = C.line.n;
                const dn = Math.abs(cx - nx) + Math.abs(cy - ny);
                if (dn > tol) continue;
                const dd = Math.abs(C.line.d - d);
                if (dd > tol) continue;
                if (dn + dd < bestErr) { bestErr = dn + dd; best = C; }
            }
            return best || undefined;
        },
        values() { return clusters; },
        get size() { return clusters.length; },
    };

    return { lines, total: exact.total, exactLines: exact.lines.size, clusters: clusters.length };
}

/** Longest contiguous creased run on any line, and how many lines there are. */
export function spanReport(target) {
    let longest = 0, contiguous = 0;
    for (const C of target.lines.values()) {
        const iv = C.want.map((s) => [s.lo, s.hi]).sort((a, b) => a[0] - b[0]);
        let lo = iv[0][0], hi = iv[0][1], run = 0;
        for (const [a, b] of iv) {
            if (a <= hi + 1e-4) hi = Math.max(hi, b);
            else { run = Math.max(run, hi - lo); lo = a; hi = b; }
        }
        run = Math.max(run, hi - lo);
        longest = Math.max(longest, run);
        if (run > 0.99) contiguous++;
    }
    return { lines: target.lines.size, longestRun: longest, spanningLines: contiguous };
}
