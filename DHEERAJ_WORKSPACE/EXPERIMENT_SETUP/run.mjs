#!/usr/bin/env node
// Node 22+ built-ins only. No SDKs, installs, subprocess runtimes, or cloud provisioning.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { FoldSession, SAMPLE_IDS, SYSTEM, ACTION_SCHEMA, parseAction, replay } from './engine.mjs';
import { render, WIDTH, HEIGHT } from './render.mjs';
import { resolveProfile, payload, normalizeResponse, request } from './api.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const CORPUS = path.join(ROOT, 'workspace/corpus/out/release');
const json = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function write(filename, data) {
  fs.mkdirSync(path.dirname(filename), {recursive: true});
  fs.writeFileSync(filename, JSON.stringify(data, null, 2) + '\n');
}
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function redact(value, secret) {
  if (typeof value === 'string') return value.replaceAll(secret, '[REDACTED_API_KEY]');
  if (Array.isArray(value)) return value.map(v => redact(v, secret));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, secret)]));
  return value;
}
function logWriter(root) {
  let gseq = 0;
  const started = performance.now(), counters = new Map();
  return (stream, context, data) => {
    const session = context.session || 'run';
    const seq = counters.get(session) || 0;
    counters.set(session, seq + 1);
    const record = {ts: new Date().toISOString(), t: (performance.now() - started) / 1000,
      gseq: gseq++, seq, trial: 0, phase: 'pilot', ...context, ...data};
    fs.appendFileSync(path.join(root, stream + '.jsonl'), JSON.stringify(record) + '\n');
    return record;
  };
}

export function loadSamples() {
  const index = json(path.join(CORPUS, 'index.json'));
  const hashes = new Set();
  return SAMPLE_IDS.map((id, i) => {
    const entry = index.samples.find(s => s.id === id && s.tier === 'all-layers');
    if (!entry || entry.band !== 'easy' || entry.replay !== 'ok') throw Error(`Pinned sample ${id} no longer has expected metadata`);
    const dir = path.join(CORPUS, entry.dir), sources = {};
    for (const file of ['cp.fold', 'seq.json', 'steps.fold', 'meta.json']) sources[file] = hash(fs.readFileSync(path.join(dir, file)));
    const meta = json(path.join(dir, 'meta.json'));
    if (!meta.cp_hash || hashes.has(meta.cp_hash)) throw Error(`Missing or duplicate CP hash: ${id}`);
    hashes.add(meta.cp_hash);
    const rawCP = json(path.join(dir, 'cp.fold'));
    const cp = Object.fromEntries(['vertices_coords', 'edges_vertices', 'edges_assignment'].map(k => [k, rawCP[k]]));
    // Evaluator-side replay only; the reference never enters a model message.
    const reference = json(path.join(dir, 'seq.json'));
    const actions = reference.folds.map(f => ({tool: 'apply_fold', angle_index: f.angle_index,
      offset: f.offset, move_positive: f.move_positive, over: f.over}));
    const check = replay(cp, actions).evaluate();
    if (!check.cp_match) throw Error(`Reference replay does not reproduce CP: ${id}`);
    return {id: `easy-${String(i + 1).padStart(2, '0')}`, source_id: id, source_dir: entry.dir,
      sources, cp_hash: meta.cp_hash, cp, degeneracy: meta.metrics?.flags ?? null,
      reference_steps: actions.length, reference_replay: check};
  });
}

