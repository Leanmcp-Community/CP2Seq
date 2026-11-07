// Backtracking behaviour of model episodes. Calls NO model.
//
// Question: when an episode goes wrong, does the model repair locally (undo a fold or two) or
// restart? And when it restarts, was a local repair available?
//
// A BACKTRACK is an accepted call other than add_fold (go_to_step, restore_revision,
// remove_fold) after which the sequence is shorter than before. For each one:
//   from, to, jump        sequence length before and after; jump = from - to
//   to_zero               restarted from the flat sheet
//   dead_end              the state before the backtrack had no legal fold (some result since the
//                         last accepted state reported distinct_legal_folds = 0)
//   near                  last tier-3 comparison before the backtrack (feedback conditions only):
//                         layers_now / layers_target, layers_matching / layers_compared
//   local_repair          bounded search: is the target reachable (CP match + E_id) from the
//                         prefix of length from-1, from-2 or from-3, within (reference depth + 2 -
//                         prefix length) folds? Records the deepest such prefix, "none" if all
//                         three are exhausted without success, "unknown" if a node cap is hit.
//   rebuilt               after a jump of >= 2, the next accepted folds re-create the discarded
//                         folds in the same order (the model threw work away, then redid it)
//
//   node workspace/backtrack_analysis.mjs --runs CODEX_HARNESS_TESTING/runs \
//        --groups easy,layers --node-cap 4000 --out workspace/RESULTS/backtracking

import {readFile, readdir, stat, mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FoldSession, actionFromFold, replay} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalFolds} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs';
import {terminalMatchDetail, sessionLayers, cpSymmetries}
  from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';

const REPO = resolve(fileURLToPath(import.meta.url), '../..');
const RELEASE = join(REPO, 'workspace/corpus/out/release');
const argv = process.argv.slice(2);
const many = n => argv.flatMap((a, i) => a === n ? [argv[i + 1]] : []);
const opt = (n, f) => many(n).at(-1) ?? f;
const runsRoots = (many('--runs').length ? many('--runs') : [join(REPO, 'CODEX_HARNESS_TESTING/runs')]).map(p => resolve(p));
const OUT = resolve(opt('--out', join(REPO, 'workspace/RESULTS/backtracking')));
const GROUPS = new Set(opt('--groups', 'easy,layers').split(','));
const NODE_CAP = Number(opt('--node-cap', 4000));
const SLACK = Number(opt('--slack', 2));

const readJson = async p => JSON.parse(await readFile(p, 'utf8'));
const exists = async p => { try { await stat(p); return true; } catch { return false; } };
const dirs = async p => {
  if (!await exists(p)) return [];
  const out = [];
  for (const n of await readdir(p)) { try { if ((await stat(join(p, n))).isDirectory()) out.push(n); } catch {} }
  return out.sort();
};

const ACTION_KEYS = ['angle_index', 'angle_degrees', 'selection_mode', 'layer_count', 'offset', 'move_positive', 'over'];
const toAction = f => {
  if (f.line || f.step) return actionFromFold(f);
  const a = {tool: 'apply_fold'};
  for (const k of ACTION_KEYS) if (f[k] !== null && f[k] !== undefined) a[k] = f[k];
  if (a.selection_mode === 'all') delete a.layer_count;
  return a;
};
const foldKey = f => JSON.stringify(ACTION_KEYS.map(k => f[k] ?? null));

const samples = new Map();
async function sampleInfo(sample) {
  if (samples.has(sample)) return samples.get(sample);
  const group = sample.split('-')[0];
  const dir = group === 'layers' ? join(RELEASE, 'some-generated-d5/samples', sample)
                                 : join(RELEASE, 'all-layers/samples', sample);
  const cp = await readJson(join(dir, 'cp.fold')), seq = await readJson(join(dir, 'seq.json'));
  const target = sessionLayers(replay(cp, seq.folds.map(actionFromFold)));
  const s = {sample, group, cp, target, depth: seq.folds.length, syms: cpSymmetries(cp),
    filter: group === 'layers' ? 'any' : 'all', memo: new Map()};
  samples.set(sample, s);
  return s;
}

