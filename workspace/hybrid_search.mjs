// LLM-guided best-first search vs. the same search with random ordering (quick test).
//
// Question: does an LLM's ranking of legal folds make search find solutions with FEWER
// expansions than blind ordering? Everything except the ranker is identical:
//   * same legal-fold enumerator the models use, same action space per group
//   * same goal test (CP match + E_id), applied to every generated child, as in BFS
//   * same identity-keyed duplicate detection and the same expansion budget
// Search: best-first on cumulative rank cost. Expanding a node enumerates its legal folds;
// the ranker orders them; child cost = parent cost + rank (0 = best), unranked children
// get rank = number of candidates. Ties go to the deeper node.
//
//   node workspace/hybrid_search.mjs --ranker random --budget 200          # free control
//   ANTHROPIC_API_KEY=... node workspace/hybrid_search.mjs --ranker llm --budget 200
//
// --samples easy-0003,mid-0001,...  (default: easy-0003 and mid-0001..0010, the instances
//                                     BFS does not solve within 1,000 expansions)
// --model claude-haiku-5-5  --effort low  --top 10  --seed 1  --out <dir>
// Every LLM call's prompt size, usage and ranking is logged to <out>/calls.jsonl.

import {mkdir, writeFile, appendFile, readFile} from 'node:fs/promises';
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
const RANKER = opt('--ranker', 'random');
const BUDGET = Number(opt('--budget', 200));
const MODEL = opt('--model', 'claude-haiku-5-5');
const EFFORT = opt('--effort', 'low');
const TOP = Number(opt('--top', 10));
const SEED = Number(opt('--seed', 1));
const SAMPLES = opt('--samples', ['easy-0003', ...Array.from({length: 10}, (_, i) =>
  `mid-${String(i + 1).padStart(4, '0')}`)].join(',')).split(',');
const OUT = resolve(opt('--out', join(REPO, `workspace/RESULTS/hybrid-${RANKER}`)));
// Haiku 5.5 list price, $ per 1M tokens (input, output); used only for the cost estimate.
const PRICE = {in: 0.10, out: 0.50};