function observation(session, png, result = null) {
  return [{type: 'text', text: JSON.stringify({tool_result: result, ...session.observation()})},
    {type: 'image_url', image_url: {url: `data:image/png;base64,${png.toString('base64')}`}}];
}
function reportEpisode(dir, turns, summary) {
  const html = `<!doctype html><meta charset="utf-8"><title>VLM episode</title>
<style>body{font:16px system-ui;max-width:1150px;margin:30px auto;padding:20px}img{max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f4f7;padding:16px}article{border-top:1px solid #ccc;padding:20px 0}a{color:#1458ba}</style>
<h1>${escape(summary.profile)} · ${escape(summary.task)}</h1><pre>${escape(JSON.stringify(summary, null, 2))}</pre>
<p>Left: target CP. Middle: current top view. Right: exploded oblique view. Images shown are the actual API input.</p>
${turns.map(t => `<article><h2>Request ${t.iter} · state ${t.state_id}</h2><img src="${t.image}">
<p><a href="${t.request_file}">Exact request JSON including images</a> · <a href="${t.response_file}">Raw response</a></p>
<details><summary>Input text and history</summary><pre>${escape(JSON.stringify(t.input, null, 2))}</pre></details>
<h3>Output</h3><pre>${escape(t.content || '(no final content)')}</pre>
<details><summary>Returned reasoning / thought summary</summary><pre>${escape(typeof t.thinking === 'string' ? t.thinking : JSON.stringify(t.thinking ?? 'Not provided by model/backend', null, 2))}</pre></details>
<h3>Local tool call and result</h3><pre>${escape(JSON.stringify({call: t.action ?? null, result: t.tool_result ?? null, error: t.error ?? null}, null, 2))}</pre>
${t.after_image ? `<p>State after accepted fold</p><img src="${t.after_image}">` : ''}</article>`).join('')}`;
  fs.writeFileSync(path.join(dir, 'report.html'), html);
}

