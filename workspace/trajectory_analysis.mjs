// Trajectory-level failure analysis (reviewers Fff9 W4/Q4, xGpN W2/Q3).
//
// Termination labels say which stopping rule fired, not why the model failed. This script
// reads every turn of every episode and derives quantities that separate the candidate causes:
//
//   rejection profile   share of add_fold calls rejected, by error type. Geometric errors
//                       (would-tear, no-crease, nothing-to-move, direction-impossible,
//                       invalid-selection) indicate the model mis-tracked the current state;
//                       OUTSIDE_TARGET_CP indicates a legal fold off the target pattern.
//   reach               deepest point the episode got to: max layers matching the target under
//                       the comparison tool's alignment (recomputed offline for every accepted
//                       state, all conditions, so tool-free arms are measured identically),
//                       whether it ever reached the target layer count with the full CP
//                       ("complete but wrong stack"), and whether it ever had a CP-correct
//                       prefix of the reference depth.
//   backtracking        remove_fold / go_to_step / restore_revision calls; states revisited.
//   cycling             for state_cycling stops: turn of the stop, and, for each threshold k in
//                       --cycle-limits, the turn at which a limit of k WOULD have stopped the
//                       episode (offline, exact for k <= the limit used; for k above it the
//                       episode was not observed long enough and is marked censored).
//
// Each failed episode gets one primary category, assigned in this order:
//   F1 state-tracking    >50% of add_fold calls rejected for geometric illegality
//   F2 off-pattern       most rejections OUTSIDE_TARGET_CP and the CP never fully matched
//   F3 wrong-stack       reached target layer count with full CP but wrong order/parity/shape
//   F4 shallow-search    never reached target layer count with a CP-consistent state
// The rules are mechanical and stated in the paper; they are descriptive, not causal.
//
//   node workspace/trajectory_analysis.mjs --runs <runs-root> --out workspace/RESULTS/trajectories
//        [--cycle-limits 2,3,4,5,6]

