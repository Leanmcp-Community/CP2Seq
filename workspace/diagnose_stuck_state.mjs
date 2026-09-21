// Replay a saved run's accepted prefix for one sample and ask what was actually available
// there. Use it when an episode thrashes at a fixed state_id: it answers, without another
// model call, whether the model was stuck because nothing was legal or because it never
// looked.
//
//   node workspace/diagnose_stuck_state.mjs <run-dir> <sample-id>
//   node workspace/diagnose_stuck_state.mjs CODEX_HARNESS_TESTING/runs/codex-2026... easy-0003
//
// Optionally pass an action as JSON to have it judged at that state, which prints the
// verifier's full rejection including the repair verdict:
//
//   node workspace/diagnose_stuck_state.mjs <run-dir> easy-0003 \
//     '{"angle_index":3,"offset":0.25,"move_positive":true,"over":false,"selection_mode":"all"}'
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {replay, tryFold, actionFromFold} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalFolds} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs';

const argv = process.argv.slice(2);
const turnAt = argv.indexOf('--turn');
// seq.json holds the LAST revision, which after backtracking is often not the state an
// episode was stuck in. --turn replays the sequence a specific turn was looking at instead.
const turn = turnAt === -1 ? null : Number(argv.splice(turnAt, 2)[1]);
const [runDir, sampleId, probe] = argv;
if (!runDir || !sampleId || (turn !== null && !Number.isInteger(turn))) {
  console.error('usage: node workspace/diagnose_stuck_state.mjs <run-dir> <sample-id> [action-json] [--turn N]');
  process.exit(2);
}
const here = join(runDir, sampleId);
// A run only holds the samples it was asked for, so a missing folder usually means the wrong
// run, not a broken one. Say which samples this run does have rather than throwing ENOENT.
if (!existsSync(join(here, 'cp.fold'))) {
  if (!existsSync(runDir)) {
    console.error(`No such run directory: ${runDir}`);
    process.exit(2);
  }
  const present = readdirSync(runDir, {withFileTypes: true})
      .filter(d => d.isDirectory() && existsSync(join(runDir, d.name, 'cp.fold')))
      .map(d => d.name);
  console.error(`${runDir} has no sample "${sampleId}".`);
  console.error(present.length ? `Samples in this run: ${present.join(', ')}`
      : 'This run saved no samples with a cp.fold.');
  process.exit(2);
}
const cp = JSON.parse(readFileSync(join(here, 'cp.fold'), 'utf8'));
let folds, source;
if (turn === null) {
  folds = JSON.parse(readFileSync(join(here, 'seq.json'), 'utf8')).folds;
  source = 'seq.json (the run\'s final revision)';
} else {
  const path = join(here, `turn-${String(turn).padStart(3, '0')}`, 'tool.json');
  if (!existsSync(path)) { console.error(`No such turn: ${path}`); process.exit(2); }
  folds = JSON.parse(readFileSync(path, 'utf8')).result?.sequence ?? [];
  source = `turn ${turn}`;
}
const session = replay(cp, folds.map(actionFromFold));

console.log(`${sampleId}: replayed ${folds.length} accepted fold(s) from ${source}, stack ${session.layers.length}`);

const e = enumerateLegalFolds(session, {max_results: 200, include_rejected: true});
console.log(`${e.distinct_legal_folds} legal fold(s) available here, from ${e.candidate_lines} ` +
    `candidate lines and ${e.actions_evaluated} evaluated actions`);
console.log('rejected:', JSON.stringify(e.rejected_summary, null, 2));
if (!e.distinct_legal_folds) {
  console.log('\nNOTHING is legal at this state. The accepted prefix is a dead end, and no amount ' +
      'of retrying can help: the episode needed to backtrack.');
} else {
  console.log('\nAvailable:');
  for (const entry of e.legal_folds) {
    console.log(`  ${JSON.stringify(entry.action)}`);
    console.log(`    new crease ${entry.new_crease_length.toFixed(6)}, ` +
        `${entry.layers_after} layers after, ` +
        `${entry.creates.map(c => c.assignment).join('')}` +
        (entry.equivalent_action_count > 1 ? `, +${entry.equivalent_action_count - 1} equivalent` : ''));
  }
}

if (probe) {
  const action = {tool: 'apply_fold', ...JSON.parse(probe)};
  console.log('\nJudging the supplied action at this state:');
  const verdict = tryFold(session.paper, cp, action);
  if (verdict.ok) console.log('  accepted; it makes', verdict.fold.made.length, 'crease segment(s)');
  else console.log(JSON.stringify({error: verdict.error, detail: verdict.detail,
      flip_repairs_all: verdict.flip_repairs_all,
      creases_already_on_target: verdict.creases_already_on_target,
      corrected_action: verdict.corrected_action}, null, 2));
}
