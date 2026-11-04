// Why did the reverse enumerator miss a predecessor it should have proposed?
//
// The reference sequence names the true fold at every step, so the true (over, run, line) is
// known and the proposal pipeline can be checked stage by stage instead of guessed at.
//
//   node workspace/reverse_diag.mjs easy-0003 10
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FoldSession, actionFromFold, tryFold, actionLine} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalUnfolds, exactKey} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_unfolds.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CORPUS = process.env.CORPUS_DIR ?? join(ROOT, 'workspace/corpus/out/release/all-layers/samples');
const [id, stepArg] = process.argv.slice(2);
const dir = join(CORPUS, id);
const raw = JSON.parse(readFileSync(join(dir, 'cp.fold'), 'utf8'));
const cp = {file_spec: 1.1, frame_classes: ['creasePattern'], vertices_coords: raw.vertices_coords,
            edges_vertices: raw.edges_vertices, edges_assignment: raw.edges_assignment};
const folds = JSON.parse(readFileSync(join(dir, 'seq.json'), 'utf8')).folds;

const session = new FoldSession(cp);
const states = [{faces: session.paper.faces, order: session.paper.order}];
for (const f of folds) {
  const r = session.apply(actionFromFold(f));
  if (!r.ok) throw Error(`reference replay failed: ${r.error}`);
  states.push({faces: session.paper.faces, order: session.paper.order});
}

const step = Number(stepArg ?? folds.length);
const before = states[step - 1], after = states[step];
const action = actionFromFold(folds[step - 1]);
console.log(`${id} step ${step}/${folds.length}`);
console.log(`  true action     ${JSON.stringify({...action, tool: undefined})}`);
console.log(`  true line       ${JSON.stringify(actionLine(action))}`);
console.log(`  layers          ${before.order.length} -> ${after.order.length}`);

// Which faces actually moved, and where they landed -- straight from the engine.
const v = tryFold(before.paper ?? before, cp, action);
console.log(`  tryFold         ok=${v.ok} creases=${v.ok ? v.fold.made.length : v.error} moved=${v.ok ? v.fold.moved : '-'} over=${v.ok ? v.fold.over : '-'}`);
if (v.ok) console.log(`  reproduces      ${exactKey(v.fold.state) === exactKey(after)}`);

const step_ = enumerateLegalUnfolds(after, cp, {max_placements: 64});
const want = exactKey(before);
const hit = step_.unfolds.findIndex(u => exactKey(u.state) === want);
console.log(`  proposed        ${step_.unfolds.length}  true predecessor at index ${hit}`);
console.log(`  rejected        ${JSON.stringify(step_.rejected_summary)}`);

// If it is still missing, the loss is upstream of tryFold: say which stage dropped it.
if (hit === -1) {
  const N = after.order.length;
  const over = v.ok ? v.fold.over : true;
  const movedCount = v.ok ? v.fold.moved : 0;
  console.log(`  --- expected run: over=${over} m=${movedCount} of ${N} layers`);
  const run = over ? after.order.slice(N - movedCount) : after.order.slice(0, movedCount);
  const moving = [...run].reverse();
  const stay = over ? after.order.slice(0, N - movedCount) : after.order.slice(movedCount);
  console.log(`  moving ranks    ${JSON.stringify(moving.map(i => after.order.indexOf(i)))}`);
  console.log(`  stay ranks      ${JSON.stringify(stay.map(i => after.order.indexOf(i))).slice(0, 120)}`);
  console.log(`  distinct stay placements ${new Set(stay.map(i => JSON.stringify(after.faces[i].T))).size} of ${stay.length}`);
  console.log(`  distinct move placements ${new Set(moving.map(i => JSON.stringify(after.faces[i].T))).size} of ${moving.length}`);
}

// HOW MANY PREDECESSORS DOES THIS STATE ACTUALLY HAVE?
//
// For an all-layers fold the stationary faces keep their relative order and the moving faces
// keep theirs, and the folded stack records the two sequences SEPARATELY -- stay parts below,
// the reversed moved run above. A face that was split is pinned, because its two halves share a
// rank. A face that moved WHOLLY is not pinned by anything. So every interleaving of the
// unpinned movers with the stationary layers is a distinct, equally valid predecessor, and the
// count is a product of binomials rather than a small number.
if (hit === -1 && v.ok) {
  const {mul, inv} = await import('../workspace/corpus/geom.mjs');
  const N = after.order.length, m = v.fold.moved, over = v.fold.over;
  const run = over ? after.order.slice(N - m) : after.order.slice(0, m);
  const moving = [...run].reverse();
  const stay = over ? after.order.slice(0, N - m) : after.order.slice(m);
  // A mover is pinned exactly when some stationary layer sits at the same placement once the
  // fold's reflection is undone -- that is its other half.
  const R = actionLine(action);
  const L = Math.hypot(R.n[0], R.n[1]);
  const refl = {a: 1 - 2 * (R.n[0] / L) ** 2, b: -2 * (R.n[0] / L) * (R.n[1] / L),
                c: -2 * (R.n[0] / L) * (R.n[1] / L), d: 1 - 2 * (R.n[1] / L) ** 2,
                e: 2 * (R.d / L) * (R.n[0] / L), f: 2 * (R.d / L) * (R.n[1] / L)};
  const key = T => ['a', 'b', 'c', 'd', 'e', 'f'].map(k => Math.round(T[k] / 1e-9)).join(',');
  const stayKeys = stay.map(i => key(after.faces[i].T));
  let pinned = 0;
  for (const mi of moving) if (stayKeys.includes(key(mul(refl, after.faces[mi].T)))) pinned++;
  const orphans = m - pinned;
  // Upper bound, generously: orphans spread over the stationary layers, order among them fixed.
  const choose = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; };
  console.log(`  --- predecessors for this ONE line/run`);
  console.log(`  split (pinned)  ${pinned}`);
  console.log(`  moved wholly    ${orphans}   <- unpinned, every rank among the stationary layers is valid`);
  console.log(`  interleavings   ~${choose(stay.length + orphans, orphans).toExponential(2)}`);
  console.log(`  max_placements  64 (the enumerator's cap) -- so it lists 64 of them`);
}
