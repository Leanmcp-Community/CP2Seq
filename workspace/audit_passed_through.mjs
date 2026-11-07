// "Passed through the target without submitting" audit. Calls NO model.
//
// For every saved episode, replay every accepted state the model visited and check it
// against the reference target with the automatic goal test the baselines use
// (CP match + E_id). This is exactly what an oracle-stop rule ("the program checks after
// every accepted fold and ends the episode as solved on the first match") would have scored
// on the SAME trajectories: until the first match the model saw nothing different, so the
// trajectory up to that point is unchanged.
//
// Visited states come from history.json (every accepted result carries the current
// `sequence`, so undone branches are included). When history.json is missing, the prefixes
// of the final seq.json are used instead; that misses states the model later undid, so it is
// a lower bound, and the report marks those episodes.
//
//   node workspace/audit_passed_through.mjs --runs CODEX_HARNESS_TESTING/runs \
//        --out workspace/RESULTS/passed-through
//
// --runs may be repeated.

import {readFile, readdir, stat, mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FoldSession, actionFromFold, replay} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {terminalMatchDetail, sessionLayers, cpSymmetries} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';

const REPO = resolve(fileURLToPath(import.meta.url), '../..');
const RELEASE = join(REPO, 'workspace/corpus/out/release');
const argv = process.argv.slice(2);
const many = n => argv.flatMap((a, i) => a === n ? [argv[i + 1]] : []);
const runsRoots = (many('--runs').length ? many('--runs') : [join(REPO, 'CODEX_HARNESS_TESTING/runs')]).map(p => resolve(p));
const outDir = resolve(many('--out').at(-1) ?? join(REPO, 'workspace/RESULTS/passed-through'));

const readJson = async p => JSON.parse(await readFile(p, 'utf8'));
const exists = async p => { try { await stat(p); return true; } catch { return false; } };
const dirs = async p => (await exists(p))
  ? (await readdir(p, {withFileTypes: true})).filter(e => e.isDirectory()).map(e => e.name).sort() : [];

const ACTION_KEYS = ['angle_index', 'angle_degrees', 'selection_mode', 'layer_count', 'offset', 'move_positive', 'over'];
const toAction = f => {
  const a = {tool: 'apply_fold'};
  for (const k of ACTION_KEYS) if (f[k] !== null && f[k] !== undefined) a[k] = f[k];
  if (a.selection_mode === 'all') delete a.layer_count;
  return a;
};

function corpusFor(config, sample) {
  if (config.corpus) {
    const c = config.corpus.replace(/^.*\/workspace\//, join(REPO, 'workspace') + '/');
    return join(c, sample);
  }
  return join(RELEASE, sample.startsWith('layers-') ? 'some-generated-d5/samples' : 'all-layers/samples', sample);
}

const targets = new Map();
async function target(sampleDir) {
  if (!targets.has(sampleDir)) {
    const cp = await readJson(join(sampleDir, 'cp.fold'));
    const seq = await readJson(join(sampleDir, 'seq.json'));
    targets.set(sampleDir, {cp, syms: cpSymmetries(cp),
      layers: sessionLayers(replay(cp, seq.folds.map(actionFromFold)))});
  }
  return targets.get(sampleDir);
}

function matches(session, t) {
  if (session.layers.length !== t.layers.length || !session.evaluate().cp_match) return false;
  return terminalMatchDetail(sessionLayers(session), t.layers, t.syms).identity_match;
}

async function visitedSequences(epDir) {
  if (await exists(join(epDir, 'history.json'))) {
    const h = await readJson(join(epDir, 'history.json'));
    const list = Array.isArray(h) ? h : h.history ?? [];
    const out = [];
    for (const [turn, e] of list.entries())
      if (e.result?.ok && Array.isArray(e.result.sequence)) out.push({turn: turn + 1, seq: e.result.sequence});
    return {source: 'history', states: out};
  }
  const seq = await readJson(join(epDir, 'seq.json'));
  return {source: 'final-prefixes',
    states: seq.folds.map((_, i) => ({turn: null, seq: seq.folds.slice(0, i + 1)}))};
}

const rows = [];
for (const root of runsRoots) for (const run of await dirs(root)) {
  const runDir = join(root, run);
  if (!await exists(join(runDir, 'config.json'))) continue;
  const config = await readJson(join(runDir, 'config.json'));
  for (const ep of await dirs(runDir)) {
    const epDir = join(runDir, ep);
    if (!await exists(join(epDir, 'result.json'))) continue;
    const res = await readJson(join(epDir, 'result.json'));
    const sample = res.sample_id ?? ep;
    const row = {run, sample, model: config.model, effort: config.reasoning_effort,
      tools: config.tools, compare_auto: !!config.compare_auto, geometry: config.geometry ?? 'json',
      submitted_solved: res.solved === true};
    try {
      const t = await target(corpusFor(config, sample));
      const {source, states} = await visitedSequences(epDir);
      row.source = source; row.states_checked = states.length;
      const seen = new Set();
      for (const s of states) {
        const key = JSON.stringify(s.seq);
        if (seen.has(key)) continue;
        seen.add(key);
        const session = replay(t.cp, s.seq.map(f => f.line || f.step ? actionFromFold(f) : toAction(f)));
        if (matches(session, t)) { row.first_match = {turn: s.turn, depth: s.seq.length}; break; }
      }
    } catch (e) { row.error = e.message; }
    rows.push(row);
  }
}

const key = r => `${r.model} | ${r.effort} | ${r.tools}${r.compare_auto ? '+auto' : ''} | ${r.geometry}`;
const groups = new Map();
for (const r of rows) { if (!groups.has(key(r))) groups.set(key(r), []); groups.get(key(r)).push(r); }

const md = ['# Passed-through audit (oracle-stop on existing trajectories)', '',
  'Each episode\'s visited accepted states are replayed and checked with CP match + E_id.',
  '"Reached, not submitted" = some visited state matched the target but the episode is not scored solved.',
  '"Oracle-stop solves" = submitted solves + reached-not-submitted: what an automatic stop rule would score on these trajectories.', '',
  '| model | effort | tools | geometry | episodes | submitted solved | reached, not submitted | oracle-stop solves | solved but no match on replay | from final seq only | errors |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
for (const [k, g] of [...groups].sort()) {
  const ok = g.filter(r => !r.error);
  const sub = ok.filter(r => r.submitted_solved).length;
  const missed = ok.filter(r => !r.submitted_solved && r.first_match).length;
  const ghost = ok.filter(r => r.submitted_solved && !r.first_match).length;
  md.push(`| ${k.split(' | ').join(' | ')} | ${g.length} | ${sub} | ${missed} | ${sub + missed} | ${ghost} | ${ok.filter(r => r.source === 'final-prefixes').length} | ${g.length - ok.length} |`);
}
md.push('', '## Reached the target but not scored solved', '');
for (const r of rows.filter(r => !r.error && !r.submitted_solved && r.first_match))
  md.push(`- ${r.run} ${r.sample} (${key(r)}): first match at turn ${r.first_match.turn ?? '?'}, depth ${r.first_match.depth}`);
const errs = rows.filter(r => r.error);
if (errs.length) { md.push('', '## Replay errors', ''); for (const r of errs) md.push(`- ${r.run} ${r.sample}: ${r.error}`); }

await mkdir(outDir, {recursive: true});
await writeFile(join(outDir, 'report.json'), JSON.stringify({generated_at: new Date().toISOString(), runs_roots: runsRoots, rows}, null, 2) + '\n');
await writeFile(join(outDir, 'report.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
