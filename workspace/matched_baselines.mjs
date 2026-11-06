// Matched baselines on the 40 ablation samples (reviewer Fff9 W3/Q3, xZky W1).
//
// Same instances as the Luna ablations (easy/mid/hard-0001..0010 from all-layers,
// layers-0001..0010 from some-generated-d5), same action space as each group's model runs
// (all-layers for easy/mid/hard, any selection for some-layers), same legal-fold enumerator
// the model is given, no reference sequence. Success = CP match AND terminal E_id (identity-
// aware, modulo CP symmetries); E_plane success is recorded too.
//
// Budgets are explicit and reported with every number:
//   random   R independent episodes per sample, each with T fold applications (default 80,
//            the model's turn budget). Each step applies a uniformly random legal fold; when no
//            legal fold exists or the stack exceeds the target layer count, the episode resets
//            to the flat sheet (the reset costs no fold). Success is checked after every fold:
//            this oracle check is MORE generous than the model, which must decide to finish.
//   bfs      breadth-first over distinct states (identity-keyed), goal test after every
//            expansion, under each node-expansion budget in --bfs-budgets AND a wall-clock cap.
//            One BFS run per sample records the expansion count at which it first solved, so
//            every budget in the list is read off the same search.
//
//   node workspace/matched_baselines.mjs --random-episodes 100 --turns 80 \
//        --bfs-budgets 80,1000,10000,100000 --bfs-seconds 600 --seed 1 \
//        --out workspace/RESULTS/matched-baselines
//
// --groups easy,mid,hard,layers   --ids 10   --only random|bfs

import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FoldSession, replay, actionFromFold} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalFolds} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs';
import {terminalMatchDetail, sessionLayers, cpSymmetries}
  from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';

const REPO = resolve(fileURLToPath(import.meta.url), '../..');
const RELEASE = join(REPO, 'workspace/corpus/out/release');
const argv = process.argv.slice(2);
const opt = (n, f) => { const i = argv.lastIndexOf(n); return i < 0 ? f : argv[i + 1]; };
const R = Number(opt('--random-episodes', 100)), TURNS = Number(opt('--turns', 80));
const BUDGETS = opt('--bfs-budgets', '80,1000,10000,100000').split(',').map(Number);
const BFS_SECONDS = Number(opt('--bfs-seconds', 600)), SEED = Number(opt('--seed', 1));
const GROUPS = opt('--groups', 'easy,mid,hard,layers').split(','), IDS = Number(opt('--ids', 10));
const ONLY = opt('--only', 'random,bfs');
const OUT = resolve(opt('--out', join(REPO, 'workspace/RESULTS/matched-baselines')));
const readJson = async p => JSON.parse(await readFile(p, 'utf8'));

