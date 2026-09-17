// Choose the release subset of a generated batch.
//
// WHY THIS IS A SEPARATE FILE AND NOT A --reject FLAG. generate.mjs can already reject a sample
// while sampling, and that is right for the flags it has: each is a property of the one sample.
// The flag that actually fires on our data is not, and that is the finding this file is built
// around.
//
// ============================================================================================
// `collapsed` MEASURES DEPTH, NOT DEGENERACY. MEASURED, out/batch1, n=120:
// ============================================================================================
//   steps  4-6     0/17 collapsed     bbox p50 0.375
//   steps  7-9     3/17               bbox p50 0.188
//   steps 10-12   22/38               bbox p50 0.047
//   steps 13-15   27/28               bbox p50 0.016
//   steps 16-18   16/16               bbox p50 0.012
//
// The flag is `bbox_area_final < 0.05`, an ABSOLUTE threshold, and the bounding box shrinks by
// construction: every all-layers fold moves the whole stack across a line, so the paper's
// footprint can only get smaller. 60% of the batch is flagged and the entire hard stratum is
// (40/40). Turning it into a filter would therefore delete the deep end of the corpus -- the
// filter and the difficulty axis would be the same variable, and "we filtered degenerate
// samples" would mean "we removed the hard ones".
//
// Two obvious normalisations were tried and both fail, which is why this file picks a third:
//   * bbox x layers_final     -- still drifts with depth (p50 4.5 -> 2.0) and floors at ~2.0
//   * bbox x 2^steps          -- OVER-corrects, growing 12 -> 2048 across the same range
// Neither is depth-free, so neither gives a constant that can be thresholded.
//
// WHAT THIS FILE DOES INSTEAD: flags the bottom quantile of bbox area WITHIN A NARROW BAND OF
// FOLD COUNTS. Depth-free by construction, because the comparison is only ever against samples
// of very nearly the same length; it keeps every stratum populated; and the cut point is one explicit number rather
// than a threshold that silently encodes "deep". At a fixed depth there is real spread to cut
// on -- at steps=12 the bbox ranges 0.0078 to 0.0938, a factor of twelve.
//
// /!\ WHAT IT DOES NOT DO: claim that the samples it flags are bad. Nothing here measures
// whether a small footprint makes later folds trivial -- that was the original worry and it is
// still untested. This is a documented, reproducible convention for trimming a tail, and the
// manifest records which samples it removed so anyone can put them back.
//
// The batch is NOT modified. A release list is written beside it; nothing is deleted.
//
//   node release.mjs <batch-dir> [--bottom 0.1] [--keep-flags repeated_halving,no_coupling,single_angle]
import fs from "fs";
import path from "path";

const argv = process.argv.slice(2);
const dir = argv.find(a => !a.startsWith("--"));
const num = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : Number(argv[i + 1]); };
const str = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
if (!dir) { console.error("usage: node release.mjs <batch-dir> [--bottom 0.1]"); process.exit(1); }

const BOTTOM = num("bottom", 0.1);
// The per-sample flags that ARE real degeneracy tests. On out/batch1 all three fire zero times,
// so applying them costs nothing there -- which is the point: they are cheap insurance against
// a future batch, not a filter tuned to make this one look good.
const HARD_FLAGS = String(str("keep-flags", "repeated_halving,no_coupling,single_angle"))
    .split(",").filter(Boolean);

const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const samples = manifest.samples ?? [];
if (!samples.length) { console.error("no samples in manifest"); process.exit(1); }

// group by fold count, so every comparison is between sequences of the same length
const byDepth = new Map();
for (const s of samples) {
    const d = s.metrics.steps;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(s);
}

const excluded = new Map();                             // id -> reason
for (const s of samples)
    for (const f of HARD_FLAGS)
        if (s.metrics.flags?.[f]) excluded.set(s.id, `flag:${f}`);