function solved(session, s) {
  if (session.layers.length !== s.target.length) return false;
  if (!session.evaluate().cp_match) return false;
  return terminalMatchDetail(sessionLayers(session), s.target, s.syms).identity_match;
}

// Depth-limited DFS from a prefix. Returns true / false / null (node cap hit).
function reachable(s, prefix, limit) {
  const memoKey = JSON.stringify(prefix.map(foldKey)) + '|' + limit;
  if (s.memo.has(memoKey)) return s.memo.get(memoKey);
  let nodes = 0, capped = false;
  const dfs = (seq, left) => {
    if (++nodes > NODE_CAP) { capped = true; return false; }
    const session = replay(s.cp, seq.map(toAction));
    if (solved(session, s)) return true;
    if (left === 0 || session.layers.length > s.target.length) return false;
    for (const o of enumerateLegalFolds(session, {max_results: 100000, selection_filter: s.filter}).legal_folds) {
      if (dfs([...seq, o.action], left - 1)) return true;
      if (capped) return false;
    }
    return false;
  };
  const found = dfs(prefix, limit);
  const r = found ? true : capped ? null : false;
  s.memo.set(memoKey, r);
  return r;
}

const rows = [], events = [];
for (const root of runsRoots) for (const run of await dirs(root)) {
  const runDir = join(root, run);
  if (!await exists(join(runDir, 'config.json'))) continue;
  const c = await readJson(join(runDir, 'config.json'));
  const family = run.startsWith('claude-') ? 'claude' : 'codex';
  const modality = c.geometry === 'images-only' ? 'images-only' : c.image_history === 'none' ? 'text-only' : 'text+images';
  const tools = (c.tools === 'legal-folds' ? 'L' : 'B') + (c.compare_auto ? '+A' : '');
  const cond = `${c.model} | ${c.reasoning_effort} | ${tools} | ${modality}`;
  for (const ep of await dirs(runDir)) {
    const epDir = join(runDir, ep);
    if (!await exists(join(epDir, 'result.json')) || !await exists(join(epDir, 'history.json'))) continue;
    const res = await readJson(join(epDir, 'result.json'));
    const sample = res.sample_id ?? ep;
    if (!GROUPS.has(sample.split('-')[0])) continue;
    const h = await readJson(join(epDir, 'history.json'));
    const list = Array.isArray(h) ? h : h.history ?? [];
    const s = await sampleInfo(sample);
    let prevSeq = [], lastCmp = null, deadEnd = false, nBack = 0;
    for (let i = 0; i < list.length; i++) {
      const {action, result} = list[i];
      if (!result) continue;
      const lf = result.legal_folds_now ?? result.enumeration;
      if (lf && lf.distinct_legal_folds === 0) deadEnd = true;
      if (!result.ok || !Array.isArray(result.sequence)) continue;
      const seq = result.sequence, name = action?.name;
      if (result.comparison_now) lastCmp = result.comparison_now;
      if (name !== 'add_fold' && seq.length < prevSeq.length) {
        nBack++;
        const from = prevSeq.length, to = seq.length;
        const ev = {run, sample, group: s.group, cond, family, tools, solved: res.solved === true,
          turn: i + 1, tool: name, from, to, jump: from - to, to_zero: to === 0, dead_end: deadEnd,
          near: lastCmp ? {layers_now: lastCmp.layers_now, layers_target: lastCmp.layers_target,
            matching: lastCmp.alignment?.layers_matching, compared: lastCmp.alignment?.layers_compared,
            diagnosis: lastCmp.diagnosis} : null};
        // local repair: deepest of from-1..from-3 (not below the model's own restart point)
        ev.local_repair = 'none';
        let anyUnknown = false;
        for (let k = from - 1; k >= Math.max(0, from - 3); k--) {
          const r = reachable(s, prevSeq.slice(0, k), Math.max(1, s.depth + SLACK - k));
          if (r === true) { ev.local_repair = k; break; }
          if (r === null) anyUnknown = true;
        }
        if (ev.local_repair === 'none' && anyUnknown) ev.local_repair = 'unknown';
        // rebuilt: next accepted folds re-create the discarded ones in order
        if (from - to >= 2) {
          const discarded = prevSeq.slice(to).map(foldKey);
          let j = i + 1, got = [];
          while (j < list.length && got.length < discarded.length) {
            const r = list[j].result;
            if (r?.ok && Array.isArray(r.sequence) && list[j].action?.name === 'add_fold') got.push(foldKey(r.sequence.at(-1)));
            else if (r?.ok && Array.isArray(r.sequence) && r.sequence.length < got.length + to) break;
            j++;
          }
          ev.rebuilt_prefix = got.length && got.every((g, x) => g === discarded[x]) ? got.length : 0;
          ev.rebuilt_all = ev.rebuilt_prefix === discarded.length;
        }
        events.push(ev);
        console.error(`${run} ${sample} t${ev.turn}: ${from}->${to} dead=${deadEnd} local=${ev.local_repair}`);
      }
      if (seq.length !== prevSeq.length || name !== 'add_fold') deadEnd = false;
      prevSeq = seq;
    }
    rows.push({run, sample, group: s.group, cond, family, tools, solved: res.solved === true, turns: list.length, backtracks: nBack});
  }
}

