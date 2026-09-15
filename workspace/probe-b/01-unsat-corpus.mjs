// EXPERIMENT 1 — the cheap oracle on REAL unsatisfiable crease patterns.
//
// Question: when a CP genuinely has no valid flat-folded state, does the cheap
// PROPAGATION oracle detect it, or does it take the expensive COMPLETE oracle?
// "propagation says fine, but there is no solution" = a FALSE POSITIVE of the
// cheap oracle, and every such case is one the LLM would also have to catch.
//
// Corpus: examples/unsatisfiable/ — 12 CPs the Flat-Folder author shipped
// precisely because they have no solution. Real distribution, no synthesis.
import fs from "fs"; import path from "path";
import { EXDIR, build, propagate, complete, loadFold } from "./lib.mjs";

const dir = path.join(EXDIR, "unsatisfiable");
const files = fs.readdirSync(dir).filter(f => f.endsWith(".fold") || f.endsWith(".opx")).sort();

let caughtByProp = 0, caughtOnlyByComplete = 0, actuallySat = 0, errored = 0;
console.log("file                                   faces  vars | propagation      complete");
console.log("-".repeat(92));
for (const f of files) {
    let inst;
    try { inst = build(loadFold(path.join(dir, f))); }
    catch (e) { console.log(`${f.padEnd(38)}  (build error: ${e.message})`); errored++; continue; }

    const t0 = performance.now();
    const p = propagate(inst, inst.BA0.slice());
    const tp = performance.now() - t0;

    if (!p.ok) {
        console.log(`${f.slice(0,37).padEnd(38)} ${String(inst.faces).padStart(5)} ${String(inst.vars).padStart(5)} | CONFLICT ${tp.toFixed(1).padStart(6)}ms  (not run)`);
        caughtByProp++; continue;
    }
    const t1 = performance.now();
    const c = complete(inst, p.BA.slice(), p.tc, 1);
    const tc = performance.now() - t1;
    if (c.sat) { actuallySat++; console.log(`${f.slice(0,37).padEnd(38)} ${String(inst.faces).padStart(5)} ${String(inst.vars).padStart(5)} | pass     ${tp.toFixed(1).padStart(6)}ms  SATISFIABLE ${tc.toFixed(1)}ms  <-- unexpected`); }
    else { caughtOnlyByComplete++; console.log(`${f.slice(0,37).padEnd(38)} ${String(inst.faces).padStart(5)} ${String(inst.vars).padStart(5)} | pass     ${tp.toFixed(1).padStart(6)}ms  UNSAT ${tc.toFixed(1).padStart(8)}ms  <-- FALSE POSITIVE`); }
}
const unsat = caughtByProp + caughtOnlyByComplete;
console.log("-".repeat(92));
console.log(`truly unsatisfiable instances: ${unsat}   (satisfiable: ${actuallySat}, build errors: ${errored})`);
if (unsat > 0) {
    console.log(`  caught by cheap propagation : ${caughtByProp}/${unsat} = ${(100*caughtByProp/unsat).toFixed(1)}%  (recall of cheap oracle)`);
    console.log(`  missed, needed full search  : ${caughtOnlyByComplete}/${unsat} = ${(100*caughtOnlyByComplete/unsat).toFixed(1)}%  (FALSE POSITIVE RATE)`);
}
