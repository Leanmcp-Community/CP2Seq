import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { planarize } from '../../../workspace/corpus/planarize.mjs';
import { FoldSession, parseAction, replay } from './engine.mjs';
import { render, WIDTH, HEIGHT } from './render.mjs';
import { payload, normalizeResponse, resolveProfile, request } from './api.mjs';
import { loadSamples, runEpisode } from './run.mjs';

const sheet = [[0, 0], [1, 0], [1, 1], [0, 1]];
const cp = planarize([...sheet.map((P, i) => ({P, Q: sheet[(i + 1) % 4], assignment: 'B'})),
  {P: [0.5, 0], Q: [0.5, 1], assignment: 'V'}]).fold;
const half = {tool: 'apply_fold', angle_index: 2, offset: 0.5, move_positive: true, over: true};
const finish = {tool: 'finish'};

test('rejects invalid schema, partial folds, unknown tools and concatenated objects', () => {
  for (const text of ['{}', '[]', '{"tool":"shell"}', JSON.stringify({...half, offset: '0.5'}),
    JSON.stringify({...half, moving_faces: [0]}), JSON.stringify({...half, angle_index: 4}), '{}{}']) {
    assert.throws(() => parseAction(text));
  }
  assert.deepEqual(parseAction('```json\n{"tool":"finish"}\n```'), finish);
});

test('off-target and wrong-M/V candidates do not mutate paper; correct fold replays', () => {
  const state = new FoldSession(cp), before = JSON.stringify(state.observation());
  assert.equal(state.apply({...half, offset: 0.25}).ok, false);
  assert.equal(state.apply({...half, over: false}).ok, false);
  assert.equal(JSON.stringify(state.observation()), before);
  assert.equal(state.apply(half).ok, true);
  assert.equal(state.evaluate().cp_match, true);
  assert.equal(replay(cp, [half]).evaluate().cp_match, true);
  assert.equal(state.sequence().file_frames.length, 2);
});

test('all ten pinned corpus references replay without contacting a model', () => {
  const samples = loadSamples();
  assert.equal(samples.length, 10);
  assert.equal(new Set(samples.map(s => s.cp_hash)).size, 10);
  assert.ok(samples.every(s => s.reference_replay.cp_match && s.reference_steps === 4));
});

test('raster output is a decodable RGB PNG with expected dimensions', () => {
  const png = render(cp, new FoldSession(cp).layers);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), WIDTH);
  assert.equal(png.readUInt32BE(20), HEIGHT);
  const idat = [];
  for (let off = 8; off < png.length;) {
    const n = png.readUInt32BE(off), type = png.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(png.subarray(off + 8, off + 8 + n));
    off += n + 12;
  }
  assert.equal(inflateSync(Buffer.concat(idat)).length, (WIDTH * 3 + 1) * HEIGHT);
});

test('reasoning-only and truncated thinking cannot become fold actions', () => {
  const normalize = message => normalizeResponse({choices: [{message, finish_reason: 'stop'}]});
  assert.equal(normalize({content: null, reasoning_content: JSON.stringify(half)}).content, '');
  assert.equal(normalize({content: '<think>' + JSON.stringify(half)}).content, '');
  assert.equal(normalize({content: '<think>private</think>{"tool":"finish"}'}).content, JSON.stringify(finish));
});

test('profile validation, JSON protocol and HTTP authorization', async () => {
  assert.throws(() => resolveProfile('p', {model: 'm', base_url: 'http://public.test/v1', key_env: 'K'}, {K: 'secret'}));
  const profile = resolveProfile('p', {model: 'm', base_url: 'https://example.test/v1', key_env: 'K'}, {K: 'secret'});
  const body = payload(profile, [{role: 'user', content: 'test'}], 4096);
  assert.equal(body.model, 'm'); assert.equal(body.tools, undefined);
  const result = await request(profile, body, 1000, async (url, options) => {
    assert.equal(url, 'https://example.test/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer secret');
    assert.equal(JSON.parse(options.body).max_tokens, 4096);
    return new Response('{"ok":true}', {status: 200});
  });
  assert.equal(result.ok, true);
});

async function scenario(replies, requests = 20) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fold-vlm-test-'));
  const events = [], bodies = [];
  const profile = {name: 'mock', model: 'mock-model', key: 'test-secret', endpoint: 'https://example.test/v1/chat/completions'};
  try {
    const result = await runEpisode({root, profile, sample: {id: 'easy-01', cp, reference_steps: 1},
      limits: {requests, max_tokens: 4096, episode_ms: 60000, request_ms: 1000, tool_calls: 20, accepted_folds: 10},
      emit: (stream, context, data) => events.push({stream, ...context, ...data}),
      requestFn: async (_, body) => {
        bodies.push(structuredClone(body));
        const next = replies.shift();
        if (next?.http) return next.http;
        return {ok: true, status: 200, latency_ms: 1,
          raw: JSON.stringify({choices: [{message: {content: typeof next === 'string' ? next : JSON.stringify(next)}, finish_reason: 'stop'}]})};
      }});
    return {result, events, bodies, report: fs.readFileSync(path.join(root, result.report), 'utf8')};
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
}

test('rejection then accepted fold then finish preserves tool feedback and traces', async () => {
  const {result, events, bodies, report} = await scenario([{...half, offset: 0.25}, half, finish]);
  assert.equal(result.status, 'CP_REPRODUCED'); assert.equal(result.requests, 3);
  assert.equal(result.rejected_folds, 1); assert.equal(result.accepted_folds, 1);
  assert.ok(JSON.stringify(bodies[1]).includes('OUTSIDE_TARGET_CP'));
  assert.ok(!JSON.stringify(bodies).includes('reference_steps'));
  assert.ok(bodies[0].messages[1].content.some(p => p.type === 'image_url'));
  assert.equal(events.filter(e => e.event === 'tool_result').length, 3);
  assert.ok(report.includes('turn-01.request.json'));
});

test('premature finish is failure; HTTP errors and retries remain in the request budget', async () => {
  assert.equal((await scenario([finish])).result.status, 'FINISHED_INVALID');
  const failed = await scenario([{http: {ok: false, status: 401, raw: 'test-secret'}}]);
  assert.equal(failed.result.status, 'MODEL_ERROR');
  const limited = await scenario([{http: {ok: false, status: 429, raw: 'slow down'}}], 1);
  assert.equal(limited.result.status, 'BUDGET_LIMIT'); assert.equal(limited.result.requests, 1);
  assert.equal(limited.events.filter(e => e.event === 'retry').length, 1);
});

test('invalid schema consumes request budget without applying a fold; HTML is escaped', async () => {
  const r = await scenario(['<script>alert(1)</script>'], 1);
  assert.equal(r.result.schema_errors, 1); assert.equal(r.result.accepted_folds, 0);
  assert.equal(r.result.status, 'BUDGET_LIMIT');
  assert.ok(!r.report.includes('<script>alert(1)</script>'));
});
