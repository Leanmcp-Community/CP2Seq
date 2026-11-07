// Exploration analysis (hypothesis H2: the model explores far fewer distinct states than blind
// random folding under the same 80-fold budget). Calls NO model.
//
// Model side, per saved episode with history.json:
//   turns             tool calls in the episode
//   rejection_rate    share of calls with ok=false
//   accepted          accepted state-changing calls
//   distinct_states   distinct folded states reached (state key = layer geometry + parity,
//                     the same key the BFS baseline uses), flat sheet excluded
//   revisit_rate      1 - distinct_states / accepted
//   max_depth         longest accepted sequence
//   reasoning_tokens  mean reasoning_output_tokens per turn (turn-*/request-usage.json)
// Random side, per sample: E episodes of 80 uniformly random legal folds (same enumerator and
// reset rule as workspace/matched_baselines.mjs), distinct states per episode.
//
//   node workspace/exploration_analysis.mjs --runs CODEX_HARNESS_TESTING/runs \
//        --random-episodes 20 --random-groups easy,mid,layers --out workspace/RESULTS/exploration

import {readFile, readdir, stat, mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FoldSession, actionFromFold, replay} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalFolds} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs';
import {sessionLayers} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';

const REPO = resolve(fileURLToPath(import.meta.url), '../..');
const RELEASE = join(REPO, 'workspace/corpus/out/release');
const argv = process.argv.slice(2);
const many = n => argv.flatMap((a, i) => a === n ? [argv[i + 1]] : []);
const opt = (n, f) => many(n).at(-1) ?? f;
const runsRoots = (many('--runs').length ? many('--runs') : [join(REPO, 'CODEX_HARNESS_TESTING/runs')]).map(p => resolve(p));
const OUT = resolve(opt('--out', join(REPO, 'workspace/RESULTS/exploration')));
const E = Number(opt('--random-episodes', 20)), TURNS = Number(opt('--turns', 80));
const RGROUPS = opt('--random-groups', 'easy,mid,layers').split(',').filter(Boolean);

const readJson = async p => JSON.parse(await readFile(p, 'utf8'));
const exists = async p => { try { await stat(p); return true; } catch { return false; } };
const dirs = async p => (await exists(p))
  ? (await readdir(p, {withFileTypes: true})).filter(e => e.isDirectory()).map(e => e.name).sort() : [];

function stateKey(session) {
  const r = v => Math.round(v * 1e5);
  return sessionLayers(session).map(l => `${l.par}|${l.sheet.map(p => r(p[0]) + ',' + r(p[1])).join(';')}|` +
    l.poly.map(p => r(p[0]) + ',' + r(p[1])).join(';')).join('/');
}
const ACTION_KEYS = ['angle_index', 'angle_degrees', 'selection_mode', 'layer_count', 'offset', 'move_positive', 'over'];
const toAction = f => {
  const a = {tool: 'apply_fold'};
  for (const k of ACTION_KEYS) if (f[k] !== null && f[k] !== undefined) a[k] = f[k];
  if (a.selection_mode === 'all') delete a.layer_count;
  return a;
};
const sampleDir = s => join(RELEASE, s.startsWith('layers-') ? 'some-generated-d5/samples' : 'all-layers/samples', s);
const cps = new Map();
const cpOf = async s => { if (!cps.has(s)) cps.set(s, await readJson(join(sampleDir(s), 'cp.fold'))); return cps.get(s); };

