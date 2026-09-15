// EXPERIMENT 2 — the cheap oracle on INDUCED PARTIAL ASSIGNMENTS.
//
// Experiment 1 only covers CPs that are unsatisfiable at the full M/V assignment.
// The case we actually care about is different: a *partial* commitment (some layer
// orders decided, the rest open) that has already doomed the puzzle. That is what a
// fold-sequence prefix produces, and what "pruning" must detect.
//
// Proxy used here: start from the propagated BA0, pick k still-unassigned B
// variables uniformly at random, assign each a random order, then ask both oracles.
//   FALSE POSITIVE = propagation passes, but complete search proves UNSAT.
//   FP rate = (missed unsat) / (all unsat)   <- conditional on genuinely unsat
//
// CAVEAT (stated in the notes, not hidden): a real fold-sequence prefix fixes a
// STRUCTURED set of variables, not a uniformly random one. This measures an upper
// bound on how easy the detection problem is under a random-commitment distribution.
import fs from "fs"; import path from "path";
import { EXDIR, build, propagate, complete, loadFold, rng } from "./lib.mjs";

const MAXFACES = +(process.env.MAXFACES ?? 150);
const NCP      = +(process.env.NCP ?? 40);
const TRIALS   = +(process.env.TRIALS ?? 20);
const KS       = (process.env.KS ?? "1,2,4,8,16").split(",").map(Number);
const rand = rng(20260914);

// pick CPs: satisfiable, small, and with genuine freedom (states > 1)
const cands = [];
for (const set of ["grids", "instagram"]) {
    const rows = fs.readFileSync(path.join(EXDIR, `${set}_data.csv`), "utf8").trim().split("\n");
    const h = rows[0].split(","), iN=h.indexOf("number"), iF=h.indexOf("faces"), iS=h.indexOf("states");
    const files = fs.readdirSync(path.join(EXDIR, set)).filter(f => f.endsWith(".fold"));
    const byNum = new Map(files.map(f => [f.slice(0,3), f]));
    for (const r of rows.slice(1)) {
        const c = r.split(",");
        if (+c[iF] <= MAXFACES && BigInt(c[iS]) > 1n && byNum.has(c[iN]))
            cands.push(path.join(EXDIR, set, byNum.get(c[iN])));
    }
}
cands.sort();
const chosen = [];
for (let i = 0; i < cands.length && chosen.length < NCP; i++)
    if (rand() < NCP / cands.length * 1.6) chosen.push(cands[i]);
console.log(`candidate CPs (faces<=${MAXFACES}, states>1): ${cands.length}; using ${chosen.length}`);

const agg = new Map(KS.map(k => [k, {unsat:0, caught:0, missed:0, sat:0, tProp:0, tComp:0, nComp:0}]));
let done = 0;
const t00 = performance.now();
for (const fp of chosen) {
    let inst, base;
    try {
        inst = build(loadFold(fp));
        const p0 = propagate(inst, inst.BA0.slice());
        if (!p0.ok) continue;                       // skip: unsat before we start
        base = p0.BA;
    } catch (e) { continue; }
    const free = [];
    for (let i = 0; i < base.length; i++) if (base[i] === 0) free.push(i);
    if (free.length < Math.max(...KS)) continue;

    for (const k of KS) {
        const a = agg.get(k);
        for (let t = 0; t < TRIALS; t++) {
            const BA = base.slice();
            const picked = new Set();
            while (picked.size < k) picked.add(free[Math.floor(rand()*free.length)]);
            for (const i of picked) BA[i] = (rand() < 0.5) ? 1 : 2;

            const t0 = performance.now();
            const p = propagate(inst, BA);
            a.tProp += performance.now() - t0;
            if (!p.ok) { a.unsat++; a.caught++; continue; }   // cheap oracle caught it

            const t1 = performance.now();
            const c = complete(inst, p.BA.slice(), p.tc, 1);
            a.tComp += performance.now() - t1; a.nComp++;
            if (c.sat) a.sat++; else { a.unsat++; a.missed++; }
        }
    }
    if (++done % 10 === 0) console.log(`  ...${done}/${chosen.length} CPs (${((performance.now()-t00)/1000).toFixed(1)}s)`);
}

console.log("\n k | trials  sat   unsat | caught-by-prop   MISSED (false pos) | avg prop ms  avg complete ms");
console.log("-".repeat(96));
for (const k of KS) {
    const a = agg.get(k), n = a.sat + a.unsat;
    const fp = a.unsat ? 100*a.missed/a.unsat : NaN;
    console.log(`${String(k).padStart(2)} | ${String(n).padStart(6)} ${String(a.sat).padStart(5)} ${String(a.unsat).padStart(7)} | ${String(a.caught).padStart(9)} ${(a.unsat?(100*a.caught/a.unsat).toFixed(1):"-").padStart(7)}%  | ${String(a.missed).padStart(6)} ${(a.unsat?fp.toFixed(1):"-").padStart(7)}%      | ${(a.tProp/Math.max(n,1)).toFixed(2).padStart(8)}  ${(a.nComp?(a.tComp/a.nComp).toFixed(2):"-").padStart(10)}`);
}
console.log(`\ntotal wall clock: ${((performance.now()-t00)/1000).toFixed(1)}s`);
