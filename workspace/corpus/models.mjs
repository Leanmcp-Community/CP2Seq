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
    /* ======================================================================================
     * BATCH 2, 2026-09-16. Written to answer one criticism: six named models is not enough to
     * claim the corpus contains anything a person would fold. Everything here is restricted to
     * SIMPLE FOLDS -- no unfolding, no pre-creases, no reverse folds or sinks -- which rules out
     * most of the classic repertoire (cranes, frogs, anything with a petal fold) and is exactly
     * the restriction the paper is about. What survives is silhouettes and pleated structures.
     * ====================================================================================== */
    {
        id: "house", title: "House", family: "recognisable",
        note: "Two folds. Cut both top corners along lines that meet at the top centre, so the " +
              "peak survives and the silhouette becomes a pentagon -- a wall with a roof. The " +
              "lines must MEET at (0.5, 1); ending them apart leaves a flat ridge and it reads " +
              "as a tent with the top cut off.",
        folds: [
            fold([0, 0.55], [0.5, 1], [0, 1]),
            fold([1, 0.55], [0.5, 1], [1, 1]),
        ],
    },
    {
        id: "envelope", title: "Envelope", family: "recognisable",
        note: "Bottom edge up, both sides in, top flap down -- the order a real envelope is " +
              "assembled in, and the reason the last fold lies on top of the other three.",
        folds: [
            fold([0, 0.28], [1, 0.28], [0.5, 0]),
            fold([0.22, 0], [0.22, 1], [0, 0.5]),
            fold([0.78, 0], [0.78, 1], [1, 0.5]),
            fold([0, 0.72], [1, 0.72], [0.5, 1]),
        ],
    },
    {
        id: "paper-dart", title: "Paper dart", family: "recognisable",
        note: "The plane everyone folds, minus the centre crease -- that crease is made by " +
              "folding and UNFOLDING, which simple folding cannot do, so the corners are " +
              "brought to the centre line directly. Two corners in, then the new slanted edges " +
              "in again, and the nose is the point at the top.",
        folds: [
            fold([0.5, 1], [0, 0.5], [0, 1]),
            fold([0.5, 1], [1, 0.5], [1, 1]),
            fold([0.5, 1], [0.12, 0.12], [0.05, 0.9]),
            fold([0.5, 1], [0.88, 0.12], [0.95, 0.9]),
        ],
    },
    {
        id: "pine-tree", title: "Pine tree", family: "recognisable",
        note: "A tapered triangle with a trunk: bring both lower sides in to a narrow base, " +
              "then take the very bottom corners off so a trunk is left standing below the " +
              "foliage.",
        folds: [
            fold([0.5, 1], [0.12, 0], [0, 0.4]),
            fold([0.5, 1], [0.88, 0], [1, 0.4]),
            fold([0.3, 0.12], [0.42, 0], [0.2, 0.05]),
            fold([0.7, 0.12], [0.58, 0], [0.8, 0.05]),
        ],
    },
    {
        id: "pencil", title: "Pencil", family: "recognisable",
        note: "A long rectangle with one end brought to a point. Halve twice the same way for " +
              "the shaft -- a pencil is thin -- then take both corners off one end.",
        folds: [
            fold([0, 0.32], [1, 0.32], [0.5, 0]),
            fold([0, 0.68], [1, 0.68], [0.5, 1]),
            fold([0.78, 0.32], [1, 0.5], [1, 0.35]),
            fold([0.78, 0.68], [1, 0.5], [1, 0.65]),
        ],
    },
    {
        id: "bookmark-corner", title: "Corner bookmark", family: "recognisable",
        note: "The triangle that slips over a page corner: fold on the diagonal, then turn the " +
              "free tip back over the body so the pocket's mouth is visible.",
        folds: [
            fold([0, 0], [1, 1], [1, 0]),
            fold([0.3, 0.7], [0.7, 0.3], [0.2, 0.2]),
        ],
    },
    {
        id: "arrowhead", title: "Arrowhead", family: "recognisable",
        note: "Point up, then notch the base by folding the bottom edge up between the two " +
              "barbs -- the notch is what separates an arrowhead from a plain triangle.",
        folds: [
            fold([0.5, 1], [0, 0.25], [0, 1]),
            fold([0.5, 1], [1, 0.25], [1, 1]),
            fold([0.32, 0.18], [0.68, 0.18], [0.5, 0]),
        ],
    },
    {
        id: "bow-tie", title: "Bow tie", family: "recognisable",
        note: "Pinch the middle from both sides: two folds bring the long edges in to a narrow " +
              "waist, and two more take the outer corners off so each wing flares.",
        folds: [
            fold([0, 0.38], [1, 0.38], [0.5, 0]),
            fold([0, 0.62], [1, 0.62], [0.5, 1]),
            // /!\ The first attempt gave these two the SAME line -- both written through
            // (0.5, 0.5) at 45 degrees -- so the second found the paper entirely on one side and
            // refused with no-crease. Two lines that pinch a waist have to LEAN TOWARDS each
            // other, not lie on top of one another.
            fold([0.40, 0.38], [0.50, 0.62], [0.2, 0.5]),
            fold([0.60, 0.38], [0.50, 0.62], [0.8, 0.5]),
        ],
    },
    {
        id: "cup", title: "Cup", family: "recognisable",
        note: "Diagonal first, so the paper is a triangle with a horizontal top edge, then each " +
              "bottom corner swings across to the far side. The two crossed flaps are the cup's " +
              "walls; the top edge stays open, which is the whole point of a cup.",
        folds: [
            fold([0, 1], [1, 0], [0, 0]),
            // /!\ Writing the second flap as the first line with its endpoints swapped does not
            // mirror it -- it is the same line, and the fold then has nothing to crease. The two
            // flaps cross, so their lines are genuinely different lines.
            fold([0.10, 0.34], [0.66, 0.66], [0, 0]),
            fold([0.34, 0.10], [0.66, 0.66], [1, 1]),
        ],
    },
    {
        id: "fan", title: "Fan", family: "useful",
        note: "Six panels pleated across, then the handle end pinched so the pleats splay from " +
              "a point rather than running parallel.",
        folds: [...pleat(vert, evenly(6)),
                fold([0.82, 0], [1, 0.2], [1, 0])],
    },
    {
        id: "staircase", title: "Staircase", family: "useful",
        note: "The same pleat as the accordion but read side-on: alternating over and under at " +
              "uneven spacing gives treads and risers of different depth, which is what makes " +
              "it read as steps rather than as a fan.",
        folds: pleat(horiz, [0.14, 0.3, 0.42, 0.58, 0.7, 0.86]),
    },
    /* ---- models that NEED the some-layers tier; an all-layers sequence cannot make them ---- */
    {
        id: "shirt-collar", title: "Collar", family: "recognisable",
        note: "Halve, then turn down only the TOP layer at the fold -- the collar. Like hat-brim " +
              "this is a some-layers model by necessity: the two layers finish with different " +
              "outlines, and an all-layers fold moves every layer's boundary together.",
        folds: [
            fold([0, 0.5], [1, 0.5], [0.5, 1]),
            // /!\ The first attempt moved [0.5, 0.5] -- the SPINE side, where the top layer is
            // joined to the one beneath -- and the engine correctly refused it as a tear. The
            // movable half of a partial fold is the one carrying the FREE edge, which is what
            // hat-brim does and what a hand does.
            fold([0, 0.14], [1, 0.14], [0.5, 0], true, { mode: "top", k: 1 }),
        ],
    },
    {
        id: "open-book", title: "Open book", family: "recognisable",
        note: "Halve for the spine, then turn one page: the top layer alone folds back, so one " +
              "side shows two leaves and the other shows one. A whole-stack fold would turn " +
              "both leaves at once and the book would just be a smaller rectangle.",
        folds: [
            fold([0.5, 0], [0.5, 1], [1, 0.5]),
            // /!\ TWO THINGS WENT WRONG HERE AND EACH NAMED ITSELF. First, a run taken from the
            // BOTTOM can only go under: passing over was refused as direction-impossible rather
            // than silently corrected. Then re-using the spine line x = 0.5 left nothing on its
            // far side, so the fold had nothing to crease. A page turns on a line INSIDE the
            // closed book, swinging the leaf back short of the spine.
            fold([0.22, 0], [0.22, 1], [0, 0.5], false, { mode: "bottom", k: 1 }),
        ],
    },
    {
        id: "step-pocket", title: "Stepped pocket", family: "useful",
        note: "A pleat made in the top two layers only, leaving the ones beneath flat. The step " +
              "is a partial fold sitting on an unfolded bed -- the configuration the some-layers " +
              "tier exists to express, and the one the random sampler produces least often.",
        folds: [
            fold([0, 0.34], [1, 0.34], [0.5, 0]),
            fold([0, 0.66], [1, 0.66], [0.5, 1]),
            fold([0, 0.52], [1, 0.52], [0.5, 0.4], true, { mode: "top", k: 1 }),
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