// ---------- model episodes
const rows = [];
for (const root of runsRoots) for (const run of await dirs(root)) {
  const runDir = join(root, run);
  if (!await exists(join(runDir, 'config.json'))) continue;
  const c = await readJson(join(runDir, 'config.json'));
  const cond = `${c.model} | ${c.reasoning_effort} | ${c.tools}${c.compare_auto ? '+auto' : ''} | ` +
    `${c.geometry === 'images-only' ? 'images-only' : c.image_history === 'none' ? 'text-only' : 'text+images'}`;
  for (const ep of await dirs(runDir)) {
    const epDir = join(runDir, ep);
    if (!await exists(join(epDir, 'result.json')) || !await exists(join(epDir, 'history.json'))) continue;
    const res = await readJson(join(epDir, 'result.json'));
    const h = await readJson(join(epDir, 'history.json'));
    const list = Array.isArray(h) ? h : h.history ?? [];
    const sample = res.sample_id ?? ep;
    const row = {run, sample, group: sample.split('-')[0], cond, solved: res.solved === true, turns: list.length};
    try {
      const cp = await cpOf(sample);
      const flat = stateKey(new FoldSession(cp));
      const seen = new Set(), seqSeen = new Map();
      let accepted = 0, rejected = 0, maxDepth = 0;
      for (const e of list) {
        if (!e.result?.ok) { rejected++; continue; }
        if (!Array.isArray(e.result.sequence)) continue;
        accepted++;
        const seq = e.result.sequence;
        maxDepth = Math.max(maxDepth, seq.length);
        const sk = JSON.stringify(seq);
        let key = seqSeen.get(sk);
        if (key === undefined) {
          key = stateKey(replay(cp, seq.map(f => f.line || f.step ? actionFromFold(f) : toAction(f))));
          seqSeen.set(sk, key);
        }
        if (key !== flat) seen.add(key);
      }
      let rt = 0, rn = 0;
      for (const t of (await readdir(epDir)).filter(n => n.startsWith('turn-'))) {
        const u = join(epDir, t, 'request-usage.json');
        if (await exists(u)) { const j = await readJson(u); if (j.reasoning_output_tokens != null) { rt += j.reasoning_output_tokens; rn++; } }
      }
      Object.assign(row, {accepted, rejection_rate: list.length ? rejected / list.length : 0,
        distinct_states: seen.size, revisit_rate: accepted ? 1 - seen.size / accepted : 0,
        max_depth: maxDepth, reasoning_tokens: rn ? rt / rn : null});
    } catch (err) { row.error = err.message; }
    rows.push(row);
  }
}

