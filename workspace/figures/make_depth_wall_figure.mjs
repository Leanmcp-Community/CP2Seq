// Emit the "BFS depth wall" figure as a standalone SVG and as pgfplots LaTeX.
//
// WHAT THE FIGURE SAYS
// Breadth-first search over the enumerated legal folds needs t(d) = b^d / r seconds to reach
// depth d, for a branching factor b and a throughput r in node expansions per second. Both
// b and r are properties of the TIER, not constants, and both move the wrong way as the tier
// hardens. Plotting one curve per tier against each tier's own reference depth is therefore
// the honest version; a single curve understates hard by many orders of magnitude.
//
// WITHOUT --data this draws the single anchored model curve (b = 3.5, one measured point),
// which is what PR #35's prose assumes. WITH --data it fits b and r per tier from
// workspace/depth_wall/depth_wall.csv and draws one curve per tier:
//
//   node workspace/figures/make_depth_wall_figure.mjs --data workspace/depth_wall/depth_wall.csv
//
// FITTING. b and r are read off runs that exhausted their budget, because only those measure
// throughput: b = generated / expanded (deduped successors per expansion, which is what sets
// frontier growth), r = expanded / budget. Solved runs are excluded from the fit -- they stop
// early, so their expanded count measures the problem's difficulty, not the machine's speed --
// but they are plotted as marks, since a solve is a directly observed (depth, time) point.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const pick = (n, f) => { const i = argv.indexOf(n); return i === -1 ? f : argv[i + 1]; };
const dataPath = pick('--data', null);
const enumPath = pick('--enum', null);
const minBudget = Number(pick('--min-budget', 4));

