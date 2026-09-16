// Named models: fold sequences written by hand, not sampled.
//
// WHY THIS EXISTS. The random corpus gives controlled difficulty and scale, and every sample is
// an abstract pattern you cannot name. Recognisability comes from INTENT -- a designer choosing
// folds so the silhouette resembles something -- so no sampler will ever produce it. Named
// models have to be authored. Every benchmark that gets used has both: a large sampled body for
// scoring, and a small named set for figures, qualitative analysis, and sanity.
//
// WHAT IS AUTHORABLE HERE. The action space is all-layers simple folding, and the constraint it
// imposes is often misread: "all layers" means all layers THE LINE CROSSES, not the whole sheet.
// Folding one corner of a folded triangle down is an all-layers fold -- the line crosses both
// layers and moves both. So classic few-fold models are in scope; what is NOT in scope is
// moving some layers and leaving others that the same line crosses, which is what
// PurelandFold's models do (workspace/corpus/check-anchor.mjs: 20 of 27 proven outside).
//
// Two families, and both were asked for:
//   USEFUL, NOT REPRESENTATIONAL  accordion, map fold, Miura-ori -- named, and genuinely used
//     (deployable structures, packaging, mechanical metamaterials; the Track 2 connection)
//   RECOGNISABLE  dog head, and friends -- classic few-fold models
//
// Coordinates are in the CURRENT FOLDED PLANE, not the original square: a fold acts on the
// paper as it is now, which is also how a person reads a diagram.
//
//   node models.mjs [--out out/named]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyFold, ANGLE_DEG, polyArea, bbox } from "./fold-engine.mjs";
import { planarize, foldedState } from "./planarize.mjs";
import { ID } from "../probe-c/stage2.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// angle index: 0 = horizontal (y = off) · 1 = y = x + off · 2 = vertical (x = off) · 3 = x + y = off
const H = 0, D = 1, V = 2, A = 3;

// f(angleIndex, offset, movePositive, over)
//   movePositive  move the side with n·p > offset
//   over          the moving part lands on top of the stationary part
const f = (ai, off, movePositive, over) => ({ ai, off, movePositive, over });

// An accordion pleat.
//
// The mechanic is easy to get wrong, and the first version here did: it folded the LARGE side
// across each line, which walks the paper off to one side and leaves the next line outside the
// silhouette entirely. A pleat works the other way round -- each fold carries the ALREADY
// FOLDED stack forward by one panel width, alternating over and under, while the untouched
// remainder stays put:
//
//   fold 1 at w    move the side x < w   -> panel [0,w] lands on [w,2w],  stack sits at x >= w
//   fold 2 at 2w   move the side x < 2w  -> that stack lands on [2w,3w],  and so on
//
// Every one of those lines crosses every layer beneath it, so a pleat is squarely inside the
// all-layers action space -- which is why it is the useful structure this space makes naturally.
function pleat(ai, offsets, over0 = true) {
    return offsets.map((off, k) => f(ai, off, false, (k % 2 === 0) === over0));
}
const evenly = (n) => Array.from({ length: n - 1 }, (_, k) => (k + 1) / n);

const MODELS = [
    {
        id: "accordion-8",
        title: "Accordion pleat, 8 panels",
        family: "useful",
        note: "The canonical deployable fold. Every crease is a full-width parallel line and " +
              "every fold crosses the whole stack, so it sits exactly in the middle of this " +
              "action space rather than at its edge.",
        folds: pleat(V, evenly(8)),
    },
    {
        id: "map-fold-4x4",
        title: "Map fold, 4 x 4",
        family: "useful",
        note: "Accordion one way, then accordion the folded strip the other way -- how a road " +
              "map actually folds. This is the shape the theory is named after: Arkin et al., " +
              "'When Can You Fold a Map?' is the complexity result our action space inherits.",
        folds: [...pleat(V, evenly(4)), ...pleat(H, evenly(4))],
    },
    {
        id: "miura-ori-ish",
        title: "Miura-ori, skewed pleat",
        family: "useful",
        note: "Accordion in one direction, then pleat the strip along slanted lines. The skew " +
              "is what gives Miura-ori its single degree of freedom and its use in solar " +
              "arrays and stents. Built here with all-layers folds only.",
        // after the vertical pleat the paper is a strip at x in [0.75, 1], so the slanted
        // offsets have to be chosen to actually cross THAT, not the original square
        folds: [...pleat(V, evenly(4)), ...pleat(D, [-0.75, -0.5, -0.25])],
    },
    {
        id: "dog-head",
        title: "Dog head",
        family: "recognisable",
        note: "The classic four-fold model: halve on the diagonal, fold two corners forward " +
              "for ears, turn the chin up. Every one of those lines crosses every layer " +
              "beneath it, so a recognisable model does fit in this action space after all -- " +
              "what does not fit is PurelandFold's heavier versions.",
        folds: [
            f(A, 1.0, true, true),        // halve on the anti-diagonal -> triangle, 2 layers
            f(D, -0.55, false, true),     // right corner forward: ear
            f(D, 0.55, true, true),       // left corner forward: ear
            f(A, 0.3, false, true),       // chin up: snout
        ],
    },
    {
        id: "sailboat",
        title: "Sailboat",
        family: "recognisable",
        note: "Halve on the diagonal for the sail, then turn the bottom band up for the hull.",
        folds: [
            f(A, 1.0, true, true),        // halve on the anti-diagonal -> the sail
            f(H, 0.18, false, true),      // turn the bottom band up -> the hull
            f(D, -0.4, false, true),      // trim the stern corner
        ],
    },
];