// A quantile over a handful of samples is not a quantile, and grouping on the exact fold count
// leaves most groups at two to eight samples -- the first version of this cut three samples out
// of a hundred and twenty, which is a gesture, not a policy. So ADJACENT fold counts are merged
// until a bin holds at least MIN_BIN. The bins stay narrow (typically one to three folds), which
// keeps the comparison very nearly depth-free, and they are reported so the width is visible
// rather than assumed.
const MIN_BIN = num("min-bin", 10);
const depths = [...byDepth.keys()].sort((a, b) => a - b);
const bins = [];
let cur = null;
for (const d of depths) {
    if (!cur) cur = { lo: d, hi: d, items: [] };
    cur.hi = d;
    cur.items.push(...byDepth.get(d));
    if (cur.items.length >= MIN_BIN) { bins.push(cur); cur = null; }
}
// a trailing remainder joins the previous bin rather than being left uncut
if (cur) { if (bins.length) { const b = bins[bins.length - 1]; b.hi = cur.hi; b.items.push(...cur.items); }
           else bins.push(cur); }

for (const b of bins) {
    const sorted = [...b.items].sort((x, y) => x.metrics.bbox_area_final - y.metrics.bbox_area_final);
    const cut = Math.floor(b.items.length * BOTTOM);
    const label = b.lo === b.hi ? `${b.lo} folds` : `${b.lo}-${b.hi} folds`;
    for (const s of sorted.slice(0, cut))
        if (!excluded.has(s.id)) excluded.set(s.id, `bottom ${(100 * BOTTOM).toFixed(0)}% of bbox at ${label}`);
}

const kept = samples.filter(s => !excluded.has(s.id));
const q = (xs, p) => { const a = [...xs].sort((x, y) => x - y);
                       return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };

console.log(`${path.basename(dir)}: ${samples.length} samples -> ${kept.length} released, ${excluded.size} held back\n`);
console.log(`${"bin".padStart(9)} ${"n".padStart(4)} ${"kept".padStart(5)} ${"bbox p50".padStart(9)} ${"creases p50".padStart(12)}`);
for (const b of bins) {
    const k = b.items.filter(s => !excluded.has(s.id));
    const label = b.lo === b.hi ? `${b.lo}` : `${b.lo}-${b.hi}`;
    console.log(`${label.padStart(9)} ${String(b.items.length).padStart(4)} ${String(k.length).padStart(5)} ` +
                `${String(q(k.map(s => s.metrics.bbox_area_final), .5) ?? "-").padStart(9)} ` +
                `${String(q(k.map(s => s.metrics.crease_edges), .5) ?? "-").padStart(12)}`);
}
const reasons = {};
for (const r of excluded.values()) { const k = r.split(" at ")[0]; reasons[k] = (reasons[k] || 0) + 1; }
console.log(`\nheld back by reason:`);
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(44)} ${v}`);
console.log(`\n/!\\ "held back" is a convention, not a verdict: nothing here measures whether a small`);
console.log(`    footprint makes the later folds trivial. The list below is reversible.`);

const out = path.join(dir, "release.json");
fs.writeFileSync(out, JSON.stringify(
    { generated: new Date().toISOString(), batch: path.basename(dir),
      policy: { bottom_quantile_of_bbox_within_each_fold_bin: BOTTOM, min_bin: MIN_BIN,
                 bins: bins.map(b => ({ folds: [b.lo, b.hi], n: b.items.length })), hard_flags: HARD_FLAGS },
      note: "collapsed is deliberately NOT used as a filter: it is an absolute bbox threshold and " +
            "therefore a depth proxy -- it flags 0/17 of 4-6 fold samples and 40/40 of the hard stratum.",
      released: kept.map(s => s.id),
      held_back: [...excluded.entries()].map(([id, reason]) => ({ id, reason })) }, null, 1) + "\n");
console.log(`\n-> ${path.relative(process.cwd(), out)}`);
