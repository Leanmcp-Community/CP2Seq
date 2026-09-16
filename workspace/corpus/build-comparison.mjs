// Real Pureland models beside synthetic samples of the same length.
//
// WHY. The synthetic corpus is unnamed random patterns: you cannot look at one and say what it
// is, which makes "is the generator right?" and "is the corpus anything like real origami?"
// both unanswerable by eye. PurelandFold carries 27 sequences folded by people, inside the
// same action space, with names and video frames -- that is the anchor, and it had never been
// opened.
//
// Pairing rule: match on EFFECTIVE step count (pre-crease frames merged into the step they
// precede -- see export_purelandfold_models.py), and take the medium-coupling synthetic cell,
// which is the closest column to real Pureland's own coupling.
//
// The comparison is not flattering and is not meant to be. We chose SPAN over distribution
// match on the coupling axis (decided 2026-09-16): real Pureland's non-local coupling runs
// 0.0-3.4, too narrow to be a difficulty axis at all, so the synthetic corpus deliberately
// reaches past it. This page is where that decision becomes visible instead of buried.
//
//   node build-comparison.mjs <synthDir> <photoDir> > comparison.json
import fs from "fs";
import path from "path";

const SYNTH = process.argv[2] ?? "out/v2";
const PHOTOS = process.argv[3];
const MODELS = path.resolve("../purelandfold/models");
const R = (v) => Math.round(v * 1e5) / 1e5;

// one per difficulty band, chosen for recognisability rather than for flattering numbers
const PICKS = ["bird", "dog", "horse_head", "girl"];

const man = JSON.parse(JSON.parse(JSON.stringify(
    fs.readFileSync(path.join(SYNTH, "manifest.json"), "utf8"))));

const pairs = [];
for (const name of PICKS) {
    const info = JSON.parse(fs.readFileSync(path.join(MODELS, name, "info.json"), "utf8"));
    const tag = `step-${String(info.max_step).padStart(2, "0")}`;
    const cp = JSON.parse(fs.readFileSync(path.join(MODELS, name, tag + ".fold"), "utf8"));

    const counts = cp.edges_assignment.reduce((m, a) => (m[a] = (m[a] || 0) + 1, m), {});
    const eff = info.effective_steps;

    // the synthetic sample closest in length, from the medium-coupling column
    const pool = man.samples.filter(s => s.stratum.endsWith("-medium"));
    let best = null;
    for (const s of pool) {
        const d = Math.abs(s.metrics.steps - eff);
        if (!best || d < best.d) best = { d, s };
    }
    const syn = best.s;
    const sc = JSON.parse(fs.readFileSync(path.join(SYNTH, "samples", syn.id, "cp.fold"), "utf8"));

    let photo = null;
    if (PHOTOS) {
        const p = path.join(PHOTOS, name + ".jpg");
        if (fs.existsSync(p)) photo = "data:image/jpeg;base64," + fs.readFileSync(p).toString("base64");
    }

    pairs.push({
        name,
        real: {
            raw_steps: info.n_steps, effective_steps: eff,
            precrease_frames: info.n_steps - eff,
            // F edges are flat creases: paper that was folded and unfolded again. Pure simple
            // folding cannot make one, so this count is literally the part of the real model
            // that lies outside the frozen action space.
            counts, F: counts.F || 0,
            vertices: cp.vertices_coords.length, edges: cp.edges_vertices.length,
            has_layer_order: Array.isArray(cp.faceOrders) && cp.faceOrders.length > 0,
            cp: { V: cp.vertices_coords.map(p => [R(p[0]), R(p[1])]),
                  E: cp.edges_vertices, A: cp.edges_assignment },
            photo,
        },
        synthetic: {
            id: syn.id, stratum: syn.stratum, steps: syn.metrics.steps,
            coupling_max: syn.metrics.coupling_max, coupling_mean: syn.metrics.coupling_mean,
            crease_edges: syn.metrics.crease_edges, vertices: syn.metrics.vertices,
            layers_final: syn.metrics.layers_final,
            cp: { V: sc.vertices_coords.map(p => [R(p[0]), R(p[1])]),
                  E: sc.edges_vertices, A: sc.edges_assignment },
        },
    });
}

process.stderr.write(pairs.map(p =>
    `${p.name.padEnd(12)} real ${p.real.effective_steps}steps/${p.real.edges}edges/F=${p.real.F}` +
    `   synth ${p.synthetic.id} ${p.synthetic.steps}steps/${p.synthetic.crease_edges}creases\n`).join(""));
process.stdout.write(JSON.stringify({ pairs }));
