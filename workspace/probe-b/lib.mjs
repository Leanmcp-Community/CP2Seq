// Shared harness: replicates batch.js `process_file` exactly, up to and including
// the two oracles we want to compare.
//   PROPAGATION oracle = SOLVER.initial_assignment  (cheap, incomplete)
//   COMPLETE    oracle = SOLVER.solve               (expensive, complete)
// Source of truth: ~/Downloads/flat-folder-main/src/batch.js lines 74-120.
import fs from "fs";
import os from "os";
import path from "path";

const SRC = path.join(os.homedir(), "Downloads/flat-folder-main/src");
export const EXDIR = path.join(os.homedir(), "Downloads/flat-folder-main/examples");

export const { M }      = await import(path.join(SRC, "math.js"));
export const { NOTE }   = await import(path.join(SRC, "note.js"));
export const { CON }    = await import(path.join(SRC, "constraints.js"));
export const { X }      = await import(path.join(SRC, "conversion.js"));
export const { SOLVER } = await import(path.join(SRC, "solver.js"));
NOTE.show = false;                       // headless: no logging
CON.build();   // REQUIRED: builds CON.implied. batch.js does this in main() before
               // any solving; omitting it makes SOLVER.infer throw.

// Deterministic PRNG (xorshift32) so every run is reproducible.
export function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// `initial_assignment` returns either the propagated BA (array of numbers)
// or a conflict triple [type, F, E] where F is an array of faces.
// batch.js tests `(out.length==3) && (out[0].length==undefined)`, which
// misfires when BF.length===3. Stricter, equivalent test used here:
export const isConflict = (out) =>
    out.length === 3 && typeof out[0] === "number" && Array.isArray(out[1]);

export function build(fold) {
    const V  = fold.vertices_coords;
    const EV = fold.edges_vertices;
    const EA = fold.edges_assignment;
    const FV = fold.faces_vertices;
    const [EF, FE] = X.EV_FV_2_EF_FE(EV, FV);
    const [Vf, Ff] = X.V_FV_EV_EA_2_Vf_Ff(V, FV, EV, EA);
    const L = EV.map((P) => M.expand(P, Vf));
    const [P, SP, SE, eps_i] = X.L_2_V_EV_EL(L);
    if (P.length === 0) throw new Error("precision: no stable graph");
    const [, CP] = X.V_EV_2_VV_FV(P, SP);
    const [SC] = X.EV_FV_2_EF_FE(SP, CP);
    const [CF, FC] = X.EF_FV_P_SP_SE_CP_SC_2_CF_FC(EF, FV, P, SP, SE, CP, SC);
    const BF = X.EF_SP_SE_CP_CF_2_BF(EF, SP, SE, CP, CF);
    const BI = new Map();
    for (const [i, F] of BF.entries()) BI.set(F, i);
    const BT = X.BF_BI_EF_SE_CF_SC_2_BT(BF, BI, EF, SE, CF, SC);
    const CC = X.FC_BF_BI_BT_2_CC(FC, BF, BI, BT);
    const BA0 = SOLVER.EF_EA_Ff_BF_BI_2_BA0(EF, EA, Ff, BF, BI);
    return { BF, BI, BT, CF, FC, CC, BA0, faces: FV.length, vars: BF.length };
}

// Cheap oracle. NOTE: mutates its BA argument -> always pass a copy.
export function propagate(inst, BA) {
    const tc = { all: 0, reduced: 0 };
    const out = SOLVER.initial_assignment(BA, inst.BF, inst.BT, inst.BI,
                                          inst.FC, inst.CF, inst.CC, tc);
    return isConflict(out) ? { ok: false, conflict: out } : { ok: true, BA: out, tc };
}

// Complete oracle. `lim` caps solutions per component; lim=1 is enough to
// decide satisfiability and is far cheaper than full enumeration.
// NOTE: solve -> guess_vars mutates BA -> always pass a copy.
export function complete(inst, BA, tc, lim) {
    const GB = SOLVER.get_components(inst.BI, inst.BF, inst.BT, BA,
                                     inst.FC, inst.CF, inst.CC, tc);
    const GA = SOLVER.solve(inst.BI, inst.BF, inst.BT, BA, GB,
                            inst.FC, inst.CF, inst.CC, lim);
    return Array.isArray(GA) ? { sat: true, GA } : { sat: false, badGroup: GA };
}

export const loadFold = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
