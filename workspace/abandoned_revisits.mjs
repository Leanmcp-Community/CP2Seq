// Does the model avoid states it has already abandoned? Calls NO model.
//
// ABANDONED states: every state on a suffix discarded by a backtrack (go_to_step,
// restore_revision, remove_fold that shortens the sequence), plus any state where the model was
// told no legal fold exists (dead end). After a state is abandoned, each later accepted add_fold
// that lands on it again is a REVISIT. States are compared by folded geometry, parity and sheet
// region (same key as the exploration analysis). Each turn is a fresh request, so the only memory
// the model has of abandoned branches is the action history in its prompt.
//
// Reported per condition: accepted add_folds after the first backtrack, revisits of abandoned
// states, and revisits of dead-end states (a state from which no legal fold exists).
//
//   node workspace/abandoned_revisits.mjs --runs CODEX_HARNESS_TESTING/runs --out workspace/RESULTS/backtracking

import {readFile, readdir, stat, mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {actionFromFold, replay} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
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
const memo = new Map();
const keyOf = (sample, cp, seq) => {
  const k = sample + JSON.stringify(seq);
  if (!memo.has(k)) memo.set(k, stateKey(replay(cp, seq.map(toAction))));
  return memo.get(k);
};

const agg = {};
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
    const res = await readJson(join(epDir, 'result.json'));
    const sample = res.sample_id ?? ep;
    if (!/^(easy|layers)-/.test(sample)) continue;
    const h = await readJson(join(epDir, 'history.json'));
    const list = Array.isArray(h) ? h : h.history ?? [];
    const cp = await cpOf(sample);
    const a = (agg[cond] ??= {episodes: 0, after: 0, revisits: 0, deadRevisits: 0, episodesWithRevisit: 0});
    a.episodes++;
    const abandoned = new Set(), dead = new Set();
    let prev = [], backtracked = false, epRevisit = false;
    for (const e of list) {
      const r = e.result;
      if (!r) continue;
      const lf = r.legal_folds_now ?? r.enumeration;
      if (lf && lf.distinct_legal_folds === 0) { const k = keyOf(sample, cp, prev); dead.add(k); abandoned.add(k); }
      if (!r.ok || !Array.isArray(r.sequence)) continue;
      const seq = r.sequence, name = e.action?.name;
      if (name !== 'add_fold' && seq.length < prev.length) {
        for (let k = seq.length + 1; k <= prev.length; k++) abandoned.add(keyOf(sample, cp, prev.slice(0, k)));
        backtracked = true;
      } else if (name === 'add_fold' && backtracked) {
        a.after++;
        const k = keyOf(sample, cp, seq);
        if (abandoned.has(k)) { a.revisits++; epRevisit = true; }
        if (dead.has(k)) a.deadRevisits++;
      }
      prev = seq;
    }
    if (epRevisit) a.episodesWithRevisit++;
  }
}
const md = ['# Revisits of abandoned states', '',
  'Abandoned = on a suffix discarded by a backtrack, or a state reported to have no legal fold. ' +
  'Counted over accepted add_folds after the episode\'s first backtrack.', '',
  '| condition | episodes | episodes with a revisit | add_folds after first backtrack | revisits of abandoned states | of which dead ends |',
  '| --- | --- | --- | --- | --- | --- |'];
for (const [cond, a] of Object.entries(agg).sort())
  md.push(`| ${cond} | ${a.episodes} | ${a.episodesWithRevisit} | ${a.after} | ${a.revisits} (${a.after ? (100 * a.revisits / a.after).toFixed(0) : 0}%) | ${a.deadRevisits} |`);
await mkdir(OUT, {recursive: true});
await writeFile(join(OUT, 'abandoned_revisits.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
