// Replay every SOLVED PurelandFold verdict and check it against the CP independently.
//
// WHY. check-anchor.mjs says 7 of the 27 real models are foldable in our action space.
// DHEERAJ_WORKSPACE/pureland/ANALYSIS.md §5 says 4. Ours is the number the docs adopt, so it
// had better be checked by something other than the search that produced it -- a SOLVED verdict
// reporting only its own success is worth very little, and this project has already published
// one confident number that turned out to be a float artefact.
//
// THE STANDARD is PR #13's, and it is the right one: replay every fold from the flat square,
// and require the crease sets to be EQUAL, not merely overlapping. Overlap is not enough --
// a sequence that creases a subset of the CP has not folded that CP.
//
// THE REPLAY USES A DIFFERENT ENGINE ON PURPOSE. fold-engine-layers.mjs was written separately,
// keeps its state in original-sheet coordinates rather than as independent layer polygons, and
// computes creases its own way. Two implementations agreeing is evidence; one implementation
// agreeing with itself is not.
//
// /!\ KNOWN LIMIT OF THIS HARNESS, stated because it is the reason one model comes back
// unconfirmed rather than failed: stage2 reads each fold's over/under direction off the target,
// and does not report it. This script recovers it by trying both and keeping the first whose
// creases all lie inside the CP. When a line carries BOTH M and V, both directions can pass
// that local test and the greedy pick can be wrong, which shows up later as missing coverage.
// So a failure here means "not confirmed", not "disproved".
//
//   node replay-anchor.mjs [budget]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { solve } from "../probe-c/stage2.mjs";
import { initSheet, foldLayers, paperArea } from "./fold-engine-layers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.join(HERE, "../purelandfold/models");
const BUDGET = Number(process.argv[2] ?? 200000);
const SNAP = 1e-4;                       // the lattice PurelandFold's 3-decimal coords sit on

if (!fs.existsSync(MODELS)) {
    console.error("no models/ — run: python workspace/data/export_purelandfold_models.py");
    process.exit(1);
}

// Intervals are projected onto the LINE's canonical direction, never onto each edge's own.
// Using each edge's own direction mirrors half of them and makes contiguous creases read as
// gaps -- the same bug stage2.mjs was fixed for once, and that this script had at first.
const canon = (P, Q) => {
    const dx = Q[0] - P[0], dy = Q[1] - P[1], L = Math.hypot(dx, dy);
    let nx = -dy / L, ny = dx / L;
    if (nx < -1e-9 || (Math.abs(nx) <= 1e-9 && ny < 0)) { nx = -nx; ny = -ny; }
    const d = nx * P[0] + ny * P[1], dir = [ny, -nx];
    const r = (v) => Math.round(v * 1e3) / 1e3;
    return { key: `${r(nx)},${r(ny)},${r(d)}`, t: (v) => dir[0] * v[0] + dir[1] * v[1] };
};

// total creased length per (line, assignment), merging touching intervals
function cover(items) {
    const m = new Map();
    for (const { P, Q, a } of items) {
        const c = canon(P, Q), k = `${c.key}#${a}`;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push([Math.min(c.t(P), c.t(Q)), Math.max(c.t(P), c.t(Q))]);
    }
    const out = new Map();
    for (const [k, iv] of m) {
        iv.sort((x, y) => x[0] - y[0]);
        let s = 0, lo = iv[0][0], hi = iv[0][1];
        for (const [a, b] of iv) {
            if (a <= hi + 1e-6) hi = Math.max(hi, b);
            else { s += hi - lo; lo = a; hi = b; }
        }
        out.set(k, +(s + hi - lo).toFixed(3));
    }
    return out;
}

const rows = [];
console.log(`${"model".padEnd(18)} ${"folds".padStart(5)} ${"area".padStart(9)}  replay`);
for (const name of fs.readdirSync(MODELS).sort()) {
    const dir = path.join(MODELS, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const info = JSON.parse(fs.readFileSync(path.join(dir, "info.json"), "utf8"));
    const f = path.join(dir, `step-${String(info.max_step).padStart(2, "0")}.fold`);
    if (!fs.existsSync(f)) continue;

    const raw = JSON.parse(fs.readFileSync(f, "utf8"));
    const cp = { ...raw, vertices_coords:
        raw.vertices_coords.map(q => q.map(v => Math.round(v / SNAP) * SNAP)) };
    const r = solve(cp, { maxQueries: BUDGET, maxDepth: 24 });
    if (r.status !== "SOLVED") continue;

    const V = cp.vertices_coords, EV = cp.edges_vertices, EA = cp.edges_assignment;
    const want = [];
    EA.forEach((a, i) => { if (a === "M" || a === "V")
        want.push({ P: V[EV[i][0]], Q: V[EV[i][1]], a }); });
    const cw = cover(want);

    let st = initSheet(), made = [], bad = null;
    for (const [i, step] of r.seq.entries()) {
        let ok = null;
        for (const over of [true, false]) {
            const out = foldLayers(st, { n: step.line.n, d: step.line.d },
                                   step.movePositive, { mode: "all" }, over);
            if (out.error) continue;
            const cg = cover(out.made.map(m => ({ P: m.P, Q: m.Q, a: m.a })));
            if ([...cg].every(([k, v]) => (cw.get(k) || 0) >= v - 3e-3)) { ok = out; break; }
        }
        if (!ok) { bad = `fold ${i + 1}: neither direction stays inside the CP`; break; }
        made.push(...ok.made); st = ok.state;
    }
    if (!bad) {
        const cg = cover(made.map(m => ({ P: m.P, Q: m.Q, a: m.a })));
        const miss = [...cw].filter(([k, v]) => Math.abs((cg.get(k) || 0) - v) > 3e-3);
        const extra = [...cg].filter(([k, v]) => !cw.has(k) && v > 3e-3);
        if (miss.length || extra.length)
            bad = `crease sets differ (${miss.length} short, ${extra.length} extra)`;
    }
    const area = +paperArea(st).toFixed(6);
    rows.push({ name, folds: r.depth, queries: r.queries, area, verified: !bad, note: bad });
    console.log(`${name.padEnd(18)} ${String(r.depth).padStart(5)} ${String(area).padStart(9)}  ` +
                (bad ? `UNCONFIRMED — ${bad}` : "ok — every fold legal, crease sets equal"));
}

const ok = rows.filter(r => r.verified).length;
console.log(`\n${ok} of ${rows.length} SOLVED verdicts confirmed by independent replay`);
if (ok < rows.length)
    console.log(`UNCONFIRMED is not disproved — see the harness limit in this file's header.`);
fs.writeFileSync(path.join(HERE, "anchor-replay.json"),
    JSON.stringify({ _how: "node workspace/corpus/replay-anchor.mjs", budget: BUDGET,
                     snap: SNAP, solved: rows.length, verified: ok, models: rows }, null, 1) + "\n");
