// Does a bigger budget finish the search? -- the experiment that settles the question.
//
// THE CLAIM UNDER TEST, and it is a fair one: BFS and DFS are complete, so a TIMEOUT is a
// statement about our budget rather than about the problem. Give the search enough queries and
// every instance resolves; reporting "2 solved" is therefore reporting the budget.
//
// That claim is right in principle and the whole question is the constant. So rather than argue
// it, re-run the instances that actually timed out, at a much larger budget, and count how many
// convert to a definite verdict.
//
//   HIGH conversion  -> the budget was simply too small. Raise it everywhere and re-report,
//                       including the 0.5%-10.7% foldability interval, which would narrow.
//   LOW conversion   -> budget is not the bottleneck at these depths, and the cost curve rather
//                       than the solve rate is the result.
//
// /!\ WHAT THIS CANNOT TEST. A negative result here does not prove the instances are unsolvable;
// it bounds how far budget alone gets us. Nothing in the output may be reported as EXHAUSTED
// unless the search actually returned EXHAUSTED, which is a termination, not a budget stop.
//
// /!\ TIME. Each instance may burn the full budget. At the measured ~55k queries/sec a 50M
// budget is about 15 minutes per unresolved instance, so the default run is hours. Results are
// written after every instance, so killing it part way leaves usable data.
//
//   node budget-probe.mjs [--budget 50000000] [--depth 32] [--only substring]
import fs from "fs";
import os from "os";
import path from "path";
import { solve } from "./stage2.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const EX = path.join(os.homedir(), "Downloads/flat-folder-main/examples/instagram");
const argv = process.argv.slice(2);
const num = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : Number(argv[i + 1]); };
const str = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };

const BUDGET = num("budget", 50000000);
const DEPTH = num("depth", 32);
const ONLY = str("only", null);

// The instances to re-run are exactly the ones that hit the previous budget. Taking them from
// the recorded results rather than re-deriving them keeps the comparison honest: same CPs, same
// solver, one variable changed.
const prevPath = path.join(HERE, "stage2-results.json");
if (!fs.existsSync(prevPath)) {
    console.error("no stage2-results.json -- run stage2.mjs first, or this has nothing to re-run");
    process.exit(1);
}
const prev = JSON.parse(fs.readFileSync(prevPath, "utf8"));
const prevBudget = Math.max(...prev.filter(r => r.status === "TIMEOUT").map(r => r.queries));
let targets = prev.filter(r => r.status === "TIMEOUT");
if (ONLY) targets = targets.filter(r => r.f.includes(ONLY));

if (!targets.length) { console.error("no TIMEOUT rows to re-run"); process.exit(1); }
console.log(`${targets.length} instances timed out at ${prevBudget.toLocaleString()} queries.`);
console.log(`Re-running at ${BUDGET.toLocaleString()} (${(BUDGET / prevBudget).toFixed(0)}x), depth ${DEPTH}.\n`);

const rows = [];
const outPath = path.join(HERE, "budget-probe-results.json");
for (const t of targets) {
    const p = path.join(EX, t.f);
    if (!fs.existsSync(p)) { console.log(`  skip ${t.f}: not found`); continue; }
    const fold = JSON.parse(fs.readFileSync(p, "utf8"));
    const t0 = Date.now();
    let r;
    try { r = solve(fold, { maxQueries: BUDGET, maxDepth: DEPTH }); }
    catch (e) { r = { status: "ERROR", queries: 0, depth: 0, err: e.message }; }
    const ms = Date.now() - t0;
    const converted = r.status !== "TIMEOUT";
    rows.push({ f: t.f, before: t.status, beforeQueries: t.queries,
                after: r.status, queries: r.queries, depth: r.depth, ms, converted });
    console.log(`${t.f.slice(0, 44).padEnd(45)} ${t.status} -> ${r.status.padEnd(10)} ` +
                `${String(r.queries).padStart(11)} queries  ${(ms / 1000).toFixed(0)}s` +
                (converted ? "   CONVERTED" : ""));
    fs.writeFileSync(outPath, JSON.stringify(
        { generated: new Date().toISOString(), previousBudget: prevBudget, budget: BUDGET,
          depth: DEPTH, rows }, null, 1) + "\n");
}

const conv = rows.filter(r => r.converted);
const tally = {};
for (const r of rows) tally[r.after] = (tally[r.after] || 0) + 1;
console.log(`\n=== ${conv.length} of ${rows.length} converted at ${(BUDGET / prevBudget).toFixed(0)}x the budget ===`);
for (const k of Object.keys(tally).sort()) console.log(`  ${k.padEnd(12)} ${tally[k]}`);

if (conv.length) {
    const qs = conv.map(r => r.queries).sort((a, b) => a - b);
    console.log(`\nqueries the converted ones needed: min ${qs[0].toLocaleString()} ` +
                `median ${qs[Math.floor(qs.length / 2)].toLocaleString()} ` +
                `max ${qs[qs.length - 1].toLocaleString()}`);
    console.log(`  -> all of these were previously reported as unknown. If this fraction is`);
    console.log(`     large, the earlier budget was the binding constraint and every number`);
    console.log(`     derived from it has to be restated, including the 0.5%-10.7% interval.`);
} else {
    console.log(`\nNothing converted. Budget is not the binding constraint at these depths --`);
    console.log(`which is a result, not a failure, and it is the one the cost curve reports.`);
}
console.log(`\n-> ${path.relative(process.cwd(), outPath)}`);
