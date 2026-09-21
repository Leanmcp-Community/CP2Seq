// What does one call to list_legal_folds actually cost, and how does that scale with tier?
//
// TODO.md §3 records hard-0001 at ~5400 CP edges as unmeasured. This measures it, along a
// sample's own reference sequence, so the cost is read at states the paper genuinely reaches
// rather than at a flat sheet.
//
// WHY THIS MATTERS SEPARATELY FROM DEPTH
// The claim behind the deterministic arm is that search dies at depth, because the frontier
// grows as b^d. That accounting assumes each node costs roughly the same to expand. It does
// not: the enumerator pushes every distinct CP line through every distinct FACE TRANSFORM,
// and the number of distinct transforms rises as the paper folds. The published figure of
// ~2010 candidate actions per state is averaged over saved runs, which are almost all easy.
// If a hard state costs 100x an easy one, then hard is walled by per-node cost as well as by
// depth, and "depth is the wall" is at best half the diagnosis.
//
// Read the columns as: lines and evaluated are the WORK, legal is the BRANCHING FACTOR. They
// answer different questions and only the second one feeds b^d.
//
//   node workspace/profile_enum_cost.mjs easy-0001 mid-0001 hard-0001
//   node workspace/profile_enum_cost.mjs --budget 120 --json hard-0001
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {replay, actionFromFold} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalFolds} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CORPUS = process.env.CORPUS_DIR ?? join(ROOT, 'workspace/corpus/out/release/all-layers/samples');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : Number(argv.splice(i, 2)[1]);
};
const pick = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv.splice(i, 2)[1];
};
// Per sample, not per call: one hard sample must not be able to hang the whole sweep.
const budget = flag('--budget', 300);
const maxDepth = flag('--max-depth', 99);
const asJson = argv.includes('--json');
// Write the machine-readable form from the SAME run that prints the table. Profiling a hard
// sample takes minutes per state, so running the profiler twice to get two formats doubles a
// job that is already the long pole.
const jsonOut = pick('--json-out', null);
const samples = argv.filter(a => !a.startsWith('--'));
if (!samples.length) {
  console.error('usage: node workspace/profile_enum_cost.mjs [--budget S] [--max-depth N] [--json] <sample-id>...');
  process.exit(2);
}

function loadCp(id) {
  const raw = JSON.parse(readFileSync(join(CORPUS, id, 'cp.fold'), 'utf8'));
  return {file_spec: 1.1, frame_classes: ['creasePattern'], vertices_coords: raw.vertices_coords,
          edges_vertices: raw.edges_vertices, edges_assignment: raw.edges_assignment};
}

const pad = (v, n) => String(v).padEnd(n);
const report = [];

