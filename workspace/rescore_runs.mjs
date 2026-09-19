// Re-score every saved fold run under the isometry-quotient terminal metric.
//
// Why: the pilot compared the final layer stack to the reference in absolute
// coordinates. A correct fold sequence that moves the other half of the sheet
// lands the identical folded object translated, rotated or mirrored, and was
// scored wrong. terminal_match.mjs now quotients the plane isometry group out.
//
// This rewrites result.json and results.json in place with the corrected
// numbers. The superseded values are NOT kept in the run folders; they survive
// only in the report this writes, so nothing stale gets read back as a score.
//
// Usage:
//   node workspace/rescore_runs.mjs                 # rewrite every run
//   node workspace/rescore_runs.mjs --dry-run       # report only, touch nothing
//   node workspace/rescore_runs.mjs --root <dir>    # limit to one runs/ tree
//
// Calls no model. Replays saved seq.json against cp.fold through the experiment
// verifier, including tearing, before scoring against target.fold. Final images
// alone cannot establish that every earlier step was legal.

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameLayers, strictTerminalMatch, TERMINAL_METRIC }
  from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';
import {FoldSession, actionFromFold} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {evaluateSession} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/evaluation.mjs';

const REPO = resolve(fileURLToPath(import.meta.url), '../..');
const DEFAULT_ROOTS = [
  join(REPO, 'CODEX_HARNESS_TESTING/runs'),
  join(REPO, 'DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/runs'),
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const rootFlag = args.indexOf('--root');
const roots = rootFlag === -1 ? DEFAULT_ROOTS : [resolve(args[rootFlag + 1])];

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
const exists = async path => { try { await stat(path); return true; } catch { return false; } };

async function subdirs(dir) {
  if (!await exists(dir)) return [];
  const entries = await readdir(dir, {withFileTypes: true});
  return entries.filter(e => e.isDirectory()).map(e => e.name).sort();
}

// One episode: use the same fold verifier and evaluation function as live tools.
async function rescoreEpisode(episodeDir) {
  const resultPath = join(episodeDir, 'result.json');
  if (!await exists(resultPath)) return null;
  const before = await readJson(resultPath);
  const cpPath = join(episodeDir, 'cp.fold'), seqPath = join(episodeDir, 'seq.json'), targetPath = join(episodeDir, 'target.fold');
  if (!await exists(cpPath) || !await exists(seqPath) || !await exists(targetPath)) {
    return {id: before.sample_id, status: 'no-artifacts', before, after: null};
  }
  let evaluation, strict = false, replayFailure = null;
  try {
    const session = new FoldSession(await readJson(cpPath));
    const sequence = await readJson(seqPath);
    if (!Array.isArray(sequence.folds)) throw Error('seq.json lacks a folds array');
    const target = frameLayers(await readJson(targetPath));
    for (const [index, fold] of sequence.folds.entries()) {
      let result;
      try { result = session.apply(actionFromFold(fold)); }
      catch (error) { result = {ok:false,error:'invalid-action',detail:error.message}; }
      if (!result.ok) { replayFailure = {step:index+1,...result}; break; }
    }
    evaluation = evaluateSession(session, target);
    strict = strictTerminalMatch(session.layers, target);
  } catch (e) {
    // An episode that never produced a foldable terminal frame stays unsolved.
    return {id: before.sample_id, status: `ungradable: ${e.message}`, before, after: null};
  }
  const pilot = !replayFailure && evaluation.pilot_match;
  const after = {
    ...before,
    ...evaluation,
    replay_valid: !replayFailure,
    replay_failure: replayFailure,
    rescore_scope: 'Replayed saved accepted sequence through live experiment verifier; on failure, geometry metrics describe the valid prefix. Rejected model attempts are not in seq.json.',
    pilot_match: pilot,
    solved: before.termination === 'finished' && pilot,
    terminal_metric: TERMINAL_METRIC,
    terminal_match_fixed_coordinates: strict,
  };
  const flipped = after.solved !== before.solved || after.terminal_reference_match !== before.terminal_reference_match
    || after.cp_match !== before.cp_match || Boolean(replayFailure);
  return {id: before.sample_id, status: flipped ? 'changed' : 'same', before, after};
}

async function rescoreRun(runDir) {
  const episodes = [];
  for (const name of await subdirs(runDir)) {
    if (name === 'episodes') continue;
    const row = await rescoreEpisode(join(runDir, name));
    if (row) episodes.push(row);
  }
  if (!episodes.length) return null;
  if (!dryRun) {
    for (const row of episodes) {
      if (row.after) await writeJson(join(runDir, row.id, 'result.json'), row.after);
    }
    // Rebuild the run-level roll-up, preserving its original episode order and
    // any rows (harness errors) that have no artifacts to re-score.
    const listPath = join(runDir, 'results.json');
    if (await exists(listPath)) {
      const list = await readJson(listPath);
      const byId = new Map(episodes.filter(r => r.after).map(r => [r.id, r.after]));
      await writeJson(listPath, list.map(row => byId.get(row.sample_id) ?? row));
    }
  }
  return {runDir, episodes};
}

const runs = [];
for (const root of roots) {
  for (const name of await subdirs(root)) {
    const out = await rescoreRun(join(root, name));
    if (out) runs.push(out);
  }
}

const all = runs.flatMap(r => r.episodes);
const solvedBefore = all.filter(r => r.before.solved === true).length;
const solvedAfter = all.filter(r => r.after?.solved === true).length;
const changed = all.filter(r => r.status === 'changed');

const lines = [];
lines.push('# Re-score by legal sequence replay and the experiment terminal metric', '');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Metric: ${TERMINAL_METRIC}`, '');
lines.push(`Episodes graded: ${all.length}`);
lines.push(`Solved before: ${solvedBefore}`);
lines.push(`Solved after: ${solvedAfter}`);
lines.push(`Rows changed: ${changed.length}`, '');
lines.push(`Replay failures: ${all.filter(r => r.after?.replay_valid === false).length}`, '');
for (const {runDir, episodes} of runs) {
  lines.push(`## ${relative(REPO, runDir)}`, '');
  lines.push('| sample | termination | cp now | terminal was | terminal now | solved was | solved now | replay |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of episodes) {
    const a = r.after ?? {};
    lines.push(`| ${r.id} | ${r.before.termination ?? '—'} | ${a.cp_match ?? '—'} | ` +
      `${r.before.terminal_reference_match ?? '—'} | ${a.terminal_reference_match ?? r.status} | ` +
      `${r.before.solved ?? '—'} | ${a.solved ?? '—'} | ${a.replay_failure ? `step ${a.replay_failure.step}: ${a.replay_failure.error}` : a.replay_valid ? 'legal' : r.status} |`);
  }
  lines.push('');
}
const reportPath = join(REPO, 'workspace', 'RESCORE_REPORT.md');
if (!dryRun) await writeFile(reportPath, lines.join('\n'));

console.log(lines.join('\n'));
console.log(dryRun ? '\nDRY RUN — nothing written.'
  : `\nRewrote result.json / results.json in ${runs.length} runs. Report: ${relative(REPO, reportPath)}`);
