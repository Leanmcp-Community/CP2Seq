// Pull a handful of samples out of a corpus run into one compact payload for visual checking.
//
// Statistics cannot tell you a folding generator is correct -- a geometry bug produces a
// perfectly plausible histogram. What catches it is looking at the paper: creases must appear
// in the CP exactly when the step that made them runs, the folded silhouette must stay inside
// the previous one, and the layer count must match the creases the fold cut.
//
// So for every selected sample this emits, per step, both sides of the pair:
//   the CP with the creases made SO FAR, and the folded state at that step.
//
//   node build-showcase.mjs <runDir> [--per-cell 1] > showcase.json
import fs from "fs";
import path from "path";

const RUN = process.argv[2] ?? "out/v1";
const PER = Number(process.argv[process.argv.indexOf("--per-cell") + 1] || 1);
const R = (v) => Math.round(v * 1e5) / 1e5;

const man = JSON.parse(fs.readFileSync(path.join(RUN, "manifest.json"), "utf8"));

// which step created a given crease edge: the earliest fold whose crease segment covers it.
// This is the check that matters -- if the mapping has holes, the CP contains creases no fold
// made, and the sample is not the ground truth it claims to be.
function stepOfEdge(mid, folds) {
    for (let i = 0; i < folds.length; i++) {
        for (const c of folds[i].creases) {
            const [ax, ay] = c.P, [bx, by] = c.Q;
            const vx = bx - ax, vy = by - ay;
            const L2 = vx * vx + vy * vy;
            if (L2 < 1e-18) continue;
            const t = ((mid[0] - ax) * vx + (mid[1] - ay) * vy) / L2;
            if (t < -1e-6 || t > 1 + 1e-6) continue;
            const px = ax + t * vx, py = ay + t * vy;
            if (Math.hypot(px - mid[0], py - mid[1]) < 1e-6) return i + 1;
        }
    }
    return 0;                       // 0 = border, or (a bug) a crease no fold accounts for
}

const out = { run: RUN, generated: new Date().toISOString().slice(0, 10), strata: man.strata, samples: [] };

for (const st of man.strata) {
    const inCell = man.samples.filter(s => s.stratum === st.name);
    if (!inCell.length) { out.samples.push({ stratum: st.name, empty: true, cap: st.coupling_cap ?? null,
                                             steps_range: [st.min, st.max] }); continue; }
    // the median-coupling sample of the cell: representative, not cherry-picked
    const sorted = [...inCell].sort((a, b) => a.metrics.coupling_max - b.metrics.coupling_max);
    const picks = [];
    for (let k = 0; k < PER; k++) picks.push(sorted[Math.floor((k + 0.5) * sorted.length / PER)]);

    for (const m of picks) {
        const dir = path.join(RUN, "samples", m.id);
        const cp = JSON.parse(fs.readFileSync(path.join(dir, "cp.fold"), "utf8"));
        const seq = JSON.parse(fs.readFileSync(path.join(dir, "seq.json"), "utf8"));

        const edgeStep = cp.edges_vertices.map(([u, w], i) => {
            if (cp.edges_assignment[i] === "B") return 0;
            const a = cp.vertices_coords[u], b = cp.vertices_coords[w];
            return stepOfEdge([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], seq.folds);
        });
        const orphan = edgeStep.filter((s, i) => s === 0 && cp.edges_assignment[i] !== "B").length;

        const steps = [];
        for (let k = 0; k <= seq.steps; k++) {
            const f = JSON.parse(fs.readFileSync(
                path.join(dir, "steps", `step-${String(k).padStart(2, "0")}.fold`), "utf8"));
            steps.push({ V: f.vertices_coords.map(p => [R(p[0]), R(p[1])]), F: f.faces_vertices });
        }

        out.samples.push({
            id: m.id, stratum: m.stratum, cap: st.coupling_cap ?? null,
            steps_range: [st.min, st.max], seed: m.seed, metrics: m.metrics,
            orphan_creases: orphan,       // must be 0
            cp: { V: cp.vertices_coords.map(p => [R(p[0]), R(p[1])]),
                  E: cp.edges_vertices, A: cp.edges_assignment, S: edgeStep },
            folds: seq.folds.map(f => ({ angle: f.angle_deg, over: f.over,
                                         made: f.creases_created,
                                         layers: [f.layers_before, f.layers_after] })),
            states: steps,
        });
    }
}

const orphans = out.samples.reduce((a, s) => a + (s.orphan_creases || 0), 0);
process.stderr.write(`showcase: ${out.samples.filter(s => !s.empty).length} samples, ` +
                     `${orphans} orphan creases (must be 0)\n`);
process.stdout.write(JSON.stringify(out));
