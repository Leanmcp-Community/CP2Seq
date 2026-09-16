// Named models: fold sequences written by hand, not sampled.
//
// WHY THIS EXISTS. The random corpus gives controlled difficulty and scale, and every sample is
// an abstract pattern you cannot name. Recognisability comes from INTENT -- a designer choosing
// folds so the silhouette resembles something -- so no sampler will ever produce it. Named
// models have to be authored. Every benchmark that gets used has both: a large sampled body for
// scoring, and a small named set for figures, qualitative analysis, and sanity.
//
// TWO THINGS CHANGED HERE ON 2026-09-16, AND THE FIRST ONE IS THE REASON THE DOG LOOKED WRONG.
//
//   ARBITRARY ANGLES. The first version drove fold-engine.mjs, which offers four fold angles
//   (0/45/90/135). That restriction is load-bearing for the RANDOM generator -- those four
//   reflections have integer matrix entries, so twenty composed folds drift by nothing -- and
//   it is pure cost here. A dog's ear is not axis-aligned. Authored models are 3-6 folds, far
//   too short for drift to accumulate, so they get the full plane. The random generator keeps
//   its four angles; this is a per-caller choice, not a loosening of the engine.
//
//   PARTIAL FOLDS. Driving fold-engine-layers.mjs also brings the some-layers tier, so a fold
//   can move a run of layers and leave the rest. That is what makes an ASYMMETRIC outline
//   possible at all: with the whole stack moving, every layer keeps the same shape, which is
//   why the sampled corpus looks like a grid no matter how long it runs.
//
// Folds are written as a line through two points IN THE CURRENT PLANE, because that is how a
// diagram reads -- "fold this corner over to there" -- rather than as a normal and an offset.
//
//   node models.mjs [--out out/named]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initSheet, foldLayers, currentPolys, paperArea, layerCount }
    from "./fold-engine-layers.mjs";
import { planarize, foldedState } from "./planarize.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ---------- writing a fold the way a diagram states one ---------- */
// the line through two points
const thru = (P, Q) => {
    const dx = Q[0] - P[0], dy = Q[1] - P[1], L = Math.hypot(dx, dy);
    const n = [-dy / L, dx / L];
    return { n, d: n[0] * P[0] + n[1] * P[1] };
};
const vert = (x) => ({ n: [1, 0], d: x });
const horiz = (y) => ({ n: [0, 1], d: y });
// a line at `deg` to the x-axis, offset along its own normal
const slant = (deg, off) => {
    const t = deg * Math.PI / 180, n = [-Math.sin(t), Math.cos(t)];
    return { n, d: off };
};

// f(line, movePositive, over, sel) -- the low-level form, used by the systematic pleats
//   movePositive  move the side with n·p > d
//   over          the moving part lands on top (free for all-layers, forced for a partial run)
//   sel           { mode: "all" } | { mode: "top", k } | { mode: "bottom", k }
const f = (line, movePositive, over = true, sel = { mode: "all" }) =>
    ({ line, movePositive, over, sel });

// fold(P, Q, moving, ...) -- the form hand-authored models use, and the reason they are
// readable. `thru` derives its normal from the order the two points are written, so the sense
// of `movePositive` silently flips when you swap them: the first version of the dog folded the
// wrong half at step one and every later line then missed the paper entirely, which surfaced
// as "no-crease" four folds later. Naming the point that MOVES cannot be got backwards, and is
// how a diagram states it -- "fold this corner over".
const fold = (P, Q, moving, over = true, sel = { mode: "all" }) => {
    const line = thru(P, Q);
    const side = line.n[0] * moving[0] + line.n[1] * moving[1] - line.d;
    return { line, movePositive: side > 0, over, sel };
};

// An accordion pleat: each fold carries the ALREADY FOLDED stack forward by one panel width,
// alternating over and under, while the untouched remainder stays put. Folding the large side
// instead walks the paper off to one side and leaves the next line outside the silhouette.
const pleat = (lineAt, offsets, over0 = true) =>
    offsets.map((off, k) => f(lineAt(off), false, (k % 2 === 0) === over0));
const evenly = (n) => Array.from({ length: n - 1 }, (_, k) => (k + 1) / n);

// The sheet a model starts from. Default is the unit square, the same one the sampled corpus
// uses. A model may name its own -- `DIAMOND` is that same square held rotated 45 degrees,
// which is not a different piece of paper, it is the diagram's "now turn the paper round".
// It matters because a fold along a diagonal makes the spine a 45-degree line, so a model whose
// conventional drawing has a horizontal spine cannot be produced from an axis-aligned square,
// however the folds are chosen.
const SQUARE = [[0, 0], [1, 0], [1, 1], [0, 1]];
const polyArea = (poly) => {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
};
const DIAMOND = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];

