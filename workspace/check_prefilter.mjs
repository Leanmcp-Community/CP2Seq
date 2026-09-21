// Does the cheap-rejection shortcut change anything the caller can see?
//
// The shortcut in legal_folds.mjs skips tryFold for candidates whose fold line misses the
// selected run entirely. It is only safe if the enumeration it returns is IDENTICAL to the
// one the full path returns -- same legal folds, same order, same equivalent_actions, same
// rejected_summary, same counts. This asserts exactly that, state by state, along each
// sample's reference sequence, and reports the speedup it buys at each depth.
//
// Compared by deep equality on the whole returned object, not on a summary of it: a check
// that looked only at the actions would miss a changed rejection tally, and the tally is what
// the shortcut most plausibly breaks.
//
//   node workspace/check_prefilter.mjs easy-0001 easy-0003 mid-0001
//   node workspace/check_prefilter.mjs --budget 120 hard-0001
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {replay, actionFromFold} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalFolds} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CORPUS = process.env.CORPUS_DIR ?? join(ROOT, 'workspace/corpus/out/release/all-layers/samples');

const argv = process.argv.slice(2);
const flag = (n, f) => { const i = argv.indexOf(n); return i === -1 ? f : Number(argv.splice(i, 2)[1]); };
const budget = flag('--budget', 300);
const samples = argv.filter(a => !a.startsWith('--'));
if (!samples.length) { console.error('usage: node workspace/check_prefilter.mjs [--budget S] <sample-id>...'); process.exit(2); }

function loadCp(id) {
  const raw = JSON.parse(readFileSync(join(CORPUS, id, 'cp.fold'), 'utf8'));
  return {file_spec: 1.1, frame_classes: ['creasePattern'], vertices_coords: raw.vertices_coords,
          edges_vertices: raw.edges_vertices, edges_assignment: raw.edges_assignment};
}

// include_rejected is deliberately OFF here: it is the only thing the shortcut is allowed to
// add to the output, so comparing with it off is comparing what the model actually receives.
const OPTS = {max_results: 500};
const pad = (v, n) => String(v).padEnd(n);
let failures = 0, totalSlow = 0, totalFast = 0;

for (const id of samples) {
  const cp = loadCp(id);
  const folds = JSON.parse(readFileSync(join(CORPUS, id, 'seq.json'), 'utf8')).folds.map(actionFromFold);
  console.log(`\n${id}  reference ${folds.length} folds`);
  console.log(`  ${pad('depth', 7)}${pad('stack', 7)}${pad('legal', 7)}${pad('full ms', 11)}${pad('fast ms', 11)}${pad('speedup', 10)}identical`);
  const started = Date.now();
  for (let d = 0; d <= folds.length; d++) {
    if ((Date.now() - started) / 1000 > budget) { console.log(`  [budget ${budget}s reached at depth ${d}]`); break; }
    const session = replay(cp, folds.slice(0, d).map(a => ({...a})));
    const t0 = performance.now();
    const slow = enumerateLegalFolds(session, {...OPTS, prefilter: false});
    const t1 = performance.now();
    const fast = enumerateLegalFolds(session, {...OPTS, prefilter: true});
    const t2 = performance.now();
    const a = JSON.stringify(slow), b = JSON.stringify(fast);
    const same = a === b;
    if (!same) failures++;
    totalSlow += t1 - t0; totalFast += t2 - t1;
    console.log(`  ${pad(d, 7)}${pad(slow.stack_size, 7)}${pad(slow.distinct_legal_folds, 7)}` +
      `${pad((t1 - t0).toFixed(1), 11)}${pad((t2 - t1).toFixed(1), 11)}` +
      `${pad(((t1 - t0) / Math.max(0.001, t2 - t1)).toFixed(1) + 'x', 10)}${same ? 'yes' : 'NO  <<<<'}`);
    if (!same) {
      // Name the first differing key rather than printing two large objects.
      for (const k of new Set([...Object.keys(slow), ...Object.keys(fast)])) {
        const x = JSON.stringify(slow[k]), y = JSON.stringify(fast[k]);
        if (x !== y) console.log(`      key "${k}" differs:\n        full: ${String(x).slice(0, 200)}\n        fast: ${String(y).slice(0, 200)}`);
      }
    }
  }
}

console.log(`\n  total: full ${(totalSlow / 1000).toFixed(1)}s, fast ${(totalFast / 1000).toFixed(1)}s, ` +
            `${(totalSlow / Math.max(0.001, totalFast)).toFixed(1)}x overall`);
console.log(failures ? `\n  ${failures} state(s) DIFFER -- the shortcut is not sound as written` :
                       '\n  every state identical with and without the shortcut');
process.exit(failures ? 1 : 0);