export async function runEpisode({root, profile, sample, limits, emit, requestFn = request}) {
  const rel = `episodes/${profile.name}/${sample.id}`, dir = path.join(root, rel);
  fs.mkdirSync(path.join(dir, 'images'), {recursive: true});
  const context = {session: `${profile.name}/${sample.id}`, task: sample.id, group: profile.name};
  const session = new FoldSession(sample.cp), turns = [], messages = [{role: 'system', content: SYSTEM}];
  const started = performance.now(), deadline = started + limits.episode_ms;
  let count = 0, toolCount = 0, rejected = 0, parseErrors = 0, failures = 0;
  let status = 'BUDGET_LIMIT', reason = 'request budget exhausted';
  function saveState() {
    const id = session.actions.length, image = `images/state-${id}.png`, png = render(sample.cp, session.layers);
    fs.writeFileSync(path.join(dir, image), png);
    write(path.join(dir, `states/state-${id}.json`), session.observation());
    return {image, png};
  }
  let current = saveState();
  messages.push({role: 'user', content: [{type: 'text', text: JSON.stringify({cp: sample.cp})}, ...observation(session, current.png)]});
  emit('events', context, {event: 'session_start', state_id: 0});
  for (; count < limits.requests;) {
    if (performance.now() >= deadline) { reason = 'episode time budget exhausted'; break; }
    const iter = ++count, body = payload(profile, messages, limits.max_tokens), before = session.actions.length;
    const stem = `turn-${String(iter).padStart(2, '0')}`;
    const requestFile = `${stem}.request.json`, responseFile = `${stem}.response.json`;
    write(path.join(dir, requestFile), body);
    const record = {iter, state_id: before, image: current.image, request_file: requestFile, response_file: responseFile,
      input: messages.map(m => ({...m, content: Array.isArray(m.content) ? m.content.map(p => p.type === 'image_url' ? {type: 'image_url', note: 'PNG bytes in exact request file'} : p) : m.content}))};
    turns.push(record);
    emit('events', {...context, iter}, {event: 'request', state_id: before,
      request_file: `${rel}/${requestFile}`, image: `${rel}/${current.image}`, image_sha256: hash(current.png),
      dimensions: [WIDTH, HEIGHT]});
    let http;
    try { http = await requestFn(profile, body, Math.min(limits.request_ms, deadline - performance.now())); }
    catch (e) { http = {ok: false, status: null, raw: null, error: e.message}; }
    http = redact(http, profile.key);
    write(path.join(dir, responseFile), http);
    emit('events', {...context, iter}, {event: 'response', state_id: before, response_file: `${rel}/${responseFile}`,
      status: http.status, latency_ms: http.latency_ms ?? null});
    if (!http.ok) {
      record.error = http.error || `HTTP_${http.status}`;
      emit('events', {...context, iter}, {event: 'error', error: record.error});
      const retryable = http.status === null || http.status === 429 || http.status >= 500;
      if (!retryable || ++failures > 2) { status = 'MODEL_ERROR'; reason = record.error; break; }
      emit('events', {...context, iter}, {event: 'retry', reason: record.error});
      continue; // Every actual request, including retries, consumes the same budget.
    }
    let output;
    try { output = normalizeResponse(JSON.parse(http.raw)); }
    catch (e) {
      record.error = e.message; status = 'MODEL_ERROR'; reason = e.message; break;
    }
    Object.assign(record, output);
    emit('transcripts', {...context, iter}, {role: 'agent', text: output.content, content: output.content,
      thinking: output.thinking, finish: output.finish, usage: output.usage,
      request_file: `${rel}/${requestFile}`, response_file: `${rel}/${responseFile}`});
    messages.push({role: 'assistant', content: output.content || '(No executable final answer was returned.)'});
    if (performance.now() >= deadline) { reason = 'episode time budget exhausted during response'; break; }
    try {
      if (output.finish === 'length') throw Error('Output truncated; return one complete action JSON');
      if (output.provider_tool_calls.length) throw Error('This protocol uses JSON actions, not native API tool calls');
      record.action = parseAction(output.content);
    } catch (e) {
      parseErrors++;
      record.error = e.message;
      emit('events', {...context, iter}, {event: 'schema_error', state_id: before, error: e.message});
      messages.push({role: 'user', content: [{type: 'text', text: JSON.stringify({error: 'INVALID_ACTION_SCHEMA', detail: e.message, state_id: before})}]});
      continue;
    }
    const callId = `${sample.id}-${iter}`;
    emit('events', {...context, iter}, {event: 'tool_call', name: record.action.tool, tool_call_id: callId,
      arguments: record.action, transport: 'validated_json', state_id: before});
    const toolStarted = performance.now();
    if (record.action.tool === 'finish') {
      const evaluated = replay(sample.cp, session.actions).evaluate();
      record.tool_result = evaluated;
      status = evaluated.cp_match ? 'CP_REPRODUCED' : 'FINISHED_INVALID';
      reason = evaluated.cp_match ? 'Full CP geometry and M/V assignments reproduced on replay' : 'Incomplete CP';
      emit('events', {...context, iter}, {event: 'tool_result', name: 'finish', tool_call_id: callId,
        content: evaluated, state_id: before, duration_s: (performance.now() - toolStarted) / 1000});
      break;
    }
    if (toolCount >= limits.tool_calls || session.actions.length >= limits.accepted_folds) {
      record.tool_result = {ok: false, error: 'BUDGET_LIMIT'};
      reason = 'fold-tool or accepted-fold budget exhausted';
      emit('events', {...context, iter}, {event: 'tool_result', name: 'apply_fold', tool_call_id: callId,
        content: record.tool_result, state_id: before});
      break;
    }
    toolCount++;
    record.tool_result = session.apply(record.action);
    if (record.tool_result.ok) { current = saveState(); record.after_image = current.image; }
    else rejected++;
    emit('events', {...context, iter}, {event: 'tool_result', name: 'apply_fold', tool_call_id: callId,
      arguments: record.action, content: record.tool_result, before_state_id: before,
      state_id: session.actions.length, duration_s: (performance.now() - toolStarted) / 1000});
    messages.push({role: 'user', content: observation(session, current.png, record.tool_result)});
  }
  const evaluation = replay(sample.cp, session.actions).evaluate();
  const summary = {profile: profile.name, task: sample.id, status, reason, requests: count,
    fold_tool_calls: toolCount, accepted_folds: session.actions.length, rejected_folds: rejected,
    schema_errors: parseErrors, seconds: (performance.now() - started) / 1000,
    reference_steps: sample.reference_steps, evaluation, report: `${rel}/report.html`};
  write(path.join(dir, 'result.json'), summary);
  write(path.join(dir, 'sequence.fold'), session.sequence());
  write(path.join(dir, 'seq.json'), {folds: session.actions});
  reportEpisode(dir, turns, summary);
  emit('events', context, {event: 'session_end', ...summary});
  emit('metrics', context, summary);
  return summary;
}

