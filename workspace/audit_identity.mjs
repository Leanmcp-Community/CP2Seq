// Identity audit for the terminal comparator (reviewers Fff9 Q1, xZky Q1).
//
// Scoring decides `solved` with E_plane: crease pattern match AND one plane isometry carrying
// every current-plane polygon and parity onto the target's at the same rank. E_plane does not
// look at WHICH original-sheet region sits at each rank. E_id adds that check. This script
// measures, on real data, whether the two relations ever disagree once the CP already matches.
//
// Part A  accepted solutions: every saved episode whose result.json says solved=true is
//         replayed (its own seq.json) and compared against the replayed REFERENCE sequence
//         from the corpus, under both relations.
// Part B  adversarial search: from the flat sheet, random legal rollouts of exactly the
//         reference depth (uniform over the distinct legal folds the model's own enumerator
//         returns), plus every rollout's terminal state checked for CP match, E_plane and E_id.
//         Any CP+E_plane hit that fails E_id is a counterexample and is written out in full.
//
// Calls no model. Deterministic given --seed.
//
//   node workspace/audit_identity.mjs --runs CODEX_HARNESS_TESTING/runs \
//        --rollouts 200 --seed 1 --out workspace/RESULTS/identity-audit
//
// --runs may be repeated. --groups limits Part B (default easy,mid,hard,layers).
// --part A or --part B runs one half only.

import {readFile, readdir, stat, mkdir, writeFile} from 'node:fs/promises';
import {join, resolve, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FoldSession, actionFromFold, replay} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalFolds} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs';
import {terminalMatchDetail, sessionLayers, cpSymmetries} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';

const REPO = resolve(fileURLToPath(import.meta.url), '../..');
const RELEASE = join(REPO, 'workspace/corpus/out/release');
const argv = process.argv.slice(2);
const many = name => argv.flatMap((a, i) => a === name ? [argv[i + 1]] : []);
const one = (name, fallback) => many(name).at(-1) ?? fallback;
const runsRoots = many('--runs').map(p => resolve(p));
const rollouts = Number(one('--rollouts', 200));
const seed = Number(one('--seed', 1));
const outDir = resolve(one('--out', join(REPO, 'workspace/RESULTS/identity-audit')));
const groups = one('--groups', 'easy,mid,hard,layers').split(',');
const ids = Number(one('--ids', 10));          // reference IDs 0001..N per group (ablation set)
const part = one('--part', 'AB');

const readJson = async p => JSON.parse(await readFile(p, 'utf8'));
const exists = async p => { try { await stat(p); return true; } catch { return false; } };
const dirs = async p => (await exists(p))
  ? (await readdir(p, {withFileTypes: true})).filter(e => e.isDirectory()).map(e => e.name).sort() : [];

