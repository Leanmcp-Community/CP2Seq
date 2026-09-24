// Emit solve rate against coupling for the search baseline, at the depths where it is not at
// ceiling.
//
// THIS FIGURE WAS WRONG ONCE AND THE CORRECTION IS THE REASON IT LOOKS LIKE THIS.
//
// The first version plotted solve rate per coupling bin over the whole easy group and claimed
// that restricting to one group "holds fold depth, so coupling is what varies". It does not.
// Mean depth rises monotonically across the coupling bins of that group -- 5.0, 6.3, 8.2, 9.4 --
// so the fall it showed was depth and coupling together, under a caption that promised only
// coupling.
//
// It also counted attempts. The baseline has 669 easy attempts over 200 distinct samples, a
// median of three each, so an attempt-weighted rate weights a sample by how often someone
// re-ran it. Worse, 83 of those 200 samples disagree with themselves across attempts, and the
// baseline is deterministic: the disagreement is budget, not search. A per-sample rate with the
// sample solved if any attempt solved it is the only rate that means what it says.
//
// WHAT SURVIVES BOTH CORRECTIONS. At depths 4 to 7 the baseline solves essentially everything at
// any coupling, so those depths carry no information about coupling and are not drawn. At 8, 9
// and 10 it separates: 13/13 against 11/16, 8/10 against 5/20, 4/6 against 2/15. That is the
// claim this figure makes and the only one it can support.
//
// AND WHAT DOES NOT. The model arm shows no such separation once depth is held: the direction
// flips between depths and the cells hold single digits. It is not drawn, and the paper says so
// rather than leaving a reader to assume the result generalises.
//
//   node workspace/figures/make_coupling_solve_figure.mjs
//   node workspace/figures/make_coupling_solve_figure.mjs --split 4 --depths 8,9,10
import {readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const argv = process.argv.slice(2);
const pick = (n, f) => { const i = argv.indexOf(n); return i === -1 ? f : argv[i + 1]; };
const SPLIT = Number(pick('--split', 4));
const DEPTHS = String(pick('--depths', '8,9,10')).split(',').map(Number);

const CORPUS = join(ROOT, 'workspace/corpus/out/release');
const ATTEMPTS = join(ROOT, 'workspace/RESULTS/cp-distance/attempts.jsonl');
const ARM = 'deterministic-bfs / legal-folds';
const OTHER = 'gpt-5.6-luna / legal-folds';

const meta = {};
for (const batch of readdirSync(CORPUS)) {
  const base = join(CORPUS, batch, 'samples');
  if (!existsSync(base)) continue;
  for (const id of readdirSync(base)) {
    const m = JSON.parse(readFileSync(join(base, id, 'meta.json'), 'utf8'));
    const steps = m.metrics?.steps ?? m.steps;
    const coupling = m.metrics?.coupling_mean ??
      (m.metrics?.creases != null && steps ? m.metrics.creases / steps : null);
    if (steps != null && coupling != null) meta[id] = {steps, coupling};
  }
}

const attempts = readFileSync(ATTEMPTS, 'utf8').trim().split('\n').map(l => JSON.parse(l));

// One row per SAMPLE, not per attempt: solved if any attempt solved it.
function perSample(armKey) {
  const byId = new Map();
  for (const r of attempts) {
    if (`${r.model} / ${r.tools}` !== armKey || !meta[r.sample]) continue;
    byId.set(r.sample, (byId.get(r.sample) ?? false) || r.solved === true);
  }
  return byId;
}

const cellsFor = byId => DEPTHS.map(d => {
  const ids = [...byId.keys()].filter(i => meta[i].steps === d);
  const cut = c => {
    const sub = ids.filter(i => (meta[i].coupling < SPLIT) === c);
    return {n: sub.length, solved: sub.filter(i => byId.get(i)).length};
  };
  return {depth: d, low: cut(true), high: cut(false)};
});

const bfs = cellsFor(perSample(ARM));
const luna = cellsFor(perSample(OTHER));
const pct = c => c.n ? 100 * c.solved / c.n : null;

// Categorical slots 1 and 2 of the validated default palette. The two series are identities,
// low and high coupling, not points on a scale, so the encoding is categorical rather than a
// light-to-dark ramp. Every bar carries solved/n, which is also what relieves the contrast warn.
const COLOR = {low: {svg: '#2a78d6', tex: 'vizA'}, high: {svg: '#eb6834', tex: 'vizB'}};
const TEXDEFS = ['\\definecolor{vizA}{HTML}{2A78D6}', '\\definecolor{vizB}{HTML}{EB6834}'].join('\n');
const SERIES = [
  {key: 'low', label: `coupling < ${SPLIT}`},
  {key: 'high', label: `coupling $\\geq$ ${SPLIT}`},
];

/* ---------- SVG ---------- */
const W = 520, H = 330, M = {l: 52, r: 14, t: 20, b: 88};
const PX = W - M.l - M.r, PY = H - M.t - M.b;
const gw = PX / DEPTHS.length;
const bw = Math.min(42, (gw - 30) / 2);
const y = v => M.t + PY - (v / 100) * PY;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">
<title>Search baseline solve rate by coupling, at fixed fold depth</title>
<desc>Per-sample solve rate for the deterministic breadth-first baseline, split by coupling below and above ${SPLIT}, at depths ${DEPTHS.join(', ')}.</desc>
<rect width="${W}" height="${H}" fill="#ffffff"/>
${[0, 25, 50, 75, 100].map(v =>
  `<line x1="${M.l}" y1="${y(v).toFixed(1)}" x2="${W - M.r}" y2="${y(v).toFixed(1)}" stroke="#e3e3e3" stroke-width="0.8" stroke-dasharray="${v ? '3 3' : '0'}"/>
<text x="${M.l - 6}" y="${(y(v) + 3.5).toFixed(1)}" font-size="9" fill="#444" text-anchor="end">${v}%</text>`).join('\n')}
${bfs.map((cell, di) => SERIES.map((s, ai) => {
  const c = cell[s.key];
  if (!c.n) return '';
  const x = M.l + di * gw + (gw - bw * 2) / 2 + ai * bw + 1;
  return `<rect x="${x.toFixed(1)}" y="${y(pct(c)).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(M.t + PY - y(pct(c))).toFixed(1)}" fill="${COLOR[s.key].svg}" opacity="0.9"/>
<text x="${(x + (bw - 2) / 2).toFixed(1)}" y="${(y(pct(c)) - 4).toFixed(1)}" font-size="8.5" fill="#333" text-anchor="middle">${c.solved}/${c.n}</text>`;
}).join('\n')).join('\n')}
${bfs.map((cell, di) =>
  `<text x="${(M.l + di * gw + gw / 2).toFixed(1)}" y="${(M.t + PY + 16).toFixed(1)}" font-size="10" fill="#333" text-anchor="middle">${cell.depth} folds</text>`).join('\n')}
<line x1="${M.l}" y1="${(M.t + PY).toFixed(1)}" x2="${W - M.r}" y2="${(M.t + PY).toFixed(1)}" stroke="#444" stroke-width="0.8"/>
<text x="${(M.l + PX / 2).toFixed(1)}" y="${(M.t + PY + 32).toFixed(1)}" font-size="10.5" fill="#333" text-anchor="middle">fold depth (held fixed within each pair)</text>
<text x="14" y="${(M.t + PY / 2).toFixed(1)}" font-size="10.5" fill="#333" text-anchor="middle" transform="rotate(-90 14 ${(M.t + PY / 2).toFixed(1)})">samples solved</text>
<g font-size="9" fill="#444">
${SERIES.map((s, i) => `<rect x="${M.l + i * 150}" y="${H - 46}" width="9" height="9" fill="${COLOR[s.key].svg}"/><text x="${M.l + i * 150 + 14}" y="${H - 38}">${s.label.replace('$\\geq$', '\u2265').replace('<', '&lt;')}</text>`).join('\n')}
</g>
<text x="${M.l}" y="${H - 22}" font-size="8.5" fill="#999">Bars carry samples solved over samples attempted, counted once per sample rather than once per attempt.</text>
<text x="${M.l}" y="${H - 11}" font-size="8.5" fill="#999">Depths below 8 are omitted: the baseline solves them at any coupling, so they say nothing about it.</text>
</svg>
`;

/* ---------- pgfplots ---------- */
const tex = `% Search baseline solve rate by coupling, at fixed fold depth.
% Generated by workspace/figures/make_coupling_solve_figure.mjs
% Sources: ${ATTEMPTS}; coupling from meta.json under ${CORPUS}
% Per SAMPLE, not per attempt. Split at coupling ${SPLIT}.
${bfs.map(c => `% depth ${c.depth}: low ${c.low.solved}/${c.low.n}, high ${c.high.solved}/${c.high.n}`).join('\n')}
% model arm at the same split, drawn nowhere because the direction flips and the cells are tiny:
${luna.map(c => `%   luna depth ${c.depth}: low ${c.low.solved}/${c.low.n}, high ${c.high.solved}/${c.high.n}`).join('\n')}
%
% Standalone: pdflatex coupling_solve.tex
% In a paper: keep the tikzpicture, drop the documentclass wrapper.
\\documentclass[border=2pt]{standalone}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
${TEXDEFS}
\\begin{document}
\\begin{tikzpicture}
\\begin{axis}[
  width=8.2cm, height=5.4cm,
  ybar, bar width=13pt,
  ymin=0, ymax=112,
  ylabel={samples solved (\\%)},
  xlabel={fold depth (held fixed within each pair)},
  symbolic x coords={${DEPTHS.map(d => `${d} folds`).join(',')}},
  xtick=data,
  point meta=explicit symbolic,
  nodes near coords={\\pgfplotspointmeta},
  every node near coord/.append style={font=\\tiny, color=black!70},
  tick label style={font=\\small},
  label style={font=\\small},
  legend style={font=\\scriptsize, at={(0.5,1.18)}, anchor=north, legend columns=-1, draw=none},
  ymajorgrids, grid style={gray!25, dashed},
  axis line style={gray!60},
]
${SERIES.map(s => `\\addplot[fill=${COLOR[s.key].tex}, draw=none] coordinates {${
  bfs.map(c => `(${c.depth} folds,${(pct(c[s.key]) ?? 0).toFixed(1)}) [${c[s.key].solved}/${c[s.key].n}]`).join(' ')}};
\\addlegendentry{${s.label}}`).join('\n')}
\\end{axis}
\\end{tikzpicture}
\\end{document}
`;

const outDir = join(HERE, 'out');
mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'coupling_solve.svg'), svg);
writeFileSync(join(outDir, 'coupling_solve.tex'), tex);

const show = (name, cells) => {
  console.log(`\n  ${name}`);
  for (const c of cells) {
    console.log(`    depth ${c.depth}: coupling<${SPLIT} ${String(c.low.solved + '/' + c.low.n).padEnd(8)}` +
      `coupling>=${SPLIT} ${c.high.solved}/${c.high.n}`);
  }
};
show('BFS, per sample (drawn)', bfs);
show('Luna, per sample (not drawn: direction flips, cells are single digits)', luna);
console.log(`\n  wrote ${join(outDir, 'coupling_solve.svg')}`);
console.log(`  wrote ${join(outDir, 'coupling_solve.tex')}`);
