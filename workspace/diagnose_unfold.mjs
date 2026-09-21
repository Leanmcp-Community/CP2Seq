// Why does the unfold miss a predecessor? Four stages can fail, and they need different
// fixes, so the point of this is to say which one -- rather than guessing, which has now
// cost three wrong hypotheses (variant capping, insertion position, key canonicalisation).
//
// For each step of a reference sequence where predecessors() does not recover the true
// predecessor, it replays the forward fold to learn the ground truth and then checks, in
// order:
//   line      is the fold's line in the candidate set the unfold generates?
//   split     does the (run length, end) pair the unfold would try match the real one?
//   pairing   does every cut face find its sibling, by transform, parity and a shared edge?
//   assembly  does the rebuilt state equal the true predecessor, and if not, where?
// The first check that fails is the cause.
//
//   node workspace/diagnose_unfold.mjs easy-0003
//   node workspace/diagnose_unfold.mjs --step 4 easy-0003
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FoldSession, replay, actionFromFold, actionLine} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {foldLayers, currentPolys} from './corpus/fold-engine-layers.mjs';
import {mul, inv} from './corpus/geom.mjs';
import {predecessors, stateKey, candidateLines} from './unfold.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CORPUS = process.env.CORPUS_DIR ?? join(ROOT, 'workspace/corpus/out/release/all-layers/samples');
const argv = process.argv.slice(2);
const flag = (n, f) => { const i = argv.indexOf(n); return i === -1 ? f : Number(argv.splice(i, 2)[1]); };
const onlyStep = flag('--step', 0);
const samples = argv.filter(a => !a.startsWith('--'));
if (!samples.length) { console.error('usage: node workspace/diagnose_unfold.mjs [--step N] <sample-id>...'); process.exit(2); }

const TOL = 2e-6;
const vkey = p => `${Math.round(p[0] / TOL)},${Math.round(p[1] / TOL)}`;
const sameT = (A, B) => ['a', 'b', 'c', 'd', 'e', 'f'].every(k => Math.abs(A[k] - B[k]) < TOL);
const sharesEdge = (A, B) => {
  for (let i = 0; i < A.length; i++) {
    const a0 = A[i], a1 = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const b0 = B[j], b1 = B[(j + 1) % B.length];
      if (vkey(a0) === vkey(b1) && vkey(a1) === vkey(b0)) return true;
    }
  }
  return false;
};
const reflectUnit = ([nx, ny], d) => ({
  a: 1 - 2 * nx * nx, b: -2 * nx * ny, c: -2 * nx * ny, d: 1 - 2 * ny * ny,
  e: 2 * d * nx, f: 2 * d * ny});

for (const id of samples) {
  const raw = JSON.parse(readFileSync(join(CORPUS, id, 'cp.fold'), 'utf8'));
  const cp = {file_spec: 1.1, frame_classes: ['creasePattern'], vertices_coords: raw.vertices_coords,
              edges_vertices: raw.edges_vertices, edges_assignment: raw.edges_assignment};
  const actions = JSON.parse(readFileSync(join(CORPUS, id, 'seq.json'), 'utf8')).folds.map(actionFromFold);
  console.log(`\n${id}`);

  for (let i = 1; i <= actions.length; i++) {
    if (onlyStep && i !== onlyStep) continue;
    const before = replay(cp, actions.slice(0, i - 1).map(a => ({...a}))).paper;
    const after = replay(cp, actions.slice(0, i).map(a => ({...a}))).paper;
    const wanted = stateKey(before);
    if (predecessors(after, cp).some(p => stateKey(p.paper) === wanted)) continue;

    const a = actions[i - 1];
    const line = actionLine(a);
    const L = Math.hypot(line.n[0], line.n[1]);
    const n = [line.n[0] / L, line.n[1] / L], d = line.d / L;
    const truth = foldLayers(before, line, a.move_positive, {mode: 'all'}, a.over);

    const problems = [];

    // 1. line
    const lines = candidateLines(after, cp);
    const lineFound = lines.some(l =>
      Math.abs(Math.abs(l.n[0] * n[0] + l.n[1] * n[1]) - 1) < 1e-6 &&
      Math.abs(Math.abs(l.d) - Math.abs(d)) < 1e-6);
    if (!lineFound) problems.push(`line: the fold line is NOT in the ${lines.length} candidates`);

    // 2. split
    const N = after.order.length, k = truth.moved, end = truth.over ? 'top' : 'bottom';
    if (!(k >= 1 && k < N)) problems.push(`split: the run is ${k} of ${N} layers, outside the 1..N-1 the unfold tries`);

    // 3. pairing
    const movedRun = truth.over ? after.order.slice(N - k) : after.order.slice(0, k);
    const rest = truth.over ? after.order.slice(0, N - k) : after.order.slice(k);
    const movingIdx = [...movedRun].reverse();
    const faces = after.faces.map(f => ({...f}));
    const R = reflectUnit(n, d);
    for (const mi of movingIdx) {
      const f = faces[mi];
      const T = mul(R, f.T);
      faces[mi] = {poly: f.poly, T, inv: inv(T), par: 1 - f.par};
    }
    const consumed = new Set();
    let unpaired = 0;
    for (const si of rest) {
      const mi = movingIdx.find(m => !consumed.has(m) && sameT(faces[m].T, faces[si].T) &&
                                     faces[m].par === faces[si].par && sharesEdge(faces[si].poly, faces[m].poly));
      if (mi === undefined) unpaired++; else consumed.add(mi);
    }
    const creases = truth.made.length;
    if (unpaired) problems.push(`pairing: ${unpaired} of ${rest.length} stationary faces found no sibling (the fold made ${creases} creases)`);

    // 4. assembly
    const leftover = movingIdx.filter(m => !consumed.has(m));
    if (!problems.length) {
      const truePos = before.order.map((fi, idx) => leftover.includes(fi) ? idx : -1).filter(x => x >= 0);
      problems.push(`assembly: line, split and pairing all fine. ` +
        `${leftover.length} face(s) moved whole; the true predecessor keeps them at ` +
        `${truePos.length ? 'positions ' + truePos.join(',') : 'positions unknown'} of ${before.order.length}`);
    }

    console.log(`  step ${String(i).padEnd(3)} layers ${String(before.order.length)}->${after.order.length}, ` +
                `over=${truth.over}, moved=${k}, creases=${creases}`);
    for (const p of problems) console.log(`    ${p}`);
  }
}
