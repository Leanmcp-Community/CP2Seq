// A metadata-only index of a corpus, for the browser to load in one request.
//
// WHY AN INDEX AND NOT ONE BIG PAYLOAD. inspector.html inlines every sample's geometry into the
// page, which was right for a showcase of a dozen samples and does not scale: the release corpus
// is 1,050 samples and roughly 20MB of folded-state geometry. A page that inlines that is slow
// to open, impossible to publish, and re-generated in full whenever one sample changes.
//
// So this emits metadata only -- a few hundred KB -- and the browser fetches a sample's cp.fold
// and steps.fold when someone actually opens it. Everything the filters need (tier, split, fold
// count, verdict, crease and layer counts) is here; nothing that draws paper is.
//
// /!\ THE DIFFICULTY BAND IS COMPUTED HERE, not stored per sample, and it uses the project's own
// step cut points from DATASET.md: <=10 easy, 11-13 mid, >13 hard. Recomputing it in the viewer
// would be a second definition of the bands, and two definitions of a difficulty axis is how a
// paper ends up reporting one thing and the data meaning another.
//
//   node build-index.mjs [out/release] > out/release/index.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, process.argv[2] ?? "out/release");

const band = (f) => f <= 10 ? "easy" : f <= 13 ? "mid" : "hard";

const batches = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(ROOT, e.name, "manifest.json")))
    .map(e => e.name).sort();

const samples = [];
for (const b of batches) {
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, b, "manifest.json"), "utf8"));
    const tier = b.startsWith("all") ? "all-layers" : "some-layers";
    const split = b.includes("verified") ? "verified" : "generated";
    for (const s of man.samples ?? []) {
        const folds = s.metrics?.steps ?? s.steps;
        const ps = s.pure_search ?? null;
        samples.push({
            id: s.id, batch: b, dir: `${b}/samples/${s.id}`,
            tier, split, folds, band: band(folds),
            creases: s.metrics?.crease_edges ?? s.metrics?.creases ?? null,
            layers: s.metrics?.layers_final ?? s.metrics?.layers ?? null,
            partial: s.partial_used ?? 0,
            verdict: ps?.status ?? null,
            queries: ps?.queries ?? null,
            shorter: ps && ps.status === "SOLVED" && ps.depth < folds ? ps.depth : null,
        });
    }
}

// The replay result per sample, when it has been run. A viewer that cannot show which samples
// failed their own check is hiding the thing a reader most needs to see.
const rp = path.join(ROOT, "replay-check.json");
if (fs.existsSync(rp)) {
    const failed = new Map((JSON.parse(fs.readFileSync(rp, "utf8")).failures ?? [])
        .map(f => [f.sample, f.why]));
    for (const s of samples) {
        const k = `${s.batch}/${s.id}`;
        s.replay = failed.has(k) ? "FAIL" : "ok";
        if (failed.has(k)) s.replay_why = failed.get(k);
    }
}

const count = (f) => samples.filter(f).length;
process.stderr.write(
    `index: ${samples.length} samples  ` +
    `(easy ${count(s => s.band === "easy")}, mid ${count(s => s.band === "mid")}, ` +
    `hard ${count(s => s.band === "hard")})  ` +
    `replay failures ${count(s => s.replay === "FAIL")}\n`);

process.stdout.write(JSON.stringify({
    generated: new Date().toISOString(),
    root: path.basename(ROOT),
    bands: { easy: "<= 10 folds", mid: "11-13", hard: "> 13", source: "DATASET.md step cut points" },
    samples,
}));
