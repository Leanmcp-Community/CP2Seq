// Independent replay check for a found sequence.
//
// The search reports SOLVED when its coverage set fills up, which is a claim the search makes
// about its own bookkeeping. This replays the sequence from the flat square through applyFold
// and checks the result against the CP directly:
//
//   1. every fold in the sequence is legal (applyFold accepts it)
//   2. the creases produced cover EVERY crease of the CP
//   3. no fold ever produced a crease the CP does not contain (applyFold enforces this, so a
//      legal replay is already proof of it -- stated here because it is half the claim)
//
// Usage: node DHEERAJ_WORKSPACE/baseline/verify.mjs <file.fold> [algo] [budget] [depth]
import fs from "fs"; import path from "path";
import { applyFold, ID } from "../../workspace/probe-c/stage2.mjs";
import { ALGOS, prepare } from "./search.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const IG = process.env.INSTAGRAM_DIR || path.join(HERE, "../data/instagram");

const file = process.argv[2];
const algo = process.argv[3] ?? "dfs";
const budget = Number(process.argv[4] ?? 400000);
const depth = Number(process.argv[5] ?? 16);

const full = fs.existsSync(file) ? file : path.join(IG, file);
const fold = JSON.parse(fs.readFileSync(full, "utf8"));

console.log(`${path.basename(full)}  algo=${algo} budget=${budget.toLocaleString()} depth=${depth}\n`);
const r = ALGOS[algo](fold, { maxQueries: budget, maxDepth: depth, maxNodes: 300000, tolerance: process.env.SNAP_TOL ? Number(process.env.SNAP_TOL) : undefined });
console.log(`search: ${r.status}  queries=${r.queries.toLocaleString()}  steps=${r.steps}`);
if (r.status !== "SOLVED") { console.log("\nnothing to verify."); process.exit(0); }

// --- replay, from the flat sheet, using only the recorded (line, direction) pairs -----------
const p = prepare(fold, { tolerance: process.env.SNAP_TOL ? Number(process.env.SNAP_TOL) : undefined });
let state = p.start;
const covered = new Set();
console.log(`\nreplaying ${r.seq.length} folds from the flat square:`);

for (const [i, m] of r.seq.entries()) {
    const dir = [-m.n[1], m.n[0]];
    const line = { n: m.n, d: m.d, dir };
    const out = applyFold(state, line, m.movePositive, p.target);
    if (!out) {
        console.log(`  step ${i + 1}: ILLEGAL — replay rejected the fold. THE SOLUTION IS NOT REAL.`);
        process.exit(1);
    }
    for (const s of out.cover) covered.add(s.idx);
    state = out.state;
    console.log(`  step ${String(i + 1).padStart(2)}: line n=(${m.n[0].toFixed(4)},${m.n[1].toFixed(4)}) ` +
                `d=${m.d.toFixed(4)} move=${m.movePositive ? "+" : "-"}  ` +
                `layers=${String(state.length).padStart(3)}  creases covered ${covered.size}/${p.total}`);
}

const ok = covered.size === p.total;
console.log(`\ncoverage: ${covered.size}/${p.total} target crease segments`);
console.log(ok
    ? `VERIFIED — the sequence is legal at every step and reproduces the CP exactly.\n` +
      `  (applyFold rejects any fold that creates a crease absent from the CP, so a legal\n` +
      `   replay that also covers everything means the crease sets are equal, not merely\n` +
      `   overlapping.)`
    : `NOT VERIFIED — replay left ${p.total - covered.size} crease segments uncovered.`);
process.exit(ok ? 0 : 1);