function rng(s) {
  return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

async function loadSample(group, i) {
  const sample = `${group}-${String(i).padStart(4, '0')}`;
  const dir = group === 'layers' ? join(RELEASE, 'some-generated-d5/samples', sample)
                                 : join(RELEASE, 'all-layers/samples', sample);
  const cp = await readJson(join(dir, 'cp.fold')), seq = await readJson(join(dir, 'seq.json'));
  const target = sessionLayers(replay(cp, seq.folds.map(actionFromFold)));
  return {sample, group, cp, target, depth: seq.folds.length, syms: cpSymmetries(cp),
    filter: group === 'layers' ? 'any' : 'all'};
}

function solvedBy(session, s) {
  if (session.layers.length !== s.target.length) return {plane: false, identity: false};
  if (!session.evaluate().cp_match) return {plane: false, identity: false};
  const d = terminalMatchDetail(sessionLayers(session), s.target, s.syms);
  return {plane: d.plane_match, identity: d.identity_match};
}

const legal = (session, s) =>
  enumerateLegalFolds(session, {max_results: 100000, selection_filter: s.filter}).legal_folds;

function randomBaseline(s, rand) {
  let identity = 0, plane = 0, enumerations = 0;
  const t0 = Date.now();
  for (let e = 0; e < R; e++) {
    let session = new FoldSession(s.cp), hitI = false, hitP = false;
    for (let t = 0; t < TURNS && !hitI; t++) {
      let options = legal(session, s); enumerations++;
      if (!options.length || session.layers.length > s.target.length) {
        session = new FoldSession(s.cp); options = legal(session, s); enumerations++;
      }
      const pick = options[Math.floor(rand() * options.length)];
      session.apply({tool: 'apply_fold', ...pick.action});
      const j = solvedBy(session, s);
      hitI ||= j.identity; hitP ||= j.plane;
    }
    identity += hitI; plane += hitP;
  }
  return {episodes: R, turns: TURNS, solved_identity: identity, solved_plane: plane,
    enumerations, seconds: (Date.now() - t0) / 1000};
}

function stateKey(session) {
  const r = v => Math.round(v * 1e5);
  return sessionLayers(session).map(l => `${l.par}|${l.sheet.map(p => r(p[0]) + ',' + r(p[1])).join(';')}|` +
    l.poly.map(p => r(p[0]) + ',' + r(p[1])).join(';')).join('/');
}

function bfsBaseline(s) {
  const t0 = Date.now(), maxBudget = Math.max(...BUDGETS);
  const seen = new Set([stateKey(new FoldSession(s.cp))]);
  let frontier = [[]], expanded = 0, firstIdentity = null, firstPlane = null, stop = 'exhausted';
  outer: while (frontier.length) {
    const next = [];
    for (const path of frontier) {
      if (expanded >= maxBudget) { stop = 'expansion-budget'; break outer; }
      if ((Date.now() - t0) / 1000 > BFS_SECONDS) { stop = 'wall-clock'; break outer; }
      if (path.length >= s.depth + 4) continue;   // depth cap: reference depth + 4
      const session = replay(s.cp, path);
      expanded++;
      for (const f of legal(session, s)) {
        const child = replay(s.cp, path);
        const action = {tool: 'apply_fold', ...f.action};
        if (!child.apply(action).ok) continue;
        const key = stateKey(child);
        if (seen.has(key)) continue;
        seen.add(key);
        const j = solvedBy(child, s);
        if (j.plane && firstPlane === null) firstPlane = expanded;
        if (j.identity) { firstIdentity = expanded; stop = 'solved'; break outer; }
        if (child.layers.length <= s.target.length) next.push([...path, action]);
      }
    }
    frontier = next;
  }
  return {expanded, distinct_states: seen.size, stop, seconds: (Date.now() - t0) / 1000,
    first_solved_at_expansion_identity: firstIdentity, first_solved_at_expansion_plane: firstPlane,
    by_budget: Object.fromEntries(BUDGETS.map(b => [b, firstIdentity !== null && firstIdentity <= b])),
    wall_clock_cap_s: BFS_SECONDS};
}

await mkdir(OUT, {recursive: true});
const rand = rng(SEED), rows = [];
for (const g of GROUPS) for (let i = 1; i <= IDS; i++) {
  const s = await loadSample(g, i);
  const row = {sample: s.sample, group: g, depth: s.depth};
  if (ONLY.includes('random')) row.random = randomBaseline(s, rand);
  if (ONLY.includes('bfs')) row.bfs = bfsBaseline(s);
  console.error(`${s.sample} d=${s.depth}` +
    (row.random ? ` random ${row.random.solved_identity}/${R}` : '') +
    (row.bfs ? ` bfs ${row.bfs.stop} @${row.bfs.first_solved_at_expansion_identity ?? '-'}` : ''));
  rows.push(row);
  await writeFile(join(OUT, 'rows.json'), JSON.stringify(rows, null, 2) + '\n');
}

const md = ['# Matched baselines on the 40 ablation samples', '',
  `Seed ${SEED}. Random: ${R} episodes x ${TURNS} folds per sample, oracle success check after every fold. ` +
  `BFS: identity-keyed dedup, depth cap reference+4, wall clock ${BFS_SECONDS}s, budgets ${BUDGETS.join(', ')} expansions.`, '',
  '| group | samples | random: samples with >=1 solve | random: mean per-episode solve rate | ' +
  BUDGETS.map(b => `BFS solved <=${b}`).join(' | ') + ' |',
  '| --- | --- | --- | --- | ' + BUDGETS.map(() => '---').join(' | ') + ' |'];
for (const g of GROUPS) {
  const rs = rows.filter(r => r.group === g);
  const anyR = rs.filter(r => r.random?.solved_identity > 0).length;
  const meanR = rs.length && rs[0].random ? (rs.reduce((a, r) => a + r.random.solved_identity / R, 0) / rs.length).toFixed(3) : '-';
  md.push(`| ${g} | ${rs.length} | ${rs[0]?.random ? anyR : '-'} | ${meanR} | ` +
    BUDGETS.map(b => rs[0]?.bfs ? rs.filter(r => r.bfs.by_budget[b]).length : '-').join(' | ') + ' |');
}
await writeFile(join(OUT, 'report.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
