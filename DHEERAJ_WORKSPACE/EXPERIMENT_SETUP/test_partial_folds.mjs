import test from 'node:test';
import assert from 'node:assert/strict';
import {planarize} from '../../workspace/corpus/planarize.mjs';
import {FoldSession, parseAction, replay} from './engine.mjs';

// Two vertical half-folds make four connected leaves. The top two can fold
// together across x=.125 toward the left; taking the top three across an
// oblique line separates one of the connections to the stationary fourth leaf.
const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
const cp = planarize([
  ...square.map((P, i) => ({P, Q: square[(i + 1) % 4], assignment: 'B'})),
  ...[[.25, 'V'], [.375, 'M'], [.5, 'V'], [.625, 'V'], [.75, 'M']]
    .map(([x, assignment]) => ({P: [x, 0], Q: [x, 1], assignment})),
]).fold;
const half = {tool: 'apply_fold', angle_index: 2, offset: .5, move_positive: true, over: true};
const prefix = [half, {...half, offset: .25}];
const partial = {...half, offset: .125, move_positive: false, selection_mode: 'top', layer_count: 2};

test('four-leaf oblique top-three fold tears; rejection preserves the whole session', () => {
  const session = replay(cp, prefix);
  assert.equal(session.layers.length, 4);
  const before = JSON.stringify(session);
  const result = session.apply({tool: 'apply_fold', angle_degrees: 35, offset: .3,
    move_positive: true, over: true, selection_mode: 'top', layer_count: 3});
  assert.equal(result.error, 'would-tear');
  assert.equal(result.between_faces.length, 2);
  assert.equal(JSON.stringify(session), before);
});

test('connected top pair folds legally, exports and replays', () => {
  const session = replay(cp, prefix);
  assert.equal(session.apply(partial).ok, true);
  assert.equal(session.evaluate().cp_match, true);
  assert.deepEqual(replay(cp, [...prefix, partial]).observation(), session.observation());
  assert.equal(session.sequence().file_frames.length, 4);
});

test('partial direction/count and target CP remain enforced transactionally', () => {
  const session = replay(cp, prefix), before = JSON.stringify(session);
  assert.equal(session.apply({...partial, over: false}).error, 'direction-impossible');
  assert.equal(session.apply({...partial, layer_count: 5}).error, 'invalid-selection');
  assert.equal(session.apply({...partial, offset: .1}).error, 'OUTSIDE_TARGET_CP');
  assert.equal(JSON.stringify(session), before);
});

test('arbitrary 35-degree crease is supported when connected and on target', () => {
  const theta = 35 * Math.PI / 180;
  // y = tan(theta)*x + .1, crossing both vertical boundaries of the square.
  const target = planarize([
    ...square.map((P, i) => ({P, Q: square[(i + 1) % 4], assignment: 'B'})),
    {P: [0, .1], Q: [1, Math.tan(theta) + .1], assignment: 'V'},
  ]).fold;
  const session = new FoldSession(target);
  assert.equal(session.apply({tool: 'apply_fold', angle_degrees: 35,
    offset: .1 * Math.cos(theta), move_positive: true, over: true}).ok, true);
  assert.equal(session.evaluate().cp_match, true);
});

test('ambiguous angles and unsupported selections are rejected', () => {
  for (const action of [{...half, angle_degrees: 35}, {...half, selection_mode: 'middle'},
    {...half, selection_mode: 'top'}, {...half, selection_mode: 'bottom', layer_count: 0},
    {...half, layer_count: 2}]) assert.throws(() => parseAction(JSON.stringify(action)));
});
