// Final check and paired comparison for the text-only ablation. Read-only.
//
//   node workspace/analysis/textonly_final_check.mjs
//
// Step 1, integrity: every arm has exactly one completed attempt or one recorded input-size
// protocol failure for each of the 40 samples; no sample is completed twice; every counted run
// uses the matched settings; archived runs are ignored; Codex CLI versions are listed.
// Step 2, paired comparison with the text+image ablation (report.json, GPT-5.6 Luna, low):
// per arm, pooled, per group, exact McNemar, and sensitivity variants.
//
// Writes workspace/RESULTS/textonly-final/{check.json,report.md}. Exit code 1 if step 1 fails.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const RUNS = path.join(ROOT, 'CODEX_HARNESS_TESTING/runs');
const REPORT = path.join(ROOT, 'workspace/RESULTS/run-inventory/report.json');
const OUT = path.join(ROOT, 'workspace/RESULTS/textonly-final');
const ARMS = ['basic', 'legal', 'autocompare'];
const COND = {basic: 'basic', legal: 'legal', autocompare: 'auto-tier-3'};
const GROUPS = ['easy', 'mid', 'hard', 'layers'];
const SAMPLES = GROUPS.flatMap(g => Array.from({length: 10}, (_, i) => `${g}-${String(i + 1).padStart(4, '0')}`));
// Comparator fixed between the text+image and text-only runs; the text+image easy-0001 wrong
// submission followed a false "matches" (paper Appendix B). Reported both ways.
const COMPARATOR_AFFECTED = {autocompare: ['easy-0001']};

const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const armOf = c => c.compare_auto ? 'autocompare' : c.tools === 'base' ? 'basic' : 'legal';
const expected = arm => ({
  model: 'gpt-5.6-luna', reasoning_effort: 'low', image_history: 'none', max_turns: 80, timeout: 300,
  cycle_limit: 3, revisit_limit: 15, stuck_limit: 5,
  tools: arm === 'basic' ? 'base' : 'legal-folds',
  compare_tier: arm === 'autocompare' ? 3 : 0, compare_auto: arm === 'autocompare',
});
const inputTooLarge = ep => fs.existsSync(ep) && fs.readdirSync(ep).some(t => {
  const log = path.join(ep, t, 'failed-attempt-01/stderr.log');
  return t.startsWith('turn-') && fs.existsSync(log) && fs.readFileSync(log, 'utf8').includes('input_too_large');
});

// ---- step 1: integrity ----
const problems = [];
const attempts = Object.fromEntries(ARMS.map(a => [a, Object.fromEntries(SAMPLES.map(s => [s, []]))]));
const versions = {};
for (const run of fs.readdirSync(RUNS).sort()) {
  const cfg = readJson(path.join(RUNS, run, 'config.json'));
  if (!cfg || cfg.image_history !== 'none' || cfg.model !== 'gpt-5.6-luna') continue;
  const arm = armOf(cfg);
  const exp = expected(arm);
  for (const [k, v] of Object.entries(exp))
    if ((cfg[k] ?? (k === 'compare_auto' ? false : k === 'compare_tier' ? 0 : undefined)) !== v)
      problems.push(`${run}: ${k}=${JSON.stringify(cfg[k])}, expected ${JSON.stringify(v)}`);
  const ver = cfg.codex_provenance?.version ?? 'unrecorded';
  (versions[ver] ??= new Set()).add(arm);
  for (const s of SAMPLES) {
    const ep = path.join(RUNS, run, s);
    if (!fs.existsSync(ep)) continue;
    const result = readJson(path.join(ep, 'result.json'));
    if (result) attempts[arm][s].push({run, kind: 'completed', solved: !!result.solved, termination: result.termination});
    else if (inputTooLarge(ep)) attempts[arm][s].push({run, kind: 'input_too_large'});
    else attempts[arm][s].push({run, kind: 'unfinished'});
  }
}
const outcome = {};
for (const arm of ARMS) {
  outcome[arm] = {};
  for (const s of SAMPLES) {
    const list = attempts[arm][s];
    const done = list.filter(a => a.kind === 'completed');
    const itl = list.filter(a => a.kind === 'input_too_large');
    if (done.length > 1) problems.push(`${arm} ${s}: ${done.length} completed attempts (${done.map(a => a.run).join(', ')})`);
    if (done.length) outcome[arm][s] = {solved: done[0].solved, status: 'completed', termination: done[0].termination};
    else if (itl.length) outcome[arm][s] = {solved: false, status: 'protocol_failure'};
    else problems.push(`${arm} ${s}: no completed attempt and no input-size failure` +
                       (list.length ? ` (${list.length} unfinished)` : ''));
  }
}