async function main() {
  const {values} = parseArgs({options: {
    profile: {type: 'string'}, profiles: {type: 'string', default: path.join(HERE, 'profiles.json')},
    list: {type: 'boolean'}, prepare: {type: 'boolean'}, help: {type: 'boolean'},
    requests: {type: 'string', default: '20'}, 'max-tokens': {type: 'string', default: '4096'},
    'episode-seconds': {type: 'string', default: '600'}, 'request-seconds': {type: 'string', default: '120'},
  }});
  if (values.help) {
    console.log('node run.mjs --list | --prepare | --profile gemini-flash,together-qwen35\nOptions: --profiles FILE --requests 20 --max-tokens 4096 --episode-seconds 600 --request-seconds 120');
    return;
  }
  const catalog = json(path.resolve(values.profiles));
  if (values.list) {
    for (const [name, p] of Object.entries(catalog)) console.log(`${name}\t${p.model || p.checkpoint}\t${p.availability}`);
    return;
  }
  if (!values.prepare && !values.profile) throw Error('Choose --prepare (offline) or --profile NAME[,NAME]');
  if (values.prepare && values.profile) throw Error('--prepare and --profile are separate operations');
  const limits = {requests: Number(values.requests), max_tokens: Number(values['max-tokens']),
    episode_ms: Number(values['episode-seconds']) * 1000, request_ms: Number(values['request-seconds']) * 1000,
    tool_calls: 20, accepted_folds: 10};
  if (Object.values(limits).some(n => !Number.isSafeInteger(n) || n < 1)) throw Error('Budgets must be positive integers');
  const names = values.profile?.split(',') || [];
  if (new Set(names).size !== names.length) throw Error('Duplicate profiles would duplicate episodes');
  const profiles = names.map(name => resolveProfile(name, catalog[name]));
  const samples = loadSamples(); // All ten references must pass before spending any API tokens.
  const root = path.join(HERE, 'runs', `${values.prepare ? 'prepare' : 'api'}-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
  fs.mkdirSync(root, {recursive: true});
  let gitCommit = null;
  try { gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim(); } catch {}
  const config = {created: new Date().toISOString(), git_commit: gitCommit, protocol: 'cp-json-some-layers-v2',
    node_version: process.version, limits, temperature: 0, seed: null, seed_support: 'not requested',
    renderer: {width: WIDTH, height: HEIGHT, panels: ['CP', 'top', 'exploded-oblique']},
    action_schema: ACTION_SCHEMA, system_prompt: SYSTEM,
    profiles: profiles.map(({key, ...p}) => p),
    code_sha256: Object.fromEntries(['run.mjs', 'api.mjs', 'engine.mjs', 'render.mjs'].map(f => [f, hash(fs.readFileSync(path.join(HERE, f)))])),
    engine_sha256: Object.fromEntries(['fold-engine.mjs', 'geom.mjs', 'planarize.mjs', 'crease-compare.mjs'].map(f => [f, hash(fs.readFileSync(path.join(ROOT, 'workspace/corpus', f)))])),
    samples: samples.map(({cp, ...s}) => s)};
  write(path.join(root, 'config.json'), config);
  console.log(JSON.stringify(config, null, 2));
  console.log(`Artifacts: ${root}`);
  const emit = logWriter(root), results = [];
  if (values.prepare) {
    for (const sample of samples) {
      const state = new FoldSession(sample.cp);
      fs.writeFileSync(path.join(root, `${sample.id}.png`), render(sample.cp, state.layers));
    }
    write(path.join(root, 'preflight.json'), {ok: true, examples: samples.length, api_requests: 0});
    console.log('Prepared exactly 10 examples; no API calls. Inspect the PNG files.');
    return;
  }
  for (const profile of profiles) for (const sample of samples) {
    const summary = await runEpisode({root, profile, sample, limits, emit});
    results.push(summary);
    write(path.join(root, 'summary.json'), results);
    console.log(`${profile.name} ${sample.id}: ${summary.status}`);
    const overview = `<!doctype html><meta charset="utf-8"><h1>VLM runs</h1><ul>${results.map(r => `<li><a href="${r.report}">${escape(r.profile)} / ${escape(r.task)}</a>: ${escape(r.status)}</li>`).join('')}</ul>`;
    fs.writeFileSync(path.join(root, 'index.html'), overview);
  }
  emit('events', {}, {event: 'run_end', episodes: results.length});
  // A completed benchmark with folding failures is still a valid saved result.
  if (results.some(r => r.status === 'MODEL_ERROR')) process.exitCode = 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => {console.error(`Run stopped: ${e.message}`); process.exitCode = 1;});
}
