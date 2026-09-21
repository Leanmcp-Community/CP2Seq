// Checks the rejection diagnostics returned by FoldSession.apply.
// Run from the repository root:  node workspace/test_fold_diagnostics.mjs
import assert from 'node:assert/strict';
import {planarize} from './corpus/planarize.mjs';
import {FoldSession} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {CASES} from '../DHEERAJ_WORKSPACE/viewer/verification-cases.mjs';

const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
const boundary = square.map((P, i) => ({P, Q: square[(i + 1) % 4], assignment: 'B'}));
const cpFor = segments => planarize([...boundary, ...segments]).fold;
const fold = extra => ({tool: 'apply_fold', angle_index: 2, move_positive: true, over: true, ...extra});

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// One vertical mountain at x = 0.5.
const cpM = cpFor([{P: [.5, 0], Q: [.5, 1], assignment: 'M'}]);

test('assignment_conflict names the M/V clash and its span', () => {
  const r = new FoldSession(cpM).apply(fold({offset: .5}));
  assert.equal(r.error, 'OUTSIDE_TARGET_CP');
  const [bad] = r.off_target_creases;
  assert.equal(bad.problem, 'assignment_conflict');
  assert.equal(bad.assignment, 'V');
  assert.equal(bad.uncovered[0].cp_assignment_here, 'M');
  assert.deepEqual(bad.uncovered[0].from.map(v => +v.toFixed(6)), [.5, 0]);
  assert.deepEqual(bad.uncovered[0].to.map(v => +v.toFixed(6)), [.5, 1]);
  assert.match(r.detail, /the CP has M there/);
  assert.equal(r.creases_proposed, 1);
  assert.equal(r.creases_off_target, 1);
});

test('absent names the line the CP does not have', () => {
  const r = new FoldSession(cpM).apply(fold({offset: .3}));
  const [bad] = r.off_target_creases;
  assert.equal(bad.problem, 'absent');
  assert.deepEqual(bad.cp_creases_on_this_line, []);
  assert.match(bad.message, /no crease anywhere on this line/);
});

test('flipping over onto the CP assignment is accepted', () => {
  const r = new FoldSession(cpM).apply(fold({offset: .5, over: false}));
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('nothing-to-move reports the offsets that would cut the paper', () => {
  const r = new FoldSession(cpM).apply(fold({offset: 5}));
  assert.equal(r.error, 'nothing-to-move');
  assert.deepEqual(r.diagnostic.offsets_that_cut_the_selection.map(v => +v.toFixed(6)), [0, 1]);
  assert.equal(r.diagnostic.requested_offset, 5);
  assert.match(r.detail, /no selected paper lies on the positive side/);
});

test('no-crease reports the same offset advice', () => {
  const r = new FoldSession(cpM).apply(fold({offset: 5, move_positive: false}));
  assert.equal(r.error, 'no-crease');
  assert.deepEqual(r.diagnostic.offsets_that_cut_the_selection.map(v => +v.toFixed(6)), [0, 1]);
});

test('invalid-selection reports the stack size', () => {
  const r = new FoldSession(cpM).apply(fold({offset: .5, selection_mode: 'top', layer_count: 3}));
  assert.equal(r.error, 'invalid-selection');
  assert.deepEqual([r.requested_layer_count, r.stack_size], [3, 1]);
});

// The shared verification fixtures: apply the accepted prefix, then the rejected action.
const runCase = id => {
  const c = CASES.find(x => x.id === id);
  const session = new FoldSession(c.cp);
  let last;
  for (const action of c.candidate) last = session.apply({tool: 'apply_fold', ...action});
  return last;
};

test('would-tear locates the join between the two layers', () => {
  const r = runCase('tear-three');
  assert.equal(r.error, 'would-tear');
  const d = r.diagnostic;
  assert.equal(d.join_current_coords.length, 2);
  assert.equal(d.join_sheet_coords.length, 2);
  assert.ok(d.join_distance_from_fold_line.some(v => Math.abs(v) > 1e-7),
            'the join must be off the fold line');
  assert.ok(Number.isInteger(d.moving_layer_rank) && Number.isInteger(d.stationary_layer_rank));
  assert.notEqual(d.moving_layer_rank, d.stationary_layer_rank);
  assert.match(r.detail, /one piece of paper/);
});

test('direction-impossible states the only legal direction', () => {
  const r = runCase('direction');
  assert.equal(r.error, 'direction-impossible');
  assert.equal(r.diagnostic.required_over, true);
  assert.equal(r.diagnostic.requested_over, false);
});

test('off-target fixture still rejects with a located crease', () => {
  const r = runCase('off-target');
  assert.equal(r.error, 'OUTSIDE_TARGET_CP');
  assert.ok(r.off_target_creases.length >= 1);
  assert.ok(r.off_target_creases[0].from && r.off_target_creases[0].to);
});

test('accepted fixtures are unaffected', () => {
  for (const id of ['legal-pair', 'two-sequences']) {
    const c = CASES.find(x => x.id === id);
    const session = new FoldSession(c.cp);
    for (const action of c.candidate) {
      const r = session.apply({tool: 'apply_fold', ...action});
      assert.equal(r.ok, true, `${id}: ${JSON.stringify(r)}`);
    }
  }
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
console.log(`${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