const MODELS = [
    {
        id: "accordion-8", title: "Accordion pleat, 8 panels", family: "useful",
        note: "The canonical deployable fold. Every crease is a full-width parallel line and " +
              "every fold crosses the whole stack, so it sits in the middle of the all-layers " +
              "action space rather than at its edge.",
        folds: pleat(vert, evenly(8)),
    },
    {
        id: "map-fold-4x4", title: "Map fold, 4 x 4", family: "useful",
        note: "Accordion one way, then accordion the folded strip the other way -- how a road " +
              "map actually folds. This is the shape the theory is named after: Arkin et al., " +
              "'When Can You Fold a Map?' is the complexity result this action space inherits.",
        folds: [...pleat(vert, evenly(4)), ...pleat(horiz, evenly(4))],
    },
    {
        id: "miura-ori", title: "Miura-ori, skewed pleat", family: "useful",
        note: "Accordion in one direction, then pleat the strip along slanted lines. The skew " +
              "gives Miura-ori its single degree of freedom and its use in solar arrays and " +
              "stents. After the vertical pleat the paper is a strip at x in [0.75, 1], so the " +
              "slanted offsets are chosen to fall inside THAT strip's own range, not the square's.",
        folds: [...pleat(vert, evenly(4)),
                ...pleat((o) => slant(45, o), [-0.5, -0.32, -0.14])],
    },
    {
        id: "dog-head", title: "Dog head", family: "recognisable",
        sheet: DIAMOND,
        note: "The classic four-fold model, and the one that took three tries. Folding a square " +
              "on its diagonal always leaves the spine at 45 degrees, so the head came out " +
              "tilted however the later folds were chosen -- the paper has to be held turned, " +
              "which is what DIAMOND is. Then: halve to a triangle with the spine level and the " +
              "snout down, drop both top corners for ears, tip the chin up.",
        folds: [
            // halve: the top half drops, leaving the triangle (0,0.5),(0.5,0),(1,0.5) --
            // spine level along y = 0.5, snout at the bottom
            fold([0, 0.5], [1, 0.5], [0.5, 1]),
            // Ears. An earlier version cut from the spine right down to the far edge, which does
            // not fold an ear -- it trims the corner off, and the silhouette reads as a blob. An
            // ear is a SHORT line close to the corner, so the corner flips over and lies on the
            // face as a visible triangular flap while the head keeps its outline.
            fold([0.66, 0.5], [0.85, 0.28], [1, 0.5]),   // right ear drops over the face
            fold([0.34, 0.5], [0.15, 0.28], [0, 0.5]),   // left ear, mirrored
            fold([0, 0.10], [1, 0.10], [0.5, 0]),        // chin: tip the snout up
        ],
    },
    {
        id: "sailboat", title: "Sailboat", family: "recognisable",
        note: "Halve on the diagonal for the sail, turn the bottom band up for the hull, trim " +
              "the stern corner.",
        folds: [
            fold([1, 0], [0, 1], [1, 1]),            // the sail
            fold([0, 0.18], [1, 0.18], [0.5, 0]),    // hull: the bottom band turns up
            fold([0.62, 0.18], [0.92, 0.48], [1, 0.2]),   // trim the stern corner
        ],
    },
    {
        id: "hat-brim", title: "Hat with a turned brim", family: "recognisable",
        note: "The model that needs the SOME-LAYERS tier, and the point of including it. " +
              "Halve the paper, then turn up only the TOP layer's edge -- the brim. The two " +
              "layers now have different outlines, which no all-layers sequence can produce " +
              "however long it runs, because a fold that moves the whole stack moves every " +
              "layer's boundary with it.",
        folds: [
            fold([0, 0.5], [1, 0.5], [0.5, 1]),                        // halve, spine at y = 0.5
            fold([0, 0.16], [1, 0.16], [0.5, 0], true, { mode: "top", k: 1 }),  // the brim
            fold([0.18, 0], [0, 0.18], [0, 0]),                        // tip a corner
        ],
    },
];

/* ---------- run one model ---------- */
function run(model) {
    const sheet = model.sheet ?? SQUARE;
    let st = initSheet(sheet);
    const creases = [], seq = [], states = [st];
    for (const [i, fd] of model.folds.entries()) {
        const before = layerCount(st);
        const r = foldLayers(st, fd.line, fd.movePositive, fd.sel, fd.over);
        if (r.error) return { ok: false, failedAt: i + 1, why: r.error, fd };
        creases.push(...r.made);
        st = r.state;
        states.push(st);
        seq.push({
            step: i + 1,
            line: { n: fd.line.n, d: fd.line.d },
            move_positive: fd.movePositive, over: r.over,
            layers_moved: r.moved, selection: fd.sel,
            creases: r.made.map(m => ({ P: m.P, Q: m.Q, assignment: m.a })),
            creases_created: r.made.length,
            layers_before: before, layers_after: layerCount(st),
            paper_area: +paperArea(st).toFixed(6),
        });
    }
    return { ok: true, seq, creases, st, states };
}

