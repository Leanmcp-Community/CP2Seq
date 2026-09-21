// Smoke check for the legal-fold enumerator. Not the soundness test -- that one is specified
// in TODO.md and belongs next to test_partial_folds.mjs. This just answers "does it run, and
// does it obey its own guarantee on a couple of samples".
//
//   node workspace/check_legal_folds.mjs
//   node workspace/check_legal_folds.mjs easy-0001 easy-0005 mid-0001
//
// Pure node: no Playwright, no model, no network. Reference sequences are read only to check
// that the enumerator contains them; nothing here feeds a prompt.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {planarize} from '../workspace/corpus/planarize.mjs';
import {currentPolys} from '../workspace/corpus/fold-engine-layers.mjs';
import {FoldSession, replay, actionFromFold} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalFolds} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CORPUS = join(ROOT, 'workspace/corpus/out/release/all-layers/samples');
const samples = process.argv.slice(2).length ? process.argv.slice(2) : ['easy-0001', 'easy-0002'];

let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };
const stateKey = (session) => currentPolys(session.paper)
    .map(l => l.par + ':' + l.poly.map(p => `${Math.round(p[0] / 2e-6)},${Math.round(p[1] / 2e-6)}`).join(' '))
    .join('|');

// Every action the tool prints -- the representative AND every merged alternative -- must be
// accepted by add_fold's own path from a freshly replayed session. That is the guarantee the
// tool states to the model, and the alternatives are part of it.
const spellings = (entry) => [entry.action, ...(entry.equivalent_actions ?? [])];

function checkListIsAccepted(cp, prefix, label) {
  const session = replay(cp, prefix);
  const started = performance.now();
  const e = enumerateLegalFolds(session, {max_results: 500});
  const ms = performance.now() - started;
  const listed = e.legal_folds.reduce((n, entry) => n + spellings(entry).length, 0);
  const merged = e.legal_folds.reduce((n, entry) => n + entry.equivalent_action_count, 0);
  console.log(`  ${label}: ${e.distinct_legal_folds} legal (${merged} before dedup, ${listed} spelled out) ` +
      `/ ${e.actions_evaluated} evaluated, ${e.candidate_lines} lines, stack ${e.stack_size}, ` +
      `${ms.toFixed(0)}ms  ${JSON.stringify(e.rejected_summary)}`);
  for (const entry of e.legal_folds) {
    for (const action of spellings(entry)) {
      const probe = replay(cp, prefix);
      const r = probe.apply({tool: 'apply_fold', ...action});
      if (!r.ok) fail(`${label}: listed fold rejected by apply (${r.error}) ${JSON.stringify(action)}`);
    }
  }
  if (JSON.stringify(session.actions) !== JSON.stringify(prefix)) fail(`${label}: enumeration mutated the session`);
  return e;
}

// Can any spelling in the list reach exactly this state? Compared on raw current-plane
// geometry, NOT on the enumerator's quotient: using the quotient here would only prove the
// quotient agrees with itself. If the representative of a merged group is the turned-over
// variant, the reference is found among its equivalent_actions, which is the property that
// makes listing the alternatives load-bearing rather than cosmetic.
function reaches(cp, prefix, enumeration, wanted) {
  for (const entry of enumeration.legal_folds) {
    for (const action of spellings(entry)) {
      const probe = replay(cp, prefix);
      if (probe.apply({tool: 'apply_fold', ...action}).ok && stateKey(probe) === stateKey(wanted)) return true;
    }
  }
  return false;
}

// --- 1. synthetic four-leaf CP, the fixture test_partial_folds.mjs uses -------------------
{
  console.log('synthetic four-leaf CP');
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const cp = planarize([
    ...square.map((P, i) => ({P, Q: square[(i + 1) % 4], assignment: 'B'})),
    ...[[.25, 'V'], [.375, 'M'], [.5, 'V'], [.625, 'V'], [.75, 'M']]
      .map(([x, assignment]) => ({P: [x, 0], Q: [x, 1], assignment})),
  ]).fold;
  const half = {tool: 'apply_fold', angle_index: 2, offset: .5, move_positive: true, over: true};
  checkListIsAccepted(cp, [], 'empty sheet');
  const e = checkListIsAccepted(cp, [half, {...half, offset: .25}], 'after two half folds');
  // The known-good partial from test_partial_folds.mjs must be in the list.
  const wanted = replay(cp, [half, {...half, offset: .25},
    {...half, offset: .125, move_positive: false, selection_mode: 'top', layer_count: 2}]);
  if (!reaches(cp, [half, {...half, offset: .25}], e, wanted))
    fail('the known-legal top-2 partial fold is missing from the enumeration');
  if (new FoldSession(cp).apply({tool: 'apply_fold', angle_index: 2, offset: .1,
      move_positive: true, over: true}).error !== 'OUTSIDE_TARGET_CP')
    fail('apply no longer reports OUTSIDE_TARGET_CP after the tryFold extraction');
}

// --- 2. corpus samples: the reference fold must be reachable at every prefix ---------------
for (const id of samples) {
  console.log(`\n${id}`);
  let cp, folds;
  try {
    cp = JSON.parse(readFileSync(join(CORPUS, id, 'cp.fold'), 'utf8'));
    folds = JSON.parse(readFileSync(join(CORPUS, id, 'seq.json'), 'utf8')).folds;
  } catch (err) { console.log(`  SKIP (${err.message})`); continue; }
  const actions = folds.map(actionFromFold);
  for (let k = 0; k < actions.length; k++) {
    const prefix = actions.slice(0, k);
    const e = checkListIsAccepted(cp, prefix, `prefix ${k}/${actions.length}`);
    const reference = replay(cp, actions.slice(0, k + 1));
    if (!reaches(cp, prefix, e, reference))
      fail(`prefix ${k}: the reference's next fold is not in the enumeration`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