// ---------- random baseline
function rng(s) {
  return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const random = {};
const rand = rng(1);
for (const g of RGROUPS) for (let i = 1; i <= 10; i++) {
  const sample = `${g}-${String(i).padStart(4, '0')}`;
  const dir = sampleDir(sample);
  const cp = await cpOf(sample), seq = await readJson(join(dir, 'seq.json'));
  const targetLayers = replay(cp, seq.folds.map(actionFromFold)).layers.length;
  const filter = g === 'layers' ? 'any' : 'all';
  const legal = s => enumerateLegalFolds(s, {max_results: 100000, selection_filter: filter}).legal_folds;
  const flat = stateKey(new FoldSession(cp));
  const per = [];
  for (let e = 0; e < E; e++) {
    let s = new FoldSession(cp);
    const seen = new Set();
    for (let t = 0; t < TURNS; t++) {
      let o = legal(s);
      if (!o.length || s.layers.length > targetLayers) { s = new FoldSession(cp); o = legal(s); }
      if (!o.length) break;
      s.apply({tool: 'apply_fold', ...o[Math.floor(rand() * o.length)].action});
      const k = stateKey(s);
      if (k !== flat) seen.add(k);
    }
    per.push(seen.size);
  }
  random[sample] = {mean: per.reduce((a, b) => a + b, 0) / per.length, min: Math.min(...per), max: Math.max(...per)};
  console.error(`random ${sample}: mean distinct ${random[sample].mean.toFixed(1)}`);
}

// ---------- report
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const med = a => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const f1 = v => Number.isFinite(v) ? v.toFixed(1) : '-';
const pc = v => Number.isFinite(v) ? (100 * v).toFixed(0) + '%' : '-';
const ok = rows.filter(r => !r.error);
const md = ['# Exploration analysis (H2)', '',
  `Model: per saved episode with history.json. Random: ${E} episodes x ${TURNS} uniformly random legal folds per sample (same enumerator and reset rule as the matched baselines). Distinct states exclude the flat sheet; state key = layer geometry + parity.`, '',
  '## By condition and group (model)', '',
  '| condition | group | episodes | solved | mean turns | rejection rate | mean accepted | mean distinct states | median distinct | revisit rate | mean max depth | reasoning tok/turn |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
const conds = [...new Set(ok.map(r => r.cond))].sort();
for (const c of conds) for (const g of ['easy', 'mid', 'hard', 'layers']) {
  const x = ok.filter(r => r.cond === c && r.group === g);
  if (!x.length) continue;
  md.push(`| ${c} | ${g} | ${x.length} | ${x.filter(r => r.solved).length} | ${f1(mean(x.map(r => r.turns)))} | ${pc(mean(x.map(r => r.rejection_rate)))} | ${f1(mean(x.map(r => r.accepted)))} | ${f1(mean(x.map(r => r.distinct_states)))} | ${f1(med(x.map(r => r.distinct_states)))} | ${pc(mean(x.map(r => r.revisit_rate)))} | ${f1(mean(x.map(r => r.max_depth)))} | ${f1(mean(x.map(r => r.reasoning_tokens).filter(v => v != null)))} |`);
}
md.push('', '## Random baseline (distinct states per 80-fold episode)', '', '| group | samples | mean distinct | min over samples | max over samples |', '| --- | --- | --- | --- | --- |');
for (const g of RGROUPS) {
  const x = Object.entries(random).filter(([s]) => s.startsWith(g + '-')).map(([, v]) => v.mean);
  md.push(`| ${g} | ${x.length} | ${f1(mean(x))} | ${f1(Math.min(...x))} | ${f1(Math.max(...x))} |`);
}
md.push('', '## Model vs random, paired by sample (ratio = model distinct / random mean distinct)', '',
  '| condition | group | paired episodes | mean model distinct | mean random distinct | median ratio |', '| --- | --- | --- | --- | --- | --- |');
for (const c of conds) for (const g of RGROUPS) {
  const x = ok.filter(r => r.cond === c && r.group === g && random[r.sample]);
  if (!x.length) continue;
  md.push(`| ${c} | ${g} | ${x.length} | ${f1(mean(x.map(r => r.distinct_states)))} | ${f1(mean(x.map(r => random[r.sample].mean)))} | ${(med(x.map(r => r.distinct_states / random[r.sample].mean))).toFixed(3)} |`);
}
md.push('', '## Solved vs unsolved episodes (all model conditions pooled, easy + layers)', '',
  '| outcome | episodes | mean distinct | revisit rate | rejection rate | reasoning tok/turn |', '| --- | --- | --- | --- | --- | --- |');
for (const [name, v] of [['solved', true], ['unsolved', false]]) {
  const x = ok.filter(r => r.solved === v && (r.group === 'easy' || r.group === 'layers'));
  md.push(`| ${name} | ${x.length} | ${f1(mean(x.map(r => r.distinct_states)))} | ${pc(mean(x.map(r => r.revisit_rate)))} | ${pc(mean(x.map(r => r.rejection_rate)))} | ${f1(mean(x.map(r => r.reasoning_tokens).filter(v => v != null)))} |`);
}
const errs = rows.filter(r => r.error);
if (errs.length) { md.push('', '## Errors', ''); for (const r of errs) md.push(`- ${r.run} ${r.sample}: ${r.error}`); }

await mkdir(OUT, {recursive: true});
await writeFile(join(OUT, 'report.json'), JSON.stringify({generated_at: new Date().toISOString(), random_episodes: E, turns: TURNS, rows, random}, null, 2) + '\n');
await writeFile(join(OUT, 'report.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