/* ---------- main ---------- */
const OUT = path.resolve(HERE, process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1] : "out/named");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "samples"), { recursive: true });

const manifest = [];
console.log(`named models -> ${path.relative(process.cwd(), OUT)}\n`);
console.log(`${"model".padEnd(16)} ${"family".padEnd(13)} ${"folds".padStart(5)} ` +
            `${"creases".padStart(7)} ${"layers".padStart(6)} ${"area".padStart(8)}  status`);

for (const m of MODELS) {
    const r = run(m);
    if (!r.ok) {
        console.log(`${m.id.padEnd(16)} ${m.family.padEnd(13)} ${"-".padStart(5)} ` +
                    `${"-".padStart(7)} ${"-".padStart(6)} ${"-".padStart(8)}  ` +
                    `FAILED at fold ${r.failedAt}: ${r.why}`);
        manifest.push({ id: m.id, title: m.title, family: m.family, ok: false,
                        failed_at: r.failedAt, why: r.why });
        continue;
    }

    const sheet = m.sheet ?? SQUARE;
    const segs = [
        ...sheet.map((P, i) => ({ P, Q: sheet[(i + 1) % sheet.length], assignment: "B" })),
        ...r.creases.map(c => ({ P: c.P, Q: c.Q, assignment: c.a })),
    ];
    const pl = planarize(segs);
    const counts = pl.stats.counts;

    const dir = path.join(OUT, "samples", m.id);
    fs.mkdirSync(path.join(dir, "steps"), { recursive: true });
    fs.writeFileSync(path.join(dir, "cp.fold"), JSON.stringify(pl.fold));
    fs.writeFileSync(path.join(dir, "seq.json"), JSON.stringify(
        { id: m.id, title: m.title, steps: r.seq.length, folds: r.seq }, null, 1));
    r.states.forEach((s, k) => fs.writeFileSync(
        path.join(dir, "steps", `step-${String(k).padStart(2, "0")}.fold`),
        JSON.stringify(foldedState(currentPolys(s)))));

    const partial = r.seq.filter(s => s.selection.mode !== "all").length;
    const meta = {
        id: m.id, title: m.title, family: m.family, note: m.note, authored: true,
        tier: partial ? "some-layers" : "all-layers",
        metrics: {
            steps: r.seq.length,
            partial_folds: partial,
            crease_edges: (counts.M || 0) + (counts.V || 0),
            mountain: counts.M || 0, valley: counts.V || 0,
            vertices: pl.stats.vertices,
            coupling_max: Math.max(...r.seq.map(s => s.creases_created)),
            layers_final: layerCount(r.st),
            paper_area_final: +paperArea(r.st).toFixed(6),
            sheet_area: +polyArea(m.sheet ?? SQUARE).toFixed(6),
        },
        planarize: pl.stats,
    };
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 1));
    manifest.push({ ...meta, ok: true });

    // Conservation is against THIS model's sheet, not against 1. DIAMOND is the unit square
    // held rotated, so its area is 0.5 in these coordinates -- the first run of the rotated dog
    // was flagged DEFECT by a check that had 1 hard-coded, which is the check working.
    const bad = pl.stats.assignment_conflicts || pl.stats.non_bmv_edges
        || Math.abs(meta.metrics.paper_area_final - meta.metrics.sheet_area) > 1e-6;
    console.log(`${m.id.padEnd(16)} ${m.family.padEnd(13)} ${String(r.seq.length).padStart(5)} ` +
                `${String(meta.metrics.crease_edges).padStart(7)} ` +
                `${String(meta.metrics.layers_final).padStart(6)} ` +
                `${String(meta.metrics.paper_area_final).padStart(8)}  ` +
                `${bad ? "DEFECT" : "ok"}${partial ? `  (${partial} partial)` : ""}`);
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(
    { generated: new Date().toISOString(), authored: true, samples: manifest }, null, 1));
const ok = manifest.filter(m => m.ok).length;
console.log(`\n${ok}/${manifest.length} models built`);
if (ok < manifest.length) console.log(
    `FAILED means that line does not cut the selected layers, or the fold would tear the ` +
    `sheet -- adjust the line and re-run.`);
