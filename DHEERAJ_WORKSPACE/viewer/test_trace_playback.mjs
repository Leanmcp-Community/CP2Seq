import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTimeline, normalizeAction, artifactRelative} from './trace-playback.mjs';

const initial = {manifest: {'initial-top': {path: 'initial.png'}}};
test('thought and action show old state; rejected folds preserve it; backtracking restores it', () => {
  const image = {top: {path: 'fold.png'}}, restored = {top: {path: 'restore.png'}};
  const frames = buildTimeline(initial, [
    {turn: 1, tool: {action: {name: 'add_fold'}, result: {ok: true, state_id: 1, layers_bottom_to_top: []}}, feedback: image},
    {turn: 2, tool: {action: {name: 'add_fold'}, result: {ok: false, error: 'would-tear'}}},
    {turn: 3, tool: {action: {name: 'restore_revision'}, result: {ok: true, state_id: 0, layers_bottom_to_top: []}}, feedback: restored},
  ]);
  assert.equal(frames.length, 10);
  assert.equal(frames[1].images.top.path, 'initial.png');
  assert.equal(frames[2].images.top.path, 'initial.png');
  assert.equal(frames[3].images, image);
  assert.equal(frames[6].images, image);
  assert.equal(frames[6].result.error, 'would-tear');
  assert.equal(frames[9].step, 0);
  assert.equal(frames[9].images, restored);
});
test('viewing a historical step does not rewind current paper; missing result does not invent an action', () => {
  const frames = buildTimeline(initial, [
    {turn: 1, tool: {action: {name: 'get_images'}, result: {ok: true, image_step: 0, state_id: 3}}, feedback: {top: {path: 'old.png'}}},
    {turn: 2, tool: null},
  ]);
  assert.equal(frames[3].images.top.path, 'initial.png');
  assert.equal(frames[6].result, null);
});
test('missing mutation screenshot does not display stale paper', () => {
  const frames = buildTimeline(initial, [{turn: 1, tool: {action: {name: 'add_fold'},
    result: {ok: true, state_id: 1, layers_bottom_to_top: [{polygon: [[0,0],[1,0],[0,1]], parity: 0}]}}}]);
  assert.deepEqual(frames.at(-1).images, {});
  assert.equal(frames.at(-1).layers.length, 1);
});
test('Tinker actions and relocated artifact paths are understood', () => {
  assert.deepEqual(normalizeAction({call: {function: {name: 'add_fold', arguments: '{"offset":0.5}'}}}),
    {name: 'add_fold', arguments: {offset: .5}});
  assert.equal(artifactRelative({id: 'run1', directory: '/new/run1'}, {path: '/old/run1/example/top.png'}), 'example/top.png');
  assert.equal(artifactRelative({id: 'run1', directory: '/new/run1'}, {path: '/other/image.png'}), null);
});