// ---- step 2: paired comparison ----
const report = readJson(REPORT);
const image = {};
for (const ab of report.ablations.filter(a => a.model === 'gpt-5.6-luna' && a.effort === 'low')) {
  const arm = ARMS.find(a => COND[a] === ab.condition);
  image[arm] = {};
  for (const st of ab.strata) {
    for (const x of st.selected_attempts) image[arm][x.sample] = {solved: !!x.solved, status: 'completed'};
    for (const m of st.missing || []) image[arm][m.sample ?? m] = {solved: false, status: 'protocol_failure'};
  }
}
const mcnemar = (b, c) => {  // exact two-sided binomial test on discordant pairs
  const n = b + c; if (!n) return 1;
  let tail = 0; for (let i = 0; i <= Math.min(b, c); i++) {
    let comb = 1; for (let j = 0; j < i; j++) comb = comb * (n - j) / (j + 1); tail += comb; }
  return Math.min(1, 2 * tail / 2 ** n);
};
function compare(filter) {
  const rows = {};
  for (const arm of [...ARMS, 'pooled']) {
    const arms = arm === 'pooled' ? ARMS : [arm];
    const r = {n: 0, text: 0, image: 0, textOnly: [], imageOnly: [], byGroup: {}};
    for (const a of arms) for (const s of SAMPLES) {
      const t = outcome[a]?.[s], i = image[a]?.[s];
      if (!t || !i || !filter(a, s, t, i)) continue;
      const g = s.split('-')[0];
      const bg = (r.byGroup[g] ??= {n: 0, text: 0, image: 0});
      r.n++; bg.n++;
      if (t.solved) { r.text++; bg.text++; }
      if (i.solved) { r.image++; bg.image++; }
      if (t.solved && !i.solved) r.textOnly.push(`${a}:${s}`);
      if (i.solved && !t.solved) r.imageOnly.push(`${a}:${s}`);
    }
    r.p = mcnemar(r.textOnly.length, r.imageOnly.length);
    rows[arm] = r;
  }
  return rows;
}
const variants = {
  primary: compare(() => true),
  excludeProtocolFailures: compare((a, s, t, i) => t.status === 'completed' && i.status === 'completed'),
  excludeComparatorAffected: compare((a, s) => !(COMPARATOR_AFFECTED[a] || []).includes(s)),
};

// ---- output ----
fs.mkdirSync(OUT, {recursive: true});
const versionList = Object.fromEntries(Object.entries(versions).map(([v, s]) => [v, [...s]]));
const protocolFailures = Object.fromEntries(ARMS.map(a => [a, SAMPLES.filter(s => outcome[a][s]?.status === 'protocol_failure')]));
fs.writeFileSync(path.join(OUT, 'check.json'), JSON.stringify({problems, versions: versionList,
  protocolFailures, outcome, variants}, null, 2));
const md = ['# Text-only ablation: final check', '',
  `Integrity problems: ${problems.length ? '' : 'none'}`, ...problems.map(p => `- ${p}`), '',
  `Codex CLI versions (text-only runs): ${Object.entries(versionList).map(([v, a]) => `${v} (${a.join(', ')})`).join('; ')}`,
  `Protocol failures (text-only): ${ARMS.map(a => `${a}: ${protocolFailures[a].join(', ') || 'none'}`).join('; ')}`, ''];
for (const [name, rows] of Object.entries(variants)) {
  md.push(`## ${name}`, '', '| Arm | n | Text-only | Text+image | Text-only only | Text+image only | McNemar p | By group: text-only vs text+image (of n) |',
          '|---|---|---|---|---|---|---|---|');
  for (const [arm, r] of Object.entries(rows))
    md.push(`| ${arm} | ${r.n} | ${r.text} | ${r.image} | ${r.textOnly.length} | ${r.imageOnly.length} | ${r.p.toFixed(3)} | ` +
            GROUPS.filter(g => r.byGroup[g]).map(g => `${g} ${r.byGroup[g].text} vs ${r.byGroup[g].image} (of ${r.byGroup[g].n})`).join(', ') + ' |');
  md.push('');
}
fs.writeFileSync(path.join(OUT, 'report.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
process.exitCode = problems.length ? 1 : 0;