// COST MODEL. t(d) = (nodes at depth d) x (cost of expanding one node at depth d).
//
// The first factor is b^d. The second is NOT a constant, which is the correction this flag
// exists for. One expansion is one enumerateLegalFolds call, and that call evaluates
// exactly 4 x lines x stack_size candidates -- an identity that holds to the digit across
// every state measured. lines barely grows with depth (188 -> 356 over nine folds on
// hard-0001); stack_size grows geometrically, because a fold of all layers doubles them.
//
// So per-node cost is itself exponential in depth, and total work goes as (b*g)^d rather
// than b^d, where g is the per-fold growth in enumeration cost. Fitting r as a constant --
// what this script did before --enum existed -- understates the hard tier by orders of
// magnitude, because r is measured at the shallow depths the search actually reaches.
//
// g and c0 are fitted per tier by least squares on log(ms) against depth, over every state
// in workspace/enum_cost/enum_cost.json.
// Terminal states are excluded. A state with no legal fold at all is one the cheap-rejection
// shortcut short-circuits completely -- 100% of its candidates miss the selection -- so its
// timing collapses: easy-0108 drops from 28670 ms at depth 9 to 987 ms at depth 10, mid-0030
// from 26454 to 776. Those are real states, but they are LEAVES: search expands one and gets
// nothing back, so they are not what the cost of expanding a node at depth d means. Left in,
// each sample contributes one large downward outlier at its maximum depth and g falls by
// 0.15-0.3 (easy-0108: 2.03 -> 1.74), which then compounds through the exponent.
function fitEnumCost(rows) {
  const pts = rows.filter(r => r.ms > 0 && r.legal > 0);
  if (pts.length < 3) return null;
  const n = pts.length;
  const sx = pts.reduce((s, r) => s + r.depth, 0), sy = pts.reduce((s, r) => s + Math.log(r.ms / 1000), 0);
  const sxx = pts.reduce((s, r) => s + r.depth * r.depth, 0);
  const sxy = pts.reduce((s, r) => s + r.depth * Math.log(r.ms / 1000), 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return {g: Math.exp(slope), c0: Math.exp((sy - slope * sx) / n), n};
}

const TIER_COLOR = {easy: {svg: '#1d7a56', tex: 'green!45!black'},
                    mid:  {svg: '#b06a0f', tex: 'orange!65!black'},
                    hard: {svg: '#a3322f', tex: 'red!60!black'}};
const TIERS = ['easy', 'mid', 'hard'];

let curves, solves = [], source;

if (dataPath) {
  const rows = readFileSync(dataPath, 'utf8').trim().split('\n').slice(1)
      .map(l => l.split(','))
      .map(c => ({budget: +c[0], id: c[1], status: c[2], depth: +c[3], ref: +c[4],
                  expanded: +c[5], generated: +c[6], seconds: c[7] === '' ? null : +c[7]}))
      .filter(r => Number.isFinite(r.budget) && r.id);
  curves = [];
  for (const tier of TIERS) {
    const timeouts = rows.filter(r => r.id.startsWith(tier + '-') && r.status === 'timeout' &&
                                      r.budget >= minBudget && r.expanded > 0);
    if (!timeouts.length) continue;
    const b = timeouts.reduce((s, r) => s + r.generated / r.expanded, 0) / timeouts.length;
    const r = timeouts.reduce((s, x) => s + x.expanded / x.budget, 0) / timeouts.length;
    const refs = [...new Set(rows.filter(x => x.id.startsWith(tier + '-')).map(x => x.ref))];
    const target = refs.reduce((s, v) => s + v, 0) / refs.length;
    curves.push({tier, b, rate: r, target, n: timeouts.length,
                 samples: [...new Set(timeouts.map(x => x.id))].length});
  }
  // b and g must come from the SAME samples. They did not at first: b is fitted from the
  // search runs and g from the enumeration profile, and the two scripts have different
  // default sample lists -- the profile includes easy-0108, a 60-line outlier that is not in
  // the search set and that pulled the easy tier's g from about 1.35 up to 1.80. The figure
  // caught it: the observed easy solves sat two orders of magnitude below their own curve.
  const searched = new Set(rows.map(r => r.id));
  if (enumPath) {
    // A profile run that is still going, or was interrupted before its first flush, leaves an
    // empty file. Fall back to the constant-throughput model and say so, rather than dying.
    let prof = [];
    try { prof = JSON.parse(readFileSync(enumPath, 'utf8').trim() || '[]'); }
    catch (e) { console.error(`could not read ${enumPath} (${e.message}); using the constant-throughput model`); }
    for (const c of curves) {
      const usable = prof.filter(p => p.sample_id.startsWith(c.tier + '-') && searched.has(p.sample_id));
      const skipped = prof.filter(p => p.sample_id.startsWith(c.tier + '-') && !searched.has(p.sample_id));
      if (skipped.length) {
        console.error(`${c.tier}: ignoring ${skipped.map(p => p.sample_id).join(', ')} ` +
                      `-- profiled but not searched, so no b was measured on them`);
      }
      const fit = fitEnumCost(usable.flatMap(p => p.rows ?? []));
      if (fit) Object.assign(c, {g: fit.g, c0: fit.c0, enumStates: fit.n,
                                 enumSamples: usable.map(p => p.sample_id)});
    }
  }
  // Refuse to draw one figure from two cost models. A curve fitted with the measured
  // enumeration cost and a curve assuming constant throughput differ by orders of magnitude
  // at depth, and side by side on one axis they look like a tier comparison rather than an
  // artefact of which profile happened to finish. This is exactly the plot that would reach
  // a paper unnoticed.
  const fitted = curves.filter(c => c.g).map(c => c.tier);
  const unfitted = curves.filter(c => !c.g).map(c => c.tier);
  if (fitted.length && unfitted.length && !argv.includes('--allow-mixed')) {
    console.error(`refusing to mix cost models on one figure.`);
    console.error(`  fitted from ${enumPath}: ${fitted.join(', ')}`);
    console.error(`  no enumeration timings yet:  ${unfitted.join(', ')}`);
    console.error(`Finish profiling the missing tiers, or pass --allow-mixed to draw it anyway.`);
    process.exit(3);
  }
  solves = rows.filter(r => r.status === 'solved' && r.seconds > 0)
      .map(r => ({tier: r.id.split('-')[0], depth: r.depth, seconds: r.seconds, id: r.id}));
  // One point per sample: repeated budgets re-solve the same sample at the same speed.
  const best = new Map();
  for (const s of solves) if (!best.has(s.id)) best.set(s.id, s);
  solves = [...best.values()];
  source = dataPath;
} else {
  curves = [{tier: 'all', b: 3.5, rate: Math.pow(3.5, 6) / 45, target: null, n: 1, samples: 1}];
  solves = [{tier: 'easy', depth: 6, seconds: 45, id: 'easy-0003'}];
  source = 'anchored model (b = 3.5, easy-0003 at depth 6 in 45s)';
}

// With a fitted enumeration cost: b^d nodes, each costing c0 * g^d seconds.
// Without one: the old constant-throughput model, which is a lower bound.
const tOf = (c, d) => c.g ? Math.pow(c.b, d) * c.c0 * Math.pow(c.g, d) : Math.pow(c.b, d) / c.rate;
const D0 = 1, D1 = 20;
const L0 = -1, L1 = 14;
const W = 580, H = 380, M = {l: 70, r: 14, t: 18, b: 46};
const PX = W - M.l - M.r, PY = H - M.t - M.b;
const x = d => M.l + (d - D0) / (D1 - D0) * PX;
const y = s => M.t + PY - (Math.min(Math.max(Math.log10(s), L0), L1) - L0) / (L1 - L0) * PY;

const human = s => s < 60 ? `${s.toFixed(s < 10 ? 1 : 0)} s`
  : s < 3600 ? `${(s / 60).toFixed(0)} min`
  : s < 86400 ? `${(s / 3600).toFixed(0)} h`
  : s < 31557600 ? `${(s / 86400).toFixed(0)} d`
  : s < 3.15576e11 ? `${(s / 31557600).toFixed(0)} y`
  : `${(s / 31557600).toExponential(1)} y`;

const guides = [
  {s: 1, label: '1 second'}, {s: 60, label: '1 minute'}, {s: 3600, label: '1 hour'},
  {s: 86400, label: '1 day'}, {s: 31557600, label: '1 year'},
  {s: 3.15576e9, label: '1 century'}, {s: 3.15576e13, label: 'age of the universe'},
];

const series = c => {
  const pts = [];
  for (let d = D0; d <= D1; d += 0.25) {
    const t = tOf(c, d);
    if (Math.log10(t) > L1 + 0.5) break;
    pts.push([d, t]);
  }
  return pts;
};

/* ---------- SVG ---------- */
const sup = p => (p < 0 ? '⁻' : '') + String(Math.abs(p)).split('')
    .map(ch => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+ch]).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