// mulberry32: small, seedable, reproducible across Node versions.
function rng(s) {
  return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

async function referenceLayers(sampleDir) {
  const cp = await readJson(join(sampleDir, 'cp.fold'));
  const seq = await readJson(join(sampleDir, 'seq.json'));
  return {cp, steps: seq.folds.length,
    layers: sessionLayers(replay(cp, seq.folds.map(actionFromFold)))};
}

// identity        = E_id modulo CP symmetries (the relation we propose for scoring)
// identity_strict = E_id with the identity map only
function judge(session, target) {
  const cp = session.evaluate().cp_match;
  const d = terminalMatchDetail(sessionLayers(session), target, cpSymmetries(session.cp));
  return {cp_match: cp, plane: cp && d.plane_match, identity: cp && d.identity_match,
    identity_strict: cp && d.identity_strict_match, cp_symmetries: d.cp_symmetries};
}

// ---- Part A -----------------------------------------------------------------------------
async function partA() {
  const rows = [];
  for (const root of runsRoots) for (const run of await dirs(root)) {
    const runDir = join(root, run);
    const config = await exists(join(runDir, 'config.json')) ? await readJson(join(runDir, 'config.json')) : {};
    for (const ep of await dirs(runDir)) {
      const resPath = join(runDir, ep, 'result.json');
      if (!await exists(resPath)) continue;
      const res = await readJson(resPath);
      if (res.solved !== true) continue;
      const corpus = config.corpus ?? join(RELEASE, 'all-layers/samples');
      const sampleDir = join(corpus, res.sample_id ?? ep);
      const row = {run, sample: res.sample_id ?? ep, model: config.model, tools: config.tools,
        compare_auto: config.compare_auto ?? false};
      try {
        const ref = await referenceLayers(await exists(sampleDir) ? sampleDir : sampleDir.replace(/^.*\/workspace\//, join(REPO, 'workspace') + '/'));
        const seq = await readJson(join(runDir, ep, 'seq.json'));
        const session = replay(ref.cp, seq.folds.map(actionFromFold));
        Object.assign(row, judge(session, ref.layers));
      } catch (e) { row.error = e.message; }
      rows.push(row);
    }
  }
  return rows;
}

// ---- Part B -----------------------------------------------------------------------------
async function partB() {
  const rand = rng(seed), out = [];
  for (const group of groups) {
    const corpus = group === 'layers' ? join(RELEASE, 'some-generated-d5/samples') : join(RELEASE, 'all-layers/samples');
    const filter = group === 'layers' ? 'any' : 'all';
    for (let i = 1; i <= ids; i++) {
      const sample = `${group}-${String(i).padStart(4, '0')}`;
      const ref = await referenceLayers(join(corpus, sample));
      const tally = {sample, steps: ref.steps, rollouts, completed: 0, cp_match: 0, plane: 0, identity: 0,
        counterexamples: []};
      const t0 = Date.now();
      for (let r = 0; r < rollouts; r++) {
        const session = new FoldSession(ref.cp);
        let ok = true;
        for (let d = 0; d < ref.steps; d++) {
          const legal = enumerateLegalFolds(session, {max_results: 10000, selection_filter: filter}).legal_folds;
          if (!legal.length) { ok = false; break; }
          const pick = legal[Math.floor(rand() * legal.length)];
          if (!session.apply({tool: 'apply_fold', ...pick.action}).ok) { ok = false; break; }
        }
        if (!ok) continue;
        tally.completed++;
        const j = judge(session, ref.layers);
        tally.cp_match += j.cp_match; tally.plane += j.plane; tally.identity += j.identity;
        if (j.plane && !j.identity) tally.counterexamples.push(session.actions);
      }
      tally.seconds = (Date.now() - t0) / 1000;
      console.error(`${sample}: ${tally.completed}/${rollouts} rollouts, CP ${tally.cp_match}, ` +
        `E_plane ${tally.plane}, E_id ${tally.identity}, counterexamples ${tally.counterexamples.length}`);
      out.push(tally);
    }
  }
  return out;
}

await mkdir(outDir, {recursive: true});
const report = {generated_at: new Date().toISOString(), seed, rollouts, runs_roots: runsRoots};
if (part.includes('A')) report.accepted = await partA();
if (part.includes('B')) report.adversarial = await partB();
await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');

const md = ['# Identity audit (E_plane vs E_id)', '', `Generated ${report.generated_at}; seed ${seed}.`, ''];
if (report.accepted) {
  const a = report.accepted, err = a.filter(r => r.error);
  const flips = a.filter(r => r.plane && !r.identity);
  const strictFlips = a.filter(r => r.plane && !r.identity_strict);
  md.push('## A. Accepted solutions', '',
    `Solved episodes replayed: ${a.length} (replay errors: ${err.length}).`,
    `Pass CP+E_plane on replay: ${a.filter(r => r.plane).length}.`,
    `Pass CP+E_id on replay: ${a.filter(r => r.identity).length}.`,
    `Accepted under E_plane but rejected under strict E_id (no CP symmetry): ${strictFlips.length}.`,
    `Accepted under E_plane but rejected under E_id modulo CP symmetries: **${flips.length}**.`, '');
  for (const r of [...flips, ...err]) md.push(`- ${r.run} ${r.sample} ${r.error ?? 'E_id mismatch'}`);
  md.push('');
}
if (report.adversarial) {
  const b = report.adversarial, sum = k => b.reduce((s, t) => s + t[k], 0);
  md.push('## B. Random legal rollouts at reference depth', '',
    '| sample | depth | completed | CP match | CP+E_plane | CP+E_id | counterexamples | s |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...b.map(t => `| ${t.sample} | ${t.steps} | ${t.completed} | ${t.cp_match} | ${t.plane} | ${t.identity} | ${t.counterexamples.length} | ${t.seconds.toFixed(1)} |`),
    `| **total** | | ${sum('completed')} | ${sum('cp_match')} | ${sum('plane')} | ${sum('identity')} | ${b.reduce((s, t) => s + t.counterexamples.length, 0)} | |`, '');
}
await writeFile(join(outDir, 'report.md'), md.join('\n'));
console.log(md.join('\n'));
