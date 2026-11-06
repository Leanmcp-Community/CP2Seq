import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {replay} from './engine.mjs';

// "Flip it" must only be advised when the flipped fold is actually on-target. Both cases are
// real states from the text-only ablation (CODEX_HARNESS_TESTING/runs, 2026-09-25).
const corpus = new URL('../../workspace/corpus/out/release/all-layers/samples/', import.meta.url);
const cpOf = id => JSON.parse(fs.readFileSync(new URL(`${id}/cp.fold`, corpus)));
const fold = (angle_index, offset, move_positive, over) =>
  ({tool: 'apply_fold', angle_index, offset, move_positive, over});

test('hard-0002: a crease crossing both M and V spans is not flip-repairable', () => {
  // Turns 16-17: y=0.25 was rejected with over=true and over=false, and each rejection
  // claimed flip_repairs_all and advised the other value.
  const cp = cpOf('hard-0002');
  const prefix = [fold(1, 0.5, true, false), fold(3, 1, true, false), fold(2, 0.75, true, true)];
  for (const over of [true, false]) {
    const session = replay(cp, prefix), before = JSON.stringify(session);
    const r = session.apply(fold(0, 0.25, true, over));
    assert.equal(r.error, 'OUTSIDE_TARGET_CP', `over=${over}`);
    assert.equal(r.flip_repairs_all, false, `over=${over} must not claim a flip repairs it`);
    assert.equal(r.corrected_action, undefined, `over=${over} must not advise a corrected action`);
    assert.ok(r.off_target_creases.some(c => c.problem === 'mixed_assignment'), `over=${over}`);
    assert.match(r.detail, /both M and V/);
    assert.equal(JSON.stringify(session), before, 'rejection leaves the session unchanged');
  }
});

test('hard-0009: a genuine M/V inversion is still flip-repairable, and the advice works', () => {
  // Turn 1: the main diagonal folded V where the CP has M along its whole length.
  const cp = cpOf('hard-0009');
  const wrong = replay(cp, []).apply(fold(1, 0, true, true));
  assert.equal(wrong.error, 'OUTSIDE_TARGET_CP');
  assert.equal(wrong.flip_repairs_all, true);
  assert.equal(wrong.off_target_creases[0].problem, 'assignment_conflict');
  assert.equal(wrong.corrected_action.over, false);
  const {tool, ...advised} = {tool: 'apply_fold', ...wrong.corrected_action};
  assert.equal(replay(cp, []).apply({tool, ...advised}).ok, true, 'the advised action is accepted');
});