function rng(s) {
  return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rand = rng(SEED);
const r3 = v => Math.round(v * 1000) / 1000;
const layersView = layers => layers.map((l, i) => ({rank: i, parity: l.par, polygon: l.poly.map(p => p.map(r3))}));

let client = null;
if (RANKER === 'llm') {
  const {default: Anthropic} = await import('@anthropic-ai/sdk').catch(() => {
    console.error('Install the SDK first: npm install @anthropic-ai/sdk'); process.exit(2);
  });
  client = new Anthropic();
}

const SYSTEM = `You guide a search for a flat-folding sequence. The paper is folded by flat 180-degree
simple folds; the goal is a stack identical to the target (same layer polygons, parities and
order, up to a rigid motion or turnover). You see the current stack, the target stack and a
numbered list of legal next folds, each with the stack size it produces and the creases it adds.
Reply with ONLY a JSON array of up to ${TOP} candidate numbers, most promising first, e.g. [3, 0, 7].`;

const usage = {calls: 0, input: 0, output: 0, parse_failures: 0};

async function rank(sample, depth, session, target, candidates) {
  const order = candidates.map((_, i) => i);
  if (RANKER === 'random') {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return order;
  }
  const user = JSON.stringify({
    folds_so_far: depth, target_layer_count: target.length,
    current_stack_bottom_to_top: layersView(session.layers),
    target_stack_bottom_to_top: layersView(target),
    candidates: candidates.map((c, i) => ({n: i, layers_after: c.layers_after,
      adds_creases: c.creates.map(k => ({a: k.assignment, from: k.from.map(r3), to: k.to.map(r3)}))})),
  });
  const res = await client.messages.create({model: MODEL, max_tokens: 4000,
    output_config: {effort: EFFORT}, system: SYSTEM, messages: [{role: 'user', content: user}]});
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  usage.calls++; usage.input += res.usage.input_tokens; usage.output += res.usage.output_tokens;
  let ranked = [];
  try { ranked = JSON.parse(text.match(/\[[\d,\s]*\]/)?.[0] ?? 'x'); }
  catch { usage.parse_failures++; }
  ranked = [...new Set(ranked.filter(i => Number.isInteger(i) && i >= 0 && i < candidates.length))];
  await appendFile(join(OUT, 'calls.jsonl'), JSON.stringify({sample, depth, candidates: candidates.length,
    prompt_chars: user.length, usage: res.usage, stop_reason: res.stop_reason, ranked, raw: text.slice(0, 300)}) + '\n');
  return [...ranked, ...order.filter(i => !ranked.includes(i))];
}

function stateKey(session) {
  const r = v => Math.round(v * 1e5);
  return sessionLayers(session).map(l => `${l.par}|${l.sheet.map(p => r(p[0]) + ',' + r(p[1])).join(';')}|` +
    l.poly.map(p => r(p[0]) + ',' + r(p[1])).join(';')).join('/');
}

async function search(sample) {
  const group = sample.split('-')[0];
  const dir = group === 'layers' ? join(RELEASE, 'some-generated-d5/samples', sample) : join(RELEASE, 'all-layers/samples', sample);
  const cp = JSON.parse(await readFile(join(dir, 'cp.fold'), 'utf8'));
  const seq = JSON.parse(await readFile(join(dir, 'seq.json'), 'utf8'));
  const target = sessionLayers(replay(cp, seq.folds.map(actionFromFold)));
  const syms = cpSymmetries(cp), filter = group === 'layers' ? 'any' : 'all';
  const solved = s => s.layers.length === target.length && s.evaluate().cp_match &&
    terminalMatchDetail(sessionLayers(s), target, syms).identity_match;
  const start = new FoldSession(cp), seen = new Set([stateKey(start)]);
  let frontier = [{path: [], cost: 0}], expanded = 0;
  const t0 = Date.now();
  while (frontier.length && expanded < BUDGET) {
    frontier.sort((a, b) => a.cost - b.cost || b.path.length - a.path.length);
    const node = frontier.shift();
    const session = replay(cp, node.path);
    const legal = enumerateLegalFolds(session, {max_results: 100000, selection_filter: filter}).legal_folds
      .filter(f => f.layers_after <= target.length);
    expanded++;
    if (!legal.length) continue;
    const order = await rank(sample, node.path.length, session, target, legal);
    for (const [r, i] of order.entries()) {
      const action = {tool: 'apply_fold', ...legal[i].action};
      const child = replay(cp, node.path);
      if (!child.apply(action).ok) continue;
      const key = stateKey(child);
      if (seen.has(key)) continue;
      seen.add(key);
      if (solved(child)) return {sample, solved: true, expanded, depth: node.path.length + 1,
        reference_depth: seq.folds.length, seconds: (Date.now() - t0) / 1000};
      frontier.push({path: [...node.path, action], cost: node.cost + Math.min(r, TOP)});
    }
  }
  return {sample, solved: false, expanded, reference_depth: seq.folds.length,
    stop: frontier.length ? 'budget' : 'exhausted', seconds: (Date.now() - t0) / 1000};
}

await mkdir(OUT, {recursive: true});
await writeFile(join(OUT, 'calls.jsonl'), '');
const rows = [];
for (const s of SAMPLES) {
  const row = await search(s);
  rows.push(row);
  console.error(`${s}: ${row.solved ? `SOLVED at expansion ${row.expanded} (depth ${row.depth})` : `not solved in ${row.expanded} expansions`}` +
    (RANKER === 'llm' ? `  [calls ${usage.calls}, est $${((usage.input * PRICE.in + usage.output * PRICE.out) / 1e6).toFixed(2)}]` : ''));
  await writeFile(join(OUT, 'rows.json'), JSON.stringify({ranker: RANKER, model: RANKER === 'llm' ? MODEL : null,
    effort: EFFORT, budget: BUDGET, top: TOP, seed: SEED, usage, rows}, null, 2) + '\n');
}
const n = rows.filter(r => r.solved).length;
console.log(`\n${RANKER}${RANKER === 'llm' ? ` (${MODEL}, effort ${EFFORT})` : ''}: solved ${n}/${rows.length} ` +
  `within ${BUDGET} expansions` + (RANKER === 'llm'
  ? `; ${usage.calls} calls, ${usage.input} in / ${usage.output} out tokens, est $${((usage.input * PRICE.in + usage.output * PRICE.out) / 1e6).toFixed(2)}, ${usage.parse_failures} unparseable replies` : ''));
