// STEP 0 — harness validation.
// Recompute the `states` count for a sample of CPs and compare against the
// numbers the Flat-Folder author shipped in examples/*_data.csv.
// If these do not match exactly, nothing downstream can be trusted.
import fs from "fs"; import path from "path";
import { EXDIR, build, propagate, complete, loadFold } from "./lib.mjs";

const want = new Map();                       // "set/number" -> states (BigInt)
for (const set of ["grids", "instagram"]) {
    const rows = fs.readFileSync(path.join(EXDIR, `${set}_data.csv`), "utf8").trim().split("\n");
    const hdr = rows[0].split(",");
    const iN = hdr.indexOf("number"), iS = hdr.indexOf("states"), iF = hdr.indexOf("faces");
    for (const r of rows.slice(1)) {
        const c = r.split(",");
        want.set(`${set}/${c[iN]}`, { states: BigInt(c[iS]), faces: +c[iF] });
    }
}

const N = +(process.argv[2] ?? 12);
const ONLY = process.argv[3];
let checked = 0, ok = 0;
for (const set of (ONLY ? [ONLY] : ["grids", "instagram"])) {
    const files = fs.readdirSync(path.join(EXDIR, set)).filter(f => f.endsWith(".fold")).sort();
    for (const f of files) {
        if (checked >= N) break;
        const num = f.slice(0, 3);
        const exp = want.get(`${set}/${num}`);
        if (!exp || exp.faces > 120) continue;          // keep validation fast
        const inst = build(loadFold(path.join(EXDIR, set, f)));
        const p = propagate(inst, inst.BA0.slice());
        if (!p.ok) { console.log(`${set}/${num} PROPAGATION CONFLICT (csv says ${exp.states})`); checked++; continue; }
        const c = complete(inst, p.BA.slice(), p.tc, Infinity);
        const got = c.sat ? c.GA.reduce((s, A) => s * BigInt(A.length), 1n) : 0n;
        const match = got === exp.states;
        if (match) ok++;
        console.log(`${match ? "OK  " : "FAIL"} ${set}/${num}  faces=${exp.faces}  csv=${exp.states}  recomputed=${got}`);
        checked++;
    }
}
console.log(`\n=== ${ok}/${checked} exact matches ===`);
process.exit(ok === checked ? 0 : 1);
