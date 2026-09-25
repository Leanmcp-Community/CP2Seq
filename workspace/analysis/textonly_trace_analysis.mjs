// Turn-level analysis of the text-only ablation (and, as a reference, the one local
// text+image run), read-only. Writes workspace/RESULTS/textonly-analysis/summary.json and
// prints a report.
//
//   node workspace/analysis/textonly_trace_analysis.mjs
//
// 1. False "flip repairs all" advice: OUTSIDE_TARGET_CP rejections carrying
//    flip_repairs_all=true and a corrected_action, where the model then tried exactly that
//    corrected action from the same state and was rejected again with OUTSIDE_TARGET_CP.
// 2. Termination reasons per arm, text-only vs the text+image ablation (report.json).
// 3. add_fold rejection codes per arm.
// 4. Input/output tokens per episode.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const RUNS = path.join(ROOT, 'CODEX_HARNESS_TESTING/runs');
const REPORT = path.join(ROOT, 'workspace/RESULTS/run-inventory/report.json');
const OUT = path.join(ROOT, 'workspace/RESULTS/textonly-analysis');
// The only local text+image run with turn-level traces (GPT-5.6 Luna, low, legal + tier-3 auto,
// 20 easy/mid episodes from 2026-09-21). A reference point, not a matched ablation arm.
const IMAGE_REFERENCE_RUN = 'codex-20260921T085459155281Z';

const SAMPLES = ['easy', 'mid', 'hard', 'layers'].flatMap(g =>
  Array.from({length: 10}, (_, i) => `${g}-${String(i + 1).padStart(4, '0')}`));
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const armOf = c => c.compare_auto ? 'autocompare' : c.tools === 'base' ? 'basic' : 'legal';
const turnDirs = ep => fs.readdirSync(ep).filter(t => t.startsWith('turn-')).sort()
  .map(t => path.join(ep, t));
const sameAction = (a, b) => ['angle_index', 'angle_degrees', 'offset', 'move_positive', 'over',
  'selection_mode', 'layer_count'].every(k => (a?.[k] ?? null) === (b?.[k] ?? null) ||
  (k === 'selection_mode' && (a?.[k] ?? 'all') === (b?.[k] ?? 'all')));

function usageOf(turn) {
  const req = readJson(path.join(turn, 'request-usage.json'));
  if (req && req.input_tokens != null) return req;
  const ev = path.join(turn, 'events.jsonl');
  if (!fs.existsSync(ev)) return null;
  const done = fs.readFileSync(ev, 'utf8').trim().split('\n')
    .map(l => { try { return JSON.parse(l); } catch { return {}; } })
    .filter(e => e.type === 'turn.completed');
  return done.length ? done.at(-1).usage : null;
}

function analyseEpisode(ep) {
  const res = {turns: 0, input: 0, cached: 0, output: 0, rejections: {}, addFolds: 0,
               flipClaims: 0, flipFollowed: 0, flipFalse: [], termination: null, solved: null};
  const result = readJson(path.join(ep, 'result.json'));
  if (result) { res.termination = result.termination; res.solved = !!result.solved; }
  let pending = [];  // flip claims awaiting the model's next add_fold from the same state
  for (const turn of turnDirs(ep)) {
    res.turns++;
    const u = usageOf(turn);
    if (u) { res.input += u.input_tokens || 0; res.cached += u.cached_input_tokens || 0;
             res.output += u.output_tokens || 0; }
    const tool = readJson(path.join(turn, 'tool.json'));
    if (!tool || tool.action?.name !== 'add_fold') continue;
    res.addFolds++;
    const args = tool.action.arguments, r = tool.result || {};
    // A claim is resolved by the model's next add_fold: if that fold is exactly the advised
    // corrected action and is rejected again for OUTSIDE_TARGET_CP, the advice was false.
    // A rejected fold leaves the state unchanged, so its state_id is the state it was tried
    // from; requiring it to equal the advice's state_id excludes folds tried after a backtrack.
    for (const p of pending) {
      if (!sameAction(args, p.corrected)) continue;
      if (!r.ok && r.state_id !== p.state) continue;
      res.flipFollowed++;
      if (!r.ok && r.error === 'OUTSIDE_TARGET_CP')
        res.flipFalse.push({turn: path.basename(turn), advisedAt: p.turn});
    }
    pending = [];
    if (r.ok) continue;
    res.rejections[r.error || 'unknown'] = (res.rejections[r.error || 'unknown'] || 0) + 1;
    if (r.error === 'OUTSIDE_TARGET_CP' && r.flip_repairs_all === true && r.corrected_action) {
      res.flipClaims++;
      pending.push({state: r.state_id, corrected: r.corrected_action, turn: path.basename(turn)});
    }
  }
  return res;
}