/* ---------- run one model ---------- */
function run(model) {
    let layers = [{ poly: [[0, 0], [1, 0], [1, 1], [0, 1]], T: ID, inv: ID, par: 0 }];
    const creases = [], seq = [], states = [layers];

    for (const [i, fd] of model.folds.entries()) {
        const before = layers.length;
        const r = applyFold(layers, creases, fd.ai, fd.off, fd.movePositive, fd.over);
        if (!r) return { ok: false, failedAt: i + 1, fold: fd, seq, creases, layers, states };
        creases.push(...r.made);
        layers = r.layers;
        states.push(layers);
        seq.push({
            step: i + 1, angle_deg: ANGLE_DEG[fd.ai], angle_index: fd.ai, offset: fd.off,
            move_positive: fd.movePositive, over: fd.over,
            creases: r.made.map(m => ({ P: m.P, Q: m.Q, assignment: m.a })),
            creases_created: r.split,
            layers_before: before, layers_after: layers.length,
            silhouette_bbox_area: bbox(layers).area,
            largest_face_area: Math.max(...layers.map(l => polyArea(l.poly))),
        });
    }
    return { ok: true, seq, creases, layers, states };
}

/* ---------- main ---------- */
const OUT = path.resolve(HERE, process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1] : "out/named");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "samples"), { recursive: true });

const manifest = [];
console.log(`named models -> ${path.relative(process.cwd(), OUT)}\n`);
console.log(`${"model".padEnd(18)} ${"family".padEnd(14)} ${"folds".padStart(5)} ` +
            `${"creases".padStart(8)} ${"layers".padStart(7)}  status`);

for (const m of MODELS) {
    const r = run(m);
    if (!r.ok) {
        console.log(`${m.id.padEnd(18)} ${m.family.padEnd(14)} ${"-".padStart(5)} ` +
                    `${"-".padStart(8)} ${"-".padStart(7)}  FAILED at fold ${r.failedAt} ` +
                    `(angle ${ANGLE_DEG[r.fold.ai]}, offset ${r.fold.off})`);
        manifest.push({ id: m.id, title: m.title, family: m.family, ok: false,
                        failed_at: r.failedAt });
        continue;
    }

    const segs = [
        { P: [0, 0], Q: [1, 0], assignment: "B" }, { P: [1, 0], Q: [1, 1], assignment: "B" },
        { P: [1, 1], Q: [0, 1], assignment: "B" }, { P: [0, 1], Q: [0, 0], assignment: "B" },
        ...r.creases.map(c => ({ P: c.P, Q: c.Q, assignment: c.a })),
    ];
    const pl = planarize(segs);
    const counts = pl.stats.counts;

    const dir = path.join(OUT, "samples", m.id);
    fs.mkdirSync(path.join(dir, "steps"), { recursive: true });
    fs.writeFileSync(path.join(dir, "cp.fold"), JSON.stringify(pl.fold));
    fs.writeFileSync(path.join(dir, "seq.json"), JSON.stringify(
        { id: m.id, title: m.title, steps: r.seq.length, folds: r.seq }, null, 1));
    r.states.forEach((st, k) => fs.writeFileSync(
        path.join(dir, "steps", `step-${String(k).padStart(2, "0")}.fold`),
        JSON.stringify(foldedState(st))));

    const meta = {
        id: m.id, title: m.title, family: m.family, note: m.note, authored: true,
        metrics: {
            steps: r.seq.length,
            crease_edges: (counts.M || 0) + (counts.V || 0),
            mountain: counts.M || 0, valley: counts.V || 0,
            vertices: pl.stats.vertices,
            coupling_max: Math.max(...r.seq.map(s => s.creases_created)),
            layers_final: r.layers.length,
            bbox_area_final: +bbox(r.layers).area.toFixed(6),
        },
        planarize: pl.stats,
    };
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 1));
    manifest.push({ ...meta, ok: true });

    const bad = pl.stats.assignment_conflicts || pl.stats.non_bmv_edges;
    console.log(`${m.id.padEnd(18)} ${m.family.padEnd(14)} ${String(r.seq.length).padStart(5)} ` +
                `${String(meta.metrics.crease_edges).padStart(8)} ` +
                `${String(r.layers.length).padStart(7)}  ${bad ? "CP DEFECT" : "ok"}`);
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(
    { generated: new Date().toISOString(), authored: true, samples: manifest }, null, 1));
const ok = manifest.filter(m => m.ok).length;
console.log(`\n${ok}/${manifest.length} models built`);
if (ok < manifest.length) console.log(`A FAILED fold means that line does not cut the stack, ` +
    `or it would contradict a crease already made -- adjust the offset and re-run.`);
