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
// Re-runs nothing and calls no model: it reads each episode's saved final.fold
// and target.fold, which are the exact artifacts the harness scored.

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameLayers, terminalMatch, strictTerminalMatch, TERMINAL_METRIC }
  from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';

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

// One episode: recompute the terminal comparison from the saved frames.
async function rescoreEpisode(episodeDir) {
  const resultPath = join(episodeDir, 'result.json');
  if (!await exists(resultPath)) return null;
  const before = await readJson(resultPath);
  const finalPath = join(episodeDir, 'final.fold'), targetPath = join(episodeDir, 'target.fold');
  if (!await exists(finalPath) || !await exists(targetPath)) {
    return {id: before.sample_id, status: 'no-artifacts', before, after: null};
  }
  let terminal, strict;
  try {
    const layers = frameLayers(await readJson(finalPath));
    const target = frameLayers(await readJson(targetPath));
    terminal = terminalMatch(layers, target);
    strict = strictTerminalMatch(layers, target);
  } catch (e) {
    // An episode that never produced a foldable terminal frame stays unsolved.
    return {id: before.sample_id, status: `ungradable: ${e.message}`, before, after: null};
  }
  const pilot = Boolean(before.cp_match) && terminal;
  const after = {
    ...before,
    terminal_reference_match: terminal,
    pilot_match: pilot,
    solved: before.termination === 'finished' && pilot,
    terminal_metric: TERMINAL_METRIC,
    terminal_match_fixed_coordinates: strict,
  };
  const flipped = after.solved !== before.solved || after.terminal_reference_match !== before.terminal_reference_match;
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
lines.push('# Re-score under the isometry-quotient terminal metric', '');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Metric: ${TERMINAL_METRIC}`, '');
lines.push(`Episodes graded: ${all.length}`);
lines.push(`Solved before: ${solvedBefore}`);
lines.push(`Solved after: ${solvedAfter}`);
lines.push(`Rows changed: ${changed.length}`, '');
for (const {runDir, episodes} of runs) {
  lines.push(`## ${relative(REPO, runDir)}`, '');
  lines.push('| sample | termination | cp_match | terminal was | terminal now | solved was | solved now |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of episodes) {
    const a = r.after ?? {};
    lines.push(`| ${r.id} | ${r.before.termination ?? '—'} | ${r.before.cp_match ?? '—'} | ` +
      `${r.before.terminal_reference_match ?? '—'} | ${a.terminal_reference_match ?? r.status} | ` +
      `${r.before.solved ?? '—'} | ${a.solved ?? '—'} |`);
  }
  lines.push('');
}
const reportPath = join(REPO, 'workspace', 'RESCORE_REPORT.md');
if (!dryRun) await writeFile(reportPath, lines.join('\n'));

console.log(lines.join('\n'));
console.log(dryRun ? '\nDRY RUN — nothing written.'
  : `\nRewrote result.json / results.json in ${runs.length} runs. Report: ${relative(REPO, reportPath)}`);