// Collect text-only episodes (latest attempt per arm and sample) and the image reference run.
const text = {basic: {}, legal: {}, autocompare: {}};
const inputTooLarge = {basic: [], legal: [], autocompare: []};
for (const run of fs.readdirSync(RUNS).sort()) {
  const cfg = readJson(path.join(RUNS, run, 'config.json'));
  if (!cfg || cfg.image_history !== 'none' || cfg.model !== 'gpt-5.6-luna' ||
      cfg.reasoning_effort !== 'low') continue;
  const arm = armOf(cfg);
  for (const s of SAMPLES) {
    const ep = path.join(RUNS, run, s);
    if (fs.existsSync(path.join(ep, 'result.json'))) text[arm][s] = analyseEpisode(ep);
    else if (fs.existsSync(path.join(ep, 'error.json')) &&
             fs.readFileSync(path.join(ep, 'error.json'), 'utf8') &&
             turnDirs(ep).some(t => fs.existsSync(path.join(t, 'failed-attempt-01/stderr.log')) &&
               fs.readFileSync(path.join(t, 'failed-attempt-01/stderr.log'), 'utf8')
                 .includes('input_too_large'))) inputTooLarge[arm].push(s);
  }
}
const imageRef = {};
const refDir = path.join(RUNS, IMAGE_REFERENCE_RUN);
if (fs.existsSync(refDir))
  for (const e of fs.readdirSync(refDir))
    if (fs.existsSync(path.join(refDir, e, 'result.json'))) imageRef[e] = analyseEpisode(path.join(refDir, e));

// Text+image ablation terminations from the inventory (GPT-5.6 Luna, low).
const report = readJson(REPORT);
const byRunSample = Object.fromEntries(report.attempts.map(a => [`${a.run}|${a.sample}`, a]));
const condArm = {basic: 'basic', legal: 'legal', 'auto-tier-3': 'autocompare'};
const imageTerm = {basic: {}, legal: {}, autocompare: {}};
for (const ab of report.ablations.filter(a => a.model === 'gpt-5.6-luna' && a.effort === 'low')) {
  const arm = condArm[ab.condition];
  for (const s of ab.strata) {
    for (const x of s.selected_attempts) {
      const a = byRunSample[`${x.run}|${x.sample}`];
      const k = a?.solved ? 'solved' : (a?.termination || 'unknown');
      imageTerm[arm][k] = (imageTerm[arm][k] || 0) + 1;
    }
    for (const m of s.missing || []) imageTerm[arm].protocol_failure = (imageTerm[arm].protocol_failure || 0) + 1;
  }
}

// Summaries.
const summarise = eps => {
  const list = Object.values(eps);
  const sum = f => list.reduce((a, e) => a + f(e), 0);
  const term = {};
  for (const e of list) { const k = e.solved ? 'solved' : e.termination; term[k] = (term[k] || 0) + 1; }
  const rej = {};
  for (const e of list) for (const [k, v] of Object.entries(e.rejections)) rej[k] = (rej[k] || 0) + v;
  const flipFalseEpisodes = Object.entries(eps).filter(([, e]) => e.flipFalse.length);
  return {
    episodes: list.length, turns: sum(e => e.turns), addFolds: sum(e => e.addFolds),
    terminations: term, rejections: rej,
    tokens: {inputPerEpisode: Math.round(sum(e => e.input) / list.length),
             cachedPerEpisode: Math.round(sum(e => e.cached) / list.length),
             outputPerEpisode: Math.round(sum(e => e.output) / list.length),
             inputPerTurn: Math.round(sum(e => e.input) / Math.max(1, sum(e => e.turns)))},
    flip: {claims: sum(e => e.flipClaims), followed: sum(e => e.flipFollowed),
           followedAndRejectedAgain: sum(e => e.flipFalse.length),
           episodesAffected: flipFalseEpisodes.length,
           affectedEpisodes: flipFalseEpisodes.map(([s, e]) =>
             ({sample: s, termination: e.solved ? 'solved' : e.termination, events: e.flipFalse}))},
  };
};
const summary = {
  textOnly: Object.fromEntries(Object.entries(text).map(([a, eps]) => [a, summarise(eps)])),
  textOnlyInputTooLarge: inputTooLarge,
  textImageAblationTerminations: imageTerm,
  textImageReferenceRun: {run: IMAGE_REFERENCE_RUN, ...summarise(imageRef)},
};
fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, (k, v) => k === 'events' ? undefined : v, 2));