import {readFile, readdir, stat, mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {replay, actionFromFold} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {compareToTarget} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/compare_target.mjs';
import {frameLayers} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';

const REPO = resolve(fileURLToPath(import.meta.url), '../..');
const argv = process.argv.slice(2);
const many = n => argv.flatMap((a, i) => a === n ? [argv[i + 1]] : []);
const roots = many('--runs').map(p => resolve(p));
const OUT = resolve(many('--out').at(-1) ?? join(REPO, 'workspace/RESULTS/trajectories'));
const LIMITS = (many('--cycle-limits').at(-1) ?? '2,3,4,5,6').split(',').map(Number);
const GEOMETRIC = new Set(['would-tear', 'no-crease', 'nothing-to-move', 'direction-impossible',
  'invalid-selection', 'ENGINE_REJECTED']);
const BACKTRACK = new Set(['remove_fold', 'go_to_step', 'restore_revision']);

const readJson = async p => JSON.parse(await readFile(p, 'utf8'));
const exists = async p => { try { await stat(p); return true; } catch { return false; } };
const dirs = async p => (await exists(p))
  ? (await readdir(p, {withFileTypes: true})).filter(e => e.isDirectory()).map(e => e.name).sort() : [];

const episodes = [];
for (const root of roots) for (const run of await dirs(root)) {
  const runDir = join(root, run);
  if (!await exists(join(runDir, 'config.json'))) continue;
  const config = await readJson(join(runDir, 'config.json'));
  for (const ep of await dirs(runDir)) {
    const epDir = join(runDir, ep);
    if (!await exists(join(epDir, 'result.json')) || !await exists(join(epDir, 'target.fold'))) continue;
    const result = await readJson(join(epDir, 'result.json'));
    const cp = await readJson(join(epDir, 'cp.fold'));
    const target = frameLayers(await readJson(join(epDir, 'target.fold')));
    const row = {run, sample: result.sample_id ?? ep, model: config.model, effort: config.reasoning_effort,
      tools: config.tools, compare_tier: config.compare_tier ?? 0, compare_auto: config.compare_auto ?? false,
      cycle_limit_used: config.cycle_limit, solved: result.solved === true, termination: result.termination,
      turns: 0, add_fold: 0, rejected: {}, backtracks: 0, max_layers_matching: 0, target_layers: target.length,
      reached_full_depth_with_cp: false, complete_wrong_stack: false, cp_ever_matched: false,
      distinct_states: 0, revisits: 0, would_stop_at: {}};
    const moves = new Map(), arrivals = new Map(), cache = new Map();
    let position = '[]';
    const turns = (await readdir(epDir)).filter(n => /^turn-\d+$/.test(n)).sort();
    for (const turn of turns) {
      const p = join(epDir, turn, 'tool.json');
      if (!await exists(p)) continue;
      const {action, result: r} = await readJson(p);
      row.turns++;
      if (action?.name === 'add_fold') {
        row.add_fold++;
        if (!r?.ok) row.rejected[r?.error ?? 'unknown'] = (row.rejected[r?.error ?? 'unknown'] ?? 0) + 1;
      }
      if (BACKTRACK.has(action?.name) && r?.ok) row.backtracks++;
      if (!r?.ok || !Array.isArray(r.sequence)) continue;
      const pos = JSON.stringify(r.sequence);
      if (!cache.has(pos)) {
        try {
          const s = replay(cp, r.sequence.map(a => actionFromFold(a)));
          const layers = frameLayers(s.sequence().file_frames.at(-1));
          const c = compareToTarget(layers, target, 2);
          cache.set(pos, {matching: c.alignment?.layers_matching ?? 0, n: layers.length,
            cp: s.evaluate().cp_match, diagnosis: c.diagnosis});
        } catch { cache.set(pos, null); }
      }
      const st = cache.get(pos);
      if (st) {
        row.max_layers_matching = Math.max(row.max_layers_matching, st.matching);
        row.cp_ever_matched ||= st.cp;
        if (st.cp && st.n === target.length) {
          row.reached_full_depth_with_cp = true;
          if (st.diagnosis !== 'matches') row.complete_wrong_stack = true;
        }
      }
      if (pos !== position) {
        const key = position + '>' + JSON.stringify(action);
        const m = (moves.get(key) ?? 0) + 1; moves.set(key, m);
        const a = (arrivals.get(pos) ?? 0) + 1; arrivals.set(pos, a);
        if (a > 1) row.revisits++;
        for (const k of LIMITS) if (m >= k && row.would_stop_at[k] === undefined) row.would_stop_at[k] = row.turns;
        position = pos;
      }
    }
    row.distinct_states = cache.size;
    // A limit above the one used was never tested past the actual stop: censored.
    for (const k of LIMITS) if (row.would_stop_at[k] === undefined)
      row.would_stop_at[k] = row.termination === 'state_cycling' && k > row.cycle_limit_used ? 'censored' : null;
    const rej = Object.values(row.rejected).reduce((a, b) => a + b, 0);
    const geo = Object.entries(row.rejected).filter(([e]) => GEOMETRIC.has(e)).reduce((a, [, n]) => a + n, 0);
    row.rejection_rate = row.add_fold ? rej / row.add_fold : 0;
    row.geometric_rejection_rate = row.add_fold ? geo / row.add_fold : 0;
    row.category = row.solved ? 'solved'
      : row.geometric_rejection_rate > 0.5 ? 'F1-state-tracking'
      : (row.rejected.OUTSIDE_TARGET_CP ?? 0) > rej / 2 && !row.cp_ever_matched ? 'F2-off-pattern'
      : row.complete_wrong_stack ? 'F3-wrong-stack'
      : 'F4-shallow-search';
    episodes.push(row);
  }
}

const cond = r => `${r.model} ${r.effort} ${r.tools}${r.compare_auto ? ' +auto' : r.compare_tier ? ' +on-demand' : ''}`;
const groups = new Map();
for (const r of episodes) (groups.get(cond(r)) ?? groups.set(cond(r), []).get(cond(r))).push(r);
const pct = x => (100 * x).toFixed(1) + '%';
const mean = (rs, f) => rs.length ? rs.reduce((a, r) => a + f(r), 0) / rs.length : 0;
const md = ['# Trajectory-level failure analysis', '',
  'Categories (failed episodes, first rule that applies): F1 >50% add_fold geometrically illegal; ' +
  'F2 mostly off-pattern rejections and CP never matched; F3 reached target depth with full CP but wrong stack; F4 otherwise.', '',
  '| condition | episodes | solved | mean rejection rate | mean geometric rejection | mean backtracks | F1 | F2 | F3 | F4 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
for (const [k, rs] of groups) {
  const c = cat => rs.filter(r => r.category === cat).length;
  md.push(`| ${k} | ${rs.length} | ${c('solved')} | ${pct(mean(rs, r => r.rejection_rate))} | ` +
    `${pct(mean(rs, r => r.geometric_rejection_rate))} | ${mean(rs, r => r.backtracks).toFixed(1)} | ` +
    `${c('F1-state-tracking')} | ${c('F2-off-pattern')} | ${c('F3-wrong-stack')} | ${c('F4-shallow-search')} |`);
}
md.push('', '## Cycling-threshold sensitivity (offline)', '',
  'For each limit k: episodes that WOULD have been stopped by the k-repeat rule before their actual end, ' +
  'and how many of those were actually solved (a stricter limit would have cost them). Limits above ' +
  'the one used are censored for cycling stops and need reruns (scripts/rebuttal/run_cycling_sensitivity.sh).', '',
  '| k | stopped earlier | of which solved | censored (needs rerun) |', '| --- | --- | --- | --- |');
for (const k of LIMITS) {
  const earlier = episodes.filter(r => typeof r.would_stop_at[k] === 'number' && r.would_stop_at[k] < r.turns);
  md.push(`| ${k} | ${earlier.length} | ${earlier.filter(r => r.solved).length} | ` +
    `${episodes.filter(r => r.would_stop_at[k] === 'censored').length} |`);
}
await mkdir(OUT, {recursive: true});
await writeFile(join(OUT, 'episodes.json'), JSON.stringify(episodes, null, 2) + '\n');
await writeFile(join(OUT, 'report.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