<title>Breadth-first search time against fold depth, by tier</title>
<desc>Search time grows exponentially with fold depth. Cost model: ${curves.some(c => c.g) ? 't(d) = b^d * c0 * g^d, with the per-node enumeration cost fitted from measurement' : 't(d) = b^d / r, assuming constant throughput -- a LOWER BOUND, because per-node cost also grows with depth'}. Source: ${source}. ${curves.map(c => `${c.tier}: b=${c.b.toFixed(2)}${c.g ? `, g=${c.g.toFixed(2)}` : `, ${c.rate.toFixed(1)} expansions per second`}, reference depth ${c.target?.toFixed(1) ?? 'n/a'}`).join('; ')}.</desc>
<rect width="${W}" height="${H}" fill="#ffffff"/>
${guides.filter(g => Math.log10(g.s) >= L0 && Math.log10(g.s) <= L1).map(g =>
  `<line x1="${M.l}" y1="${y(g.s).toFixed(1)}" x2="${(W - M.r).toFixed(1)}" y2="${y(g.s).toFixed(1)}" stroke="#d4d4d4" stroke-width="0.6" stroke-dasharray="3 3"/>
<text x="${M.l + 5}" y="${(y(g.s) - 3).toFixed(1)}" font-size="9" fill="#9a9a9a">${g.label}</text>`).join('\n')}
<line x1="${M.l}" y1="${M.t}" x2="${M.l}" y2="${M.t + PY}" stroke="#444" stroke-width="0.8"/>
<line x1="${M.l}" y1="${M.t + PY}" x2="${W - M.r}" y2="${M.t + PY}" stroke="#444" stroke-width="0.8"/>
${Array.from({length: L1 - L0 + 1}, (_, i) => L0 + i).filter(p => p % 2 !== 0 || p === 0).map(p =>
  `<line x1="${M.l - 4}" y1="${y(Math.pow(10, p)).toFixed(1)}" x2="${M.l}" y2="${y(Math.pow(10, p)).toFixed(1)}" stroke="#444" stroke-width="0.8"/>
<text x="${M.l - 7}" y="${(y(Math.pow(10, p)) + 3.5).toFixed(1)}" font-size="9" fill="#444" text-anchor="end">10${sup(p)}</text>`).join('\n')}
${[2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map(d =>
  `<line x1="${x(d).toFixed(1)}" y1="${M.t + PY}" x2="${x(d).toFixed(1)}" y2="${M.t + PY + 4}" stroke="#444" stroke-width="0.8"/>
<text x="${x(d).toFixed(1)}" y="${M.t + PY + 16}" font-size="9" fill="#444" text-anchor="middle">${d}</text>`).join('\n')}
${curves.map(c => {
  const col = (TIER_COLOR[c.tier] ?? {svg: '#1a3d6d'}).svg;
  const pts = series(c);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  const mark = c.target == null ? '' :
    `<line x1="${x(c.target).toFixed(1)}" y1="${y(tOf(c, c.target)).toFixed(1)}" x2="${x(c.target).toFixed(1)}" y2="${(M.t + PY).toFixed(1)}" stroke="${col}" stroke-width="0.7" stroke-dasharray="2 3" opacity="0.7"/>
<rect x="${(x(c.target) - 3.5).toFixed(1)}" y="${(y(tOf(c, c.target)) - 3.5).toFixed(1)}" width="7" height="7" fill="${col}" transform="rotate(45 ${x(c.target).toFixed(1)} ${y(tOf(c, c.target)).toFixed(1)})"/>
<text x="${(x(c.target) + (c.target > D1 - 4 ? -8 : 8)).toFixed(1)}" y="${(y(tOf(c, c.target)) + (c.target > D1 - 4 ? 14 : 1)).toFixed(1)}" font-size="9.5" fill="${col}" text-anchor="${c.target > D1 - 4 ? 'end' : 'start'}">${human(tOf(c, c.target))}</text>`;
  const last = pts[pts.length - 1];
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.9" stroke-linejoin="round"/>
${mark}
<text x="${(x(last[0]) - 4).toFixed(1)}" y="${(y(last[1]) - 6).toFixed(1)}" font-size="10.5" fill="${col}" text-anchor="end">${c.tier}${c.target == null ? '' : (c.g ? `  (b·g)=${(c.b * c.g).toFixed(1)}` : `  b=${c.b.toFixed(2)}`)}</text>`;
}).join('\n')}
${solves.map(s => `<circle cx="${x(s.depth).toFixed(1)}" cy="${y(s.seconds).toFixed(1)}" r="2.6" fill="#ffffff" stroke="${(TIER_COLOR[s.tier] ?? {svg: '#555'}).svg}" stroke-width="1.3"/>`).join('\n')}
<text x="${(M.l + PX / 2).toFixed(1)}" y="${H - 8}" font-size="11" fill="#444" text-anchor="middle">fold depth (number of folds in the solution)</text>
<text x="14" y="${(M.t + PY / 2).toFixed(1)}" font-size="11" fill="#444" text-anchor="middle" transform="rotate(-90 14 ${(M.t + PY / 2).toFixed(1)})">search time (seconds, log scale)</text>
<g font-size="9" fill="#777"><circle cx="${M.l + 18}" cy="${M.t + 44}" r="2.6" fill="#ffffff" stroke="#777" stroke-width="1.3"/><text x="${M.l + 26}" y="${M.t + 47}">observed solve</text>
<rect x="${M.l + 15}" y="${M.t + 55}" width="6" height="6" fill="#777" transform="rotate(45 ${M.l + 18} ${M.t + 58})"/><text x="${M.l + 26}" y="${M.t + 61}">tier reference depth</text></g>
</svg>
`;

/* ---------- pgfplots ---------- */
const tex = `% BFS depth wall, one curve per tier.
% Cost model: ${curves.some(c => c.g)
  ? 't(d) = b^d * c0 * g^d, with the per-node enumeration cost measured'
  : 't(d) = b^d / r, assuming constant throughput -- a LOWER BOUND, since per-node cost grows with depth too'}
% Generated by workspace/figures/make_depth_wall_figure.mjs
% Source: ${source}
${curves.map(c => `% ${c.tier}: b = ${c.b.toFixed(3)}, ` +
  (c.g ? `g = ${c.g.toFixed(3)}, c0 = ${c.c0.toExponential(2)}s (b*g = ${(c.b * c.g).toFixed(2)}, ${c.enumStates} profiled states)`
       : `r = ${c.rate.toFixed(2)} expansions/s, CONSTANT-THROUGHPUT LOWER BOUND`) +
  `, reference depth ${c.target?.toFixed(1) ?? 'n/a'}${c.target == null ? '' : `, predicted ${human(tOf(c, c.target))}`}` +
  ` (b fitted on ${c.n} budget-exhausted runs over ${c.samples} samples)`).join('\n')}
%
% Standalone: pdflatex depth_wall.tex
% In a paper: keep the tikzpicture, drop the documentclass wrapper.
\\documentclass[border=2pt]{standalone}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\begin{document}
\\begin{tikzpicture}
\\begin{axis}[
  width=8.6cm, height=6.4cm,
  ymode=log,
  xlabel={fold depth (number of folds in the solution)},
  ylabel={search time (s, log scale)},
  xmin=${D0}, xmax=${D1}, ymin=1e${L0}, ymax=1e${L1},
  xtick={2,4,6,8,10,12,14,16,18,20},
  ytick={1e0,1e3,1e6,1e9,1e12},
  tick label style={font=\\scriptsize},
  label style={font=\\small},
  legend style={font=\\scriptsize, at={(0.02,0.98)}, anchor=north west, draw=none, fill=none},
  axis line style={gray!60},
]
${guides.filter(g => Math.log10(g.s) >= L0 && Math.log10(g.s) <= L1).map(g =>
  `\\draw[gray!40, dashed, thin] (axis cs:${D0},${g.s.toExponential(4)}) -- (axis cs:${D1},${g.s.toExponential(4)})
  node[pos=0.10, above, font=\\tiny, gray, inner sep=1pt] {${g.label}};`).join('\n')}
${curves.map(c => {
  const col = (TIER_COLOR[c.tier] ?? {tex: 'blue!55!black'}).tex;
  const pts = series(c);
  return `\\addplot[thick, color=${col}, mark=none] coordinates {
${pts.filter((_, i) => i % 4 === 0 || i === pts.length - 1).map(p => `  (${p[0]},${p[1].toExponential(5)})`).join('\n')}
};
\\addlegendentry{${c.tier}${c.target == null ? '' : ` ($b=${c.b.toFixed(2)}$, $r=${c.rate.toFixed(0)}$/s)`}}`;
}).join('\n')}
${curves.filter(c => c.target != null).map(c => {
  const col = (TIER_COLOR[c.tier] ?? {tex: 'black'}).tex;
  return `\\addplot[only marks, mark=diamond*, mark size=2.6pt, color=${col}, forget plot]
  coordinates {(${c.target.toFixed(2)},${tOf(c, c.target).toExponential(5)})};
\\node[font=\\tiny, color=${col}, anchor=west] at (axis cs:${(c.target + 0.3).toFixed(2)},${tOf(c, c.target).toExponential(5)}) {${human(tOf(c, c.target))}};`;
}).join('\n')}
${solves.length ? `\\addplot[only marks, mark=o, mark size=1.5pt, color=gray, forget plot] coordinates {
${solves.map(s => `  (${s.depth},${s.seconds.toExponential(5)})`).join('\n')}
};` : ''}
\\end{axis}
\\end{tikzpicture}
\\end{document}
`;

const outDir = join(HERE, 'out');
mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'depth_wall.svg'), svg);
writeFileSync(join(outDir, 'depth_wall.tex'), tex);

console.log(`source: ${source}`);
console.log(curves.some(c => c.g)
  ? `cost model: t(d) = b^d x c0 x g^d, enumeration cost fitted from ${enumPath}\n`
  : 'cost model: t(d) = b^d / r, CONSTANT throughput -- a lower bound. Pass --enum for the real one.\n');
console.log(`  ${'tier'.padEnd(7)}${'b'.padEnd(7)}${'g'.padEnd(7)}${'b*g'.padEnd(8)}${'ref depth'.padEnd(12)}` +
            `${'predicted time'.padEnd(16)}depth in 120s`);
for (const c of curves) {
  const base = c.g ? c.b * c.g : c.b;
  const reach = c.g ? Math.log(120 / c.c0) / Math.log(base) : Math.log(120 * c.rate) / Math.log(base);
  console.log(`  ${c.tier.padEnd(7)}${c.b.toFixed(2).padEnd(7)}${(c.g?.toFixed(2) ?? '-').padEnd(7)}` +
    `${base.toFixed(2).padEnd(8)}${(c.target?.toFixed(1) ?? '-').padEnd(12)}` +
    `${(c.target == null ? '-' : human(tOf(c, c.target))).padEnd(16)}${reach.toFixed(1)}`);
}
console.log(`\nwrote ${join(outDir, 'depth_wall.svg')}`);
console.log(`wrote ${join(outDir, 'depth_wall.tex')}`);
