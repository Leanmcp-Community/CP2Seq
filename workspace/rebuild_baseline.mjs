// Does the model re-make discarded folds more often than chance? Calls NO model.
//
// For every backtrack that removes >= 2 folds (from -> to), the discarded suffix is the folds
// to+1..from. OBSERVED: the model's next (from - to) accepted add_folds reach, step by step, the
// same states the discarded folds reached (compared by folded state, not by action arguments,
// since different arguments can produce the same state). CHANCE: a policy that picks uniformly
// among the distinct legal folds at each state (the same deduplicated list list_legal_folds
// returns) re-makes the suffix with probability prod_i 1/n_i, n_i = distinct legal folds at the
// state before discarded fold i. Expected chance count = sum of those probabilities.
//
//   node workspace/rebuild_baseline.mjs --runs CODEX_HARNESS_TESTING/runs --out workspace/RESULTS/backtracking

import {readFile, readdir, stat, mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {actionFromFold, replay} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalFolds} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs';
import {sessionLayers} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';

const REPO = resolve(fileURLToPath(import.meta.url), '../..');
const RELEASE = join(REPO, 'workspace/corpus/out/release');
const argv = process.argv.slice(2);
const opt = (n, f) => { const i = argv.lastIndexOf(n); return i < 0 ? f : argv[i + 1]; };
const ROOT = resolve(opt('--runs', join(REPO, 'CODEX_HARNESS_TESTING/runs')));
const OUT = resolve(opt('--out', join(REPO, 'workspace/RESULTS/backtracking')));
const readJson = async p => JSON.parse(await readFile(p, 'utf8'));
const exists = async p => { try { await stat(p); return true; } catch { return false; } };
const dirs = async p => {
  const out = [];
  for (const n of await readdir(p)) { try { if ((await stat(join(p, n))).isDirectory()) out.push(n); } catch {} }
  return out.sort();
};
const KEYS = ['angle_index', 'angle_degrees', 'selection_mode', 'layer_count', 'offset', 'move_positive', 'over'];
const toAction = f => {
  if (f.line || f.step) return actionFromFold(f);
  const a = {tool: 'apply_fold'};
  for (const k of KEYS) if (f[k] !== null && f[k] !== undefined) a[k] = f[k];
  if (a.selection_mode === 'all') delete a.layer_count;
  return a;
};
const r5 = v => Math.round(v * 1e5);
const stateKey = s => sessionLayers(s).map(l => `${l.par}|${l.sheet.map(p => r5(p[0]) + ',' + r5(p[1])).join(';')}|` +
  l.poly.map(p => r5(p[0]) + ',' + r5(p[1])).join(';')).join('/');

const cps = new Map();
const cpOf = async s => {
  if (!cps.has(s)) {
    const dir = s.startsWith('layers-') ? join(RELEASE, 'some-generated-d5/samples', s) : join(RELEASE, 'all-layers/samples', s);
    cps.set(s, await readJson(join(dir, 'cp.fold')));
  }
  return cps.get(s);
};
const keyMemo = new Map(), nMemo = new Map();
const keyOf = (sample, cp, seq) => {
  const k = sample + JSON.stringify(seq);
  if (!keyMemo.has(k)) keyMemo.set(k, stateKey(replay(cp, seq.map(toAction))));
  return keyMemo.get(k);
};
const legalCount = (sample, cp, seq, filter) => {
  const k = sample + filter + JSON.stringify(seq);
  if (!nMemo.has(k)) nMemo.set(k, enumerateLegalFolds(replay(cp, seq.map(toAction)),
    {max_results: 100000, selection_filter: filter}).legal_folds.length);
  return nMemo.get(k);
};

const rows = [];
for (const run of await dirs(ROOT)) {
  const runDir = join(ROOT, run);
  if (!await exists(join(runDir, 'config.json'))) continue;
  const c = await readJson(join(runDir, 'config.json'));
  const modality = c.geometry === 'images-only' ? 'images-only' : c.image_history === 'none' ? 'text-only' : 'text+images';
  const tools = (c.tools === 'legal-folds' ? 'L' : 'B') + (c.compare_auto ? '+A' : '');
  const cond = `${c.model} | ${tools} | ${modality}`;
  for (const ep of await dirs(runDir)) {
    const epDir = join(runDir, ep);
    if (!await exists(join(epDir, 'result.json')) || !await exists(join(epDir, 'history.json'))) continue;
    const sample = (await readJson(join(epDir, 'result.json'))).sample_id ?? ep;
    const group = sample.split('-')[0];
    if (group !== 'easy' && group !== 'layers') continue;
    const filter = group === 'layers' ? 'any' : 'all';
    const h = await readJson(join(epDir, 'history.json'));
    const list = Array.isArray(h) ? h : h.history ?? [];
    const cp = await cpOf(sample);
    const acc = list.map(e => (e.result?.ok && Array.isArray(e.result.sequence)) ? e : null);
    let prev = [];
    for (let i = 0; i < acc.length; i++) {
      const e = acc[i];
      if (!e) continue;
      const seq = e.result.sequence, name = e.action?.name;
      if (name !== 'add_fold' && seq.length <= prev.length - 2) {
        const from = prev.length, to = seq.length;
        // chance: prod 1/n over the states before each discarded fold
        let p = 1;
        for (let k = to; k < from; k++) p /= Math.max(1, legalCount(sample, cp, prev.slice(0, k), filter));
        // observed: next accepted add_folds reach the discarded states in order
        const want = [];
        for (let k = to + 1; k <= from; k++) want.push(keyOf(sample, cp, prev.slice(0, k)));
        let got = 0;
        for (let j = i + 1; j < acc.length && got < want.length; j++) {
          const f = acc[j];
          if (!f) continue;
          if (f.action?.name !== 'add_fold' || f.result.sequence.length !== to + got + 1) break;
          if (keyOf(sample, cp, f.result.sequence) !== want[got]) break;
          got++;
        }
        rows.push({run, sample, cond, from, to, jump: from - to, chance: p, rebuilt: got === want.length, rebuilt_first: got >= 1});
      }
      prev = seq;
    }
  }
}

const by = rows.reduce((m, r) => ((m[r.cond] ??= []).push(r), m), {});
const md = ['# Re-making discarded folds: model vs chance', '',
  'Backtracks removing >= 2 folds. Observed = the next accepted folds reach the discarded states in order ' +
  '(compared by state). Chance = uniform choice among distinct legal folds at each state; expected count = sum of probabilities.', '',
  '| condition | backtracks (jump>=2) | re-made all, observed | expected by chance | ratio | re-made first fold, observed |',
  '| --- | --- | --- | --- | --- | --- |'];
for (const [cond, rs] of Object.entries(by).sort()) {
  const obs = rs.filter(r => r.rebuilt).length, exp = rs.reduce((a, r) => a + r.chance, 0);
  md.push(`| ${cond} | ${rs.length} | ${obs} (${(100 * obs / rs.length).toFixed(0)}%) | ${exp.toFixed(1)} (${(100 * exp / rs.length).toFixed(0)}%) | ` +
    `${exp > 0 ? (obs / exp).toFixed(1) : '-'} | ${rs.filter(r => r.rebuilt_first).length} |`);
}
await mkdir(OUT, {recursive: true});
await writeFile(join(OUT, 'rebuild_baseline.md'), md.join('\n') + '\n');
await writeFile(join(OUT, 'rebuild_baseline.json'), JSON.stringify(rows, null, 1));
console.log(md.join('\n'));