for (const id of samples) {
  const cp = loadCp(id);
  const mv = cp.edges_assignment.filter(a => a === 'M' || a === 'V').length;
  const folds = JSON.parse(readFileSync(join(CORPUS, id, 'seq.json'), 'utf8')).folds;
  // The reference sequence is used ONLY to walk to reachable states for timing. Nothing here
  // scores a model, and nothing here enters a prompt.
  const prefixActions = folds.map(actionFromFold);
  if (!asJson) {
    console.log(`\n${id}  MV edges ${mv}, reference ${folds.length} folds`);
    console.log(`  ${pad('depth', 7)}${pad('stack', 7)}${pad('lines', 8)}${pad('evaluated', 11)}` +
                `${pad('legal', 7)}${pad('ms', 9)}${pad('us/candidate', 14)}${pad('cheap', 8)}rejection breakdown`);
  }
  const rows = [];
  const started = Date.now();
  let stopped = null;
  for (let d = 0; d <= Math.min(folds.length, maxDepth); d++) {
    if ((Date.now() - started) / 1000 > budget) { stopped = `budget ${budget}s reached at depth ${d}`; break; }
    let session;
    try {
      session = replay(cp, prefixActions.slice(0, d).map(a => ({...a})));
    } catch (e) {
      stopped = `replay failed at depth ${d}: ${e.message}`;
      break;
    }
    const t0 = performance.now();
    const e = enumerateLegalFolds(session, {max_results: 500});
    const ms = performance.now() - t0;
    // Why the other 99.99% were thrown away. nothing-to-move and no-crease are decidable
    // from the selected layers' projection onto the fold normal -- fold-engine-layers.mjs
    // already computes that range for its own diagnostics -- so if they dominate, an early
    // exit removes most of the work WITHOUT changing which folds are returned, and the
    // "listed implies accepted by add_fold" guarantee is untouched. The other reasons
    // (would-tear, OUTSIDE_TARGET_CP) need the fold actually performed, so they are the
    // irreducible part.
    const CHEAP = ['nothing-to-move', 'no-crease'];
    const rejected = e.rejected_summary ?? {};
    const cheap = CHEAP.reduce((s, k) => s + (rejected[k] ?? 0), 0);
    const row = {depth: d, stack: e.stack_size, lines: e.candidate_lines,
                 evaluated: e.actions_evaluated, legal: e.distinct_legal_folds,
                 ms: Number(ms.toFixed(1)),
                 us_per_candidate: Number((ms * 1000 / Math.max(1, e.actions_evaluated)).toFixed(1)),
                 rejected, cheaply_rejectable: cheap,
                 cheap_pct: Number((100 * cheap / Math.max(1, e.actions_evaluated)).toFixed(1))};
    rows.push(row);
    if (!asJson) {
      const top = Object.entries(rejected).sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([k, v]) => `${k} ${(100 * v / Math.max(1, e.actions_evaluated)).toFixed(0)}%`).join(', ');
      console.log(`  ${pad(row.depth, 7)}${pad(row.stack, 7)}${pad(row.lines, 8)}` +
                  `${pad(row.evaluated, 11)}${pad(row.legal, 7)}${pad(row.ms.toFixed(1), 9)}` +
                  `${pad(row.us_per_candidate, 14)}${pad(row.cheap_pct + '%', 8)}${top}`);
    }
  }
  const totalMs = rows.reduce((s, r) => s + r.ms, 0);
  const meanLegal = rows.length ? rows.reduce((s, r) => s + r.legal, 0) / rows.length : 0;
  const worst = rows.reduce((m, r) => r.ms > (m?.ms ?? -1) ? r : m, null);
  const summary = {sample_id: id, mv_edges: mv, reference_folds: folds.length, depths: rows.length,
                   mean_legal: Number(meanLegal.toFixed(2)),
                   slowest_ms: worst?.ms ?? null, slowest_depth: worst?.depth ?? null,
                   total_ms: Number(totalMs.toFixed(1)), stopped, rows};
  report.push(summary);
  // Weighted by candidates, not by depth: a deep state evaluates thousands of times more
  // candidates than a shallow one, so an unweighted mean would be dominated by the cheap
  // early depths and overstate nothing.
  const totalEvaluated = rows.reduce((s, r) => s + r.evaluated, 0);
  const totalCheap = rows.reduce((s, r) => s + r.cheaply_rejectable, 0);
  const cheapShare = totalEvaluated ? totalCheap / totalEvaluated : 0;
  summary.cheap_share = Number((100 * cheapShare).toFixed(1));
  // A share of CANDIDATES, never of time. Candidates do not cost the same: the ones rejected
  // for missing the selection bail early, while the survivors pay for the tearing check and
  // the per-crease CP comparison. Measured, skipping 78% of candidates saved 19% of the
  // wall clock, so 1/(1 - cheap_share) overstates the achievable speedup by about 4x.
  // workspace/check_prefilter.mjs reports what the shortcut is actually worth.
  summary.cheap_share_note = 'share of candidates, not of time; see check_prefilter.mjs for measured speedup';
  const allReasons = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.rejected)) allReasons[k] = (allReasons[k] ?? 0) + v;
  summary.rejected_total = allReasons;
  // Flushed per sample, not at the end: these runs take long enough that they get
  // interrupted, and a partial profile of five samples is worth far more than nothing.
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report));
  if (!asJson) {
    console.log(`  mean branching ${summary.mean_legal}, slowest call ${summary.slowest_ms}ms ` +
                `at depth ${summary.slowest_depth}` + (stopped ? `  [${stopped}]` : ''));
    console.log(`  ${totalEvaluated.toLocaleString()} candidates evaluated in total; ` +
                `${summary.cheap_share}% miss the selection (share of candidates, not of time)`);
    console.log('  ' + Object.entries(allReasons).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}: ${(100 * v / Math.max(1, totalEvaluated)).toFixed(1)}%`).join('  '));
  }
}

if (asJson) console.log(JSON.stringify(report));
else {
  console.log('\n  --- one node of search costs one enumeration ---');
  console.log(`  ${pad('sample', 12)}${pad('MV', 8)}${pad('mean b', 9)}${pad('slowest call', 15)}` +
              `${pad('nodes/s there', 15)}cheap% (of candidates)`);
  for (const r of report) {
    const nps = r.slowest_ms ? (1000 / r.slowest_ms).toFixed(2) : '-';
    console.log(`  ${pad(r.sample_id, 12)}${pad(r.mv_edges, 8)}${pad(r.mean_legal, 9)}` +
                `${pad((r.slowest_ms ?? '-') + 'ms', 15)}${pad(nps, 15)}` +
                `${(r.cheap_share ?? '-')}%`);
  }
}
