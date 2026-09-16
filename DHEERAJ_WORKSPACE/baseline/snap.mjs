// Repair a CP whose coordinates were stored at low precision, so that creases which are
// geometrically collinear are recognised as lying on ONE line.
//
// WHY THIS IS NEEDED
// ------------------
// PurelandFold stores vertices rounded to 3 decimals: 0.414 for 0.41421356..., 0.586 for
// 0.58578643.... A crease made by a single fold gets subdivided by later folds into several
// collinear edges, and after rounding each fragment yields a slightly different (normal,
// offset). The search's line key rounds at 1e-6, so the fragments land in different buckets
// and a crease that physically spans the whole sheet looks like a handful of unrelated stubs.
//
// The search then rejects almost every fold with "the chord extends past the CP's creases on
// this line", and reports EXHAUSTED -- which reads exactly like a proof that the CP is not
// foldable, when it is really a proof that the coordinates were rounded.
//
// Measured on walrus (34 creases): exact grouping gives 33 lines, longest span 0.476. Correct
// grouping gives 19 lines, longest span 1.414 -- the full diagonal, i.e. the first fold.
//
// THE REPAIR, in three steps:
//   1. cluster edges whose (normal, offset) agree within tol into lines
//   2. fit each cluster a single line by total least squares over its endpoints
//   3. move each vertex to the least-squares intersection of the lines through it
//
// Step 3 is what keeps the mesh intact: projecting each edge separately would tear shared
// vertices apart. A vertex on one line is projected onto it; a vertex where lines meet is
// placed to minimise squared distance to all of them at once.
//
// This only ever moves a vertex by about the rounding error that created the problem. It is a
// repair, not a remodelling -- and the report it returns says exactly how far anything moved.

const TAU = Math.PI * 2;

function edgeLine(p, q) {
    let dx = q[0] - p[0], dy = q[1] - p[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-12) return null;
    dx /= L; dy /= L;
    let nx = -dy, ny = dx;
    // canonical sense: a line and its opposite normal are the same line
    if (nx < -1e-12 || (Math.abs(nx) <= 1e-12 && ny < 0)) { nx = -nx; ny = -ny; }
    return { nx, ny, d: nx * p[0] + ny * p[1], theta: Math.atan2(ny, nx) };
}

/**
 * @param fold  a FOLD object (mutated copy is returned, input untouched)
 * @param tol   how far apart two fragments may be and still count as one line
 */
export function snapCollinear(fold, tol = 4e-3) {
    const V = fold.vertices_coords.map((p) => [p[0], p[1]]);
    const EV = fold.edges_vertices;

    // ---- 1. cluster edges into lines --------------------------------------------------
    const clusters = [];                                   // {theta, d, edges:[i]}
    const edgeCluster = new Array(EV.length).fill(-1);
    for (let i = 0; i < EV.length; i++) {
        const l = edgeLine(V[EV[i][0]], V[EV[i][1]]);
        if (!l) continue;
        let best = -1, bestErr = Infinity;
        for (let c = 0; c < clusters.length; c++) {
            const C = clusters[c];
            // angular distance on the half-turn: normals are canonicalised, but a near-axis
            // line can still sit either side of the wrap, so compare modulo pi.
            let da = Math.abs(l.theta - C.theta) % TAU;
            da = Math.min(da, TAU - da, Math.abs(da - Math.PI));
            if (da > tol * 2) continue;
            const dd = Math.abs(l.d - C.d);
            const err = da + dd;
            if (dd <= tol && err < bestErr) { bestErr = err; best = c; }
        }
        if (best < 0) { clusters.push({ theta: l.theta, d: l.d, edges: [i] }); edgeCluster[i] = clusters.length - 1; }
        else { clusters[best].edges.push(i); edgeCluster[i] = best; }
    }

    // ---- 2. fit each cluster one line, by total least squares over its endpoints -------
    const fitted = clusters.map((C) => {
        const pts = [];
        for (const e of C.edges) { pts.push(V[EV[e][0]], V[EV[e][1]]); }
        let mx = 0, my = 0;
        for (const p of pts) { mx += p[0]; my += p[1]; }
        mx /= pts.length; my /= pts.length;
        let sxx = 0, sxy = 0, syy = 0;
        for (const p of pts) {
            const dx = p[0] - mx, dy = p[1] - my;
            sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
        }
        // principal direction = eigenvector of the scatter matrix for the LARGER eigenvalue
        const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        let nx = -Math.sin(th), ny = Math.cos(th);
        if (nx < -1e-12 || (Math.abs(nx) <= 1e-12 && ny < 0)) { nx = -nx; ny = -ny; }
        return { nx, ny, d: nx * mx + ny * my };
    });

    // ---- 3. move each vertex to the least-squares meet of its lines --------------------
    const onLines = V.map(() => new Set());
    for (let i = 0; i < EV.length; i++) {
        if (edgeCluster[i] < 0) continue;
        onLines[EV[i][0]].add(edgeCluster[i]);
        onLines[EV[i][1]].add(edgeCluster[i]);
    }

    let moved = 0, maxMove = 0;
    const out = V.map((p, vi) => {
        const ls = [...onLines[vi]];
        if (!ls.length) return p;
        // normal equations: (sum n n^T) x = sum d n
        let a = 0, b = 0, c = 0, e = 0, f = 0;
        for (const li of ls) {
            const L = fitted[li];
            a += L.nx * L.nx; b += L.nx * L.ny; c += L.ny * L.ny;
            e += L.d * L.nx;  f += L.d * L.ny;
        }
        const det = a * c - b * b;
        let np;
        if (Math.abs(det) > 1e-10) {
            np = [(e * c - f * b) / det, (a * f - b * e) / det];
        } else {
            // every line through this vertex is parallel: just project onto the first
            const L = fitted[ls[0]];
            const s = L.nx * p[0] + L.ny * p[1] - L.d;
            np = [p[0] - s * L.nx, p[1] - s * L.ny];
        }
        const dist = Math.hypot(np[0] - p[0], np[1] - p[1]);
        if (dist > 1e-9) moved++;
        maxMove = Math.max(maxMove, dist);
        return np;
    });

    return {
        fold: { ...fold, vertices_coords: out },
        report: { clusters: clusters.length, edges: EV.length, moved, maxMove },
    };
}

/** How many distinct lines do the M/V creases occupy, keyed exactly as the search keys them? */
export function lineCount(fold) {
    const V = fold.vertices_coords, EV = fold.edges_vertices, EA = fold.edges_assignment;
    const seen = new Map();
    for (let i = 0; i < EV.length; i++) {
        if (EA[i] !== "M" && EA[i] !== "V" && EA[i] !== "U") continue;
        const l = edgeLine(V[EV[i][0]], V[EV[i][1]]);
        if (!l) continue;
        const r = (v) => Math.round(v / 1e-6) * 1e-6;
        const k = `${r(l.nx)},${r(l.ny)},${r(l.d)}`;
        const dir = [-l.ny, l.nx];
        const t0 = dir[0] * V[EV[i][0]][0] + dir[1] * V[EV[i][0]][1];
        const t1 = dir[0] * V[EV[i][1]][0] + dir[1] * V[EV[i][1]][1];
        if (!seen.has(k)) seen.set(k, [Infinity, -Infinity]);
        const s = seen.get(k);
        s[0] = Math.min(s[0], t0, t1);
        s[1] = Math.max(s[1], t0, t1);
    }
    let longest = 0;
    for (const s of seen.values()) longest = Math.max(longest, s[1] - s[0]);
    return { lines: seen.size, longestSpan: longest };
}
