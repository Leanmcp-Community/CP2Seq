// Full audit of target-comparison feedback (reviewers Fff9 W2/Q2, xZky Q3).
//
// The paper's Appendix B.13 bounded the comparison-tool defect by replaying only the FINAL
// state of incorrect submissions. Reviewers correctly point out that wrong feedback at ANY
// turn can redirect the remaining search. This script audits every comparison the model was
// ever shown:
//
//   * on-demand calls (action compare_to_target -> result.comparison)
//   * automatic feedback attached to accepted folds (result.comparison_now)
//
// For each one it replays the accepted sequence recorded in that same tool result, recomputes
// the comparison with the CURRENT (fixed) compare_target.mjs at the same tier, and records
// whether the diagnosis or the number of matching layers differs from what the model saw.
// It also records whether the state truly matched the target (CP aside) under E_plane and
// E_id, so a "matches" shown on a state that is not identity-equivalent is flagged even if
// the fixed tool repeats it.
//
// Output: per-episode first divergent turn, counts by run/condition, and a rerun list
// (episodes with ANY divergent feedback). Calls no model.
//
//   node workspace/audit_compare_feedback.mjs --runs CODEX_HARNESS_TESTING/runs \
//        --out workspace/RESULTS/feedback-audit

import {readFile, readdir, stat, mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {replay, actionFromFold} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {compareToTarget} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/compare_target.mjs';
import {frameLayers, terminalMatchDetail, sessionLayers, cpSymmetries}
  from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';

const REPO = resolve(fileURLToPath(import.meta.url), '../..');
const argv = process.argv.slice(2);
const many = name => argv.flatMap((a, i) => a === name ? [argv[i + 1]] : []);
const roots = many('--runs').map(p => resolve(p));
const outDir = resolve(many('--out').at(-1) ?? join(REPO, 'workspace/RESULTS/feedback-audit'));
if (!roots.length) { console.error('usage: --runs <dir> [--runs <dir>...] [--out <dir>]'); process.exit(2); }

const readJson = async p => JSON.parse(await readFile(p, 'utf8'));
const exists = async p => { try { await stat(p); return true; } catch { return false; } };
const dirs = async p => (await exists(p))
  ? (await readdir(p, {withFileTypes: true})).filter(e => e.isDirectory()).map(e => e.name).sort() : [];

async function referenceLayers(corpus, sample) {
  const dir = join(corpus, sample);
  if (!await exists(join(dir, 'seq.json'))) return null;
  const cp = await readJson(join(dir, 'cp.fold'));
  const seq = await readJson(join(dir, 'seq.json'));
  return sessionLayers(replay(cp, seq.folds.map(actionFromFold)));
}

const episodes = [];
for (const root of roots) for (const run of await dirs(root)) {
  const runDir = join(root, run);
  if (!await exists(join(runDir, 'config.json'))) continue;
  const config = await readJson(join(runDir, 'config.json'));
  for (const ep of await dirs(runDir)) {
    const epDir = join(runDir, ep);
    if (!await exists(join(epDir, 'target.fold')) || !await exists(join(epDir, 'cp.fold'))) continue;
    const cp = await readJson(join(epDir, 'cp.fold'));
    const target = frameLayers(await readJson(join(epDir, 'target.fold')));
    const corpus = (config.corpus ?? '').replace(/^.*\/workspace\//, join(REPO, 'workspace') + '/');
    const refSheets = await referenceLayers(corpus, ep).catch(() => null);
    const syms = cpSymmetries(cp);
    const result = await exists(join(epDir, 'result.json')) ? await readJson(join(epDir, 'result.json')) : {};
    const row = {run, sample: ep, model: config.model, effort: config.reasoning_effort, tools: config.tools,
      compare_tier: config.compare_tier ?? 0, compare_auto: config.compare_auto ?? false,
      termination: result.termination ?? null, solved: result.solved ?? null,
      calls: 0, divergent: 0, first_divergent_turn: null, false_matches_shown: 0,
      matches_shown_not_identity: 0, examples: []};
    for (const turn of (await readdir(epDir)).filter(n => /^turn-\d+$/.test(n)).sort()) {
      const toolPath = join(epDir, turn, 'tool.json');
      if (!await exists(toolPath)) continue;
      const {result: r} = await readJson(toolPath);
      const shown = r?.comparison ?? r?.comparison_now;
      if (!shown || !Array.isArray(r.sequence)) continue;
      row.calls++;
      let layers, session;
      try {
        session = replay(cp, r.sequence.map(a => actionFromFold(a)));
        layers = frameLayers(session.sequence().file_frames.at(-1));
      } catch (e) { row.examples.push({turn, error: `replay: ${e.message}`}); continue; }
      const fixed = compareToTarget(layers, target, shown.tier ?? row.compare_tier ?? 3);
      const before = {d: shown.diagnosis, m: shown.alignment?.layers_matching};
      const after = {d: fixed.diagnosis, m: fixed.alignment?.layers_matching};
      const truth = refSheets ? terminalMatchDetail(sessionLayers(session), refSheets, syms) : null;
      if (before.d === 'matches' && !(truth?.plane_match ?? true)) row.false_matches_shown++;
      if (before.d === 'matches' && truth && !truth.identity_match) row.matches_shown_not_identity++;
      if (before.d !== after.d || before.m !== after.m) {
        row.divergent++;
        row.first_divergent_turn ??= turn;
        if (row.examples.length < 5) row.examples.push({turn, shown: before, fixed: after});
      }
    }
    if (row.calls) episodes.push(row);
  }
}

const cond = r => `${r.model} ${r.effort} ${r.tools} tier${r.compare_tier}${r.compare_auto ? ' auto' : ' on-demand'}`;
const byCond = new Map();
for (const r of episodes) {
  const c = byCond.get(cond(r)) ?? {episodes: 0, calls: 0, divergent_calls: 0, episodes_divergent: 0,
    false_matches: 0, identity_false_matches: 0, solved_with_divergence: 0};
  c.episodes++; c.calls += r.calls; c.divergent_calls += r.divergent;
  c.episodes_divergent += r.divergent > 0; c.false_matches += r.false_matches_shown;
  c.identity_false_matches += r.matches_shown_not_identity;
  c.solved_with_divergence += r.divergent > 0 && r.solved === true;
  byCond.set(cond(r), c);
}
const rerun = episodes.filter(r => r.divergent > 0 || r.matches_shown_not_identity > 0)
  .map(r => ({run: r.run, sample: r.sample, model: r.model, effort: r.effort, tools: r.tools,
    compare_tier: r.compare_tier, compare_auto: r.compare_auto, solved: r.solved,
    first_divergent_turn: r.first_divergent_turn}));

await mkdir(outDir, {recursive: true});
await writeFile(join(outDir, 'report.json'), JSON.stringify({generated_at: new Date().toISOString(),
  roots, episodes, by_condition: Object.fromEntries(byCond), rerun}, null, 2) + '\n');
await writeFile(join(outDir, 'rerun.tsv'), rerun.map(r =>
  [r.model, r.effort, r.tools, r.compare_tier, r.compare_auto, r.sample, r.run].join('\t')).join('\n') + '\n');
const md = ['# Comparison-feedback audit (every call, not only final states)', '',
  `Episodes with any comparison feedback: ${episodes.length}; calls audited: ${episodes.reduce((s, r) => s + r.calls, 0)}.`, '',
  '| condition | episodes | calls | divergent calls | episodes with divergence | false "matches" (E_plane) | "matches" not E_id | solved despite divergence |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...[...byCond].map(([k, c]) => `| ${k} | ${c.episodes} | ${c.calls} | ${c.divergent_calls} | ${c.episodes_divergent} | ${c.false_matches} | ${c.identity_false_matches} | ${c.solved_with_divergence} |`),
  '', `Episodes to rerun (any divergent call, or any "matches" on a non-E_id state): ${rerun.length}. See rerun.tsv.`];
await writeFile(join(outDir, 'report.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