// ---------- report
const by = (arr, f) => arr.reduce((m, x) => ((m[f(x)] ??= []).push(x), m), {});
const pct = (a, b) => b ? `${a}/${b} (${(100 * a / b).toFixed(0)}%)` : '0/0';
const md = ['# Backtracking analysis', '', `Generated ${new Date().toISOString()}. Groups: ${[...GROUPS].join(', ')}. ` +
  `Local-repair search: prefixes from-1..from-3, depth limit reference+${SLACK}-prefix, node cap ${NODE_CAP}, success = CP match + E_id.`, '',
  '## By condition', '',
  '| condition | episodes | with backtrack | backtracks | to step 0 | mean jump | after dead end | local repair existed (of decidable) | to step 0 although local repair existed | rebuilt discarded folds (jump>=2) |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
const evBy = by(events, e => e.cond), rowBy = by(rows, r => r.cond);
for (const cond of Object.keys(rowBy).sort()) {
  const ev = evBy[cond] ?? [], rs = rowBy[cond];
  const dec = ev.filter(e => e.local_repair !== 'unknown');
  const loc = dec.filter(e => typeof e.local_repair === 'number');
  const big = ev.filter(e => e.jump >= 2);
  md.push(`| ${cond} | ${rs.length} | ${rs.filter(r => r.backtracks).length} | ${ev.length} | ${pct(ev.filter(e => e.to_zero).length, ev.length)} | ` +
    `${ev.length ? (ev.reduce((a, e) => a + e.jump, 0) / ev.length).toFixed(1) : '-'} | ${pct(ev.filter(e => e.dead_end).length, ev.length)} | ` +
    `${pct(loc.length, dec.length)} | ${pct(loc.filter(e => e.to_zero).length, loc.length)} | ${pct(big.filter(e => e.rebuilt_prefix > 0).length, big.length)} |`);
}
md.push('', '## Near-target restarts (feedback conditions)', '',
  'Backtracks to step 0 taken when the last comparison had the right layer count or at least half the compared layers matching.', '',
  '| run | sample | turn | from | layers now/target | matching/compared | diagnosis | dead end | local repair at |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const e of events.filter(e => e.to_zero && e.near && (e.near.layers_now === e.near.layers_target || (e.near.compared && e.near.matching / e.near.compared >= 0.5))))
  md.push(`| ${e.run} | ${e.sample} | ${e.turn} | ${e.from} | ${e.near.layers_now}/${e.near.layers_target} | ${e.near.matching}/${e.near.compared} | ${e.near.diagnosis} | ${e.dead_end} | ${e.local_repair} |`);
await mkdir(OUT, {recursive: true});
await writeFile(join(OUT, 'report.md'), md.join('\n') + '\n');
await writeFile(join(OUT, 'events.json'), JSON.stringify({events, rows}, null, 1));
console.log(md.join('\n'));
