// EXPERIMENT 3 — does the solver ever actually backtrack?
//
// Experiments 1 and 2 found a 0% false-positive rate for the cheap propagation
// oracle. Before believing that, test the alternative explanation: maybe these
// instances need no search at all, so nothing can ever be "missed".
//
// In guess_vars, SOLVER.propagate(...) returning [] is exactly the dead-end
// signal that sets backtracking = true. Counting those calls counts dead ends.
// Instrumented by wrapping the method -- the author's source is NOT modified.
//
// lim=1 => count dead ends on the way to the FIRST solution, i.e. "could a
// greedy, never-backtracking strategy have found a folded state?"
import fs from "fs"; import path from "path";
import { EXDIR, build, propagate, complete, loadFold, SOLVER } from "./lib.mjs";

const orig = SOLVER.propagate;
let deadEnds = 0, calls = 0;
SOLVER.propagate = (...args) => { const r = orig(...args); calls++; if (r.length === 0) deadEnds++; return r; };

const MAXFACES = +(process.env.MAXFACES ?? 400);
const rows = [];
for (const set of ["grids", "instagram"]) {
    const csv = fs.readFileSync(path.join(EXDIR, `${set}_data.csv`), "utf8").trim().split("\n");
    const h = csv[0].split(","), iN=h.indexOf("number"), iF=h.indexOf("faces"), iS=h.indexOf("states");
    const files = fs.readdirSync(path.join(EXDIR, set)).filter(f => f.endsWith(".fold"));
    const byNum = new Map(files.map(f => [f.slice(0,3), f]));
    for (const r of csv.slice(1)) {
        const c = r.split(",");
        if (+c[iF] <= MAXFACES && byNum.has(c[iN]))
            rows.push({ set, num: c[iN], faces: +c[iF], states: BigInt(c[iS]), fp: path.join(EXDIR, set, byNum.get(c[iN])) });
    }
}
console.log(`CPs with faces<=${MAXFACES}: ${rows.length}`);

let nDeadEndCPs = 0, nOK = 0, nErr = 0, totalDead = 0, maxDead = 0, worst = null;
const t0 = performance.now();
for (const r of rows) {
    let inst;
    try { inst = build(loadFold(r.fp)); } catch (e) { nErr++; continue; }
    const p = propagate(inst, inst.BA0.slice());
    if (!p.ok) continue;                       // unsat before search
    deadEnds = 0; calls = 0;
    const c = complete(inst, p.BA.slice(), p.tc, 1);   // first solution only
    if (!c.sat) continue;
    nOK++; totalDead += deadEnds;
    if (deadEnds > 0) nDeadEndCPs++;
    if (deadEnds > maxDead) { maxDead = deadEnds; worst = r; }
}
console.log(`\nsolved (first solution, lim=1): ${nOK}   build errors: ${nErr}`);
console.log(`CPs where the solver hit >=1 dead end : ${nDeadEndCPs}/${nOK} = ${(100*nDeadEndCPs/nOK).toFixed(1)}%`);
console.log(`total dead ends across all CPs        : ${totalDead}`);
console.log(`max dead ends in a single CP          : ${maxDead}${worst ? `  (${worst.set}/${worst.num}, faces=${worst.faces}, states=${worst.states})` : ""}`);
console.log(`wall clock: ${((performance.now()-t0)/1000).toFixed(1)}s`);
