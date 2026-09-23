// Emit the difficulty grid: how the corpus is distributed over fold depth and coupling.
//
// WHY THIS FIGURE EXISTS. The paper defines coupling, the number of creases one fold makes, as
// the measurable proxy for non-local dependency, and then reports difficulty by fold count alone.
// A reader is entitled to ask what the second axis actually contains. This shows it, including
// the corners the generator does not reach: long sequences at low coupling are rare, because
// every all-layers fold thickens the stack, so a long sequence cannot keep cutting few layers.
// Real folders reach that corner by pre-creasing, which this action space excludes.
//
// TWO META SCHEMAS, ONE QUANTITY. The all-layers samples carry metrics.coupling_mean directly;
// the some-layers samples carry metrics.creases and a top-level step count. Both express the
// same thing, creases made per fold, so the reader is not shown two different measures under
// one axis label.
//
//   node workspace/figures/make_difficulty_grid_figure.mjs
import {readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const CORPUS = join(ROOT, 'workspace/corpus/out/release');

const samples = [];
for (const batch of readdirSync(CORPUS)) {
  const base = join(CORPUS, batch, 'samples');
  if (!existsSync(base)) continue;
  for (const id of readdirSync(base)) {
    const m = JSON.parse(readFileSync(join(base, id, 'meta.json'), 'utf8'));
    const steps = m.metrics?.steps ?? m.steps;
    const coupling = m.metrics?.coupling_mean ??
      (m.metrics?.creases != null && steps ? m.metrics.creases / steps : null);
    if (steps == null || coupling == null) continue;
    samples.push({id, steps, coupling, model: m.tier === 'some-layers' ? 'some' : 'all'});
  }
}
if (!samples.length) { console.error(`no samples under ${CORPUS}`); process.exit(2); }

// Depth is the natural unit and needs no binning. Coupling does: it runs from 1 to the hundreds,
// and a linear axis would put every easy sample in one row. Powers of two, because a fold that
// crosses the whole stack doubles the creases it can make when the stack doubles.
const DMIN = Math.min(...samples.map(s => s.steps));
const DMAX = Math.max(...samples.map(s => s.steps));
const cbin = c => Math.max(0, Math.min(7, Math.floor(Math.log2(Math.max(1, c)))));
const CLABEL = ['1', '2--3', '4--7', '8--15', '16--31', '32--63', '64--127', '128+'];
const CBINS = CLABEL.length;

const grid = Array.from({length: CBINS}, () => new Array(DMAX - DMIN + 1).fill(0));
for (const s of samples) grid[cbin(s.coupling)][s.steps - DMIN]++;
const peak = Math.max(...grid.flat());

// The corner worth naming is the one that is actually empty, not one that merely looks thin.
// Counted rather than asserted, so the sentence under the figure cannot drift from the data.
const CORNER_D = 15, CORNER_C = 4;
const corner = samples.filter(s => s.steps >= CORNER_D && s.coupling < CORNER_C).length;
const deepest = Math.max(...samples.filter(s => s.coupling < CORNER_C).map(s => s.steps));

/* ---------- SVG ---------- */
const W = 620, H = 330, M = {l: 66, r: 96, t: 20, b: 74};
const PX = W - M.l - M.r, PY = H - M.t - M.b;
const cw = PX / (DMAX - DMIN + 1), ch = PY / CBINS;
// A count of zero is white, so an empty cell reads as empty rather than as a light value.
const shade = n => {
  if (!n) return '#ffffff';
  const t = Math.log(1 + n) / Math.log(1 + peak);
  const mix = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${mix(233, 21)},${mix(240, 94)},${mix(246, 117)})`;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">
<title>Corpus coverage over fold depth and coupling</title>
<desc>${samples.length} samples binned by fold depth and by creases made per fold. Peak cell holds ${peak} samples.</desc>
<rect width="${W}" height="${H}" fill="#ffffff"/>
${grid.map((row, ci) => row.map((n, di) => {
  const x = M.l + di * cw, y = M.t + (CBINS - 1 - ci) * ch;
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="${shade(n)}" stroke="#d8dde2" stroke-width="0.5"/>${
    n ? `\n<text x="${(x + cw / 2).toFixed(1)}" y="${(y + ch / 2 + 3).toFixed(1)}" font-size="7.5" fill="${n / peak > 0.55 ? '#ffffff' : '#334'}" text-anchor="middle">${n}</text>` : ''}`;
}).join('\n')).join('\n')}
${CLABEL.map((lab, ci) =>
  `<text x="${M.l - 6}" y="${(M.t + (CBINS - 1 - ci) * ch + ch / 2 + 3).toFixed(1)}" font-size="8.5" fill="#444" text-anchor="end">${lab.replace('--', '–')}</text>`).join('\n')}
${Array.from({length: DMAX - DMIN + 1}, (_, di) => DMIN + di).filter(d => d % 2 === (DMIN % 2)).map(d =>
  `<text x="${(M.l + (d - DMIN) * cw + cw / 2).toFixed(1)}" y="${(M.t + PY + 14).toFixed(1)}" font-size="8.5" fill="#444" text-anchor="middle">${d}</text>`).join('\n')}
<text x="${(M.l + PX / 2).toFixed(1)}" y="${(M.t + PY + 32).toFixed(1)}" font-size="10.5" fill="#333" text-anchor="middle">fold depth (folds in the reference sequence)</text>
<text x="14" y="${(M.t + PY / 2).toFixed(1)}" font-size="10.5" fill="#333" text-anchor="middle" transform="rotate(-90 14 ${(M.t + PY / 2).toFixed(1)})">coupling (creases per fold)</text>
<g font-size="8.5" fill="#666">
<text x="${W - M.r + 10}" y="${M.t + 12}">samples</text>
${[0, 1, Math.round(peak / 4), Math.round(peak / 2), peak].filter((v, i, a) => a.indexOf(v) === i).map((v, i) =>
  `<rect x="${W - M.r + 10}" y="${M.t + 22 + i * 16}" width="11" height="11" fill="${shade(v)}" stroke="#d8dde2" stroke-width="0.5"/>
<text x="${W - M.r + 26}" y="${M.t + 31 + i * 16}">${v}</text>`).join('\n')}
</g>
<text x="${M.l}" y="${H - 22}" font-size="8.5" fill="#999">Depth and coupling are not independent: an all-layers fold thickens the stack, so a long sequence cannot keep cutting few layers.</text>
<text x="${M.l}" y="${H - 11}" font-size="8.5" fill="#999">${corner === 0 ? `No sample reaches ${CORNER_D} folds at coupling below ${CORNER_C}; the deepest such sample has ${deepest}. Real folders reach that corner by pre-creasing, which this action space excludes.` : `${corner} samples reach ${CORNER_D} folds at coupling below ${CORNER_C}.`}</text>
</svg>
`;

/* ---------- TikZ, drawn directly so the paper needs no plotting package ---------- */
const CW = 0.44, CH = 0.42; // cm
const tex = `% Corpus coverage over fold depth and coupling.
% Generated by workspace/figures/make_difficulty_grid_figure.mjs
% Source: ${CORPUS} (${samples.length} samples, peak cell ${peak})
%
% Standalone: pdflatex difficulty_grid.tex
% In a paper: keep the tikzpicture, drop the documentclass wrapper.
\\documentclass[border=2pt]{standalone}
\\usepackage{tikz}
\\begin{document}
\\begin{tikzpicture}[x=${CW}cm, y=${CH}cm, font=\\scriptsize]
${grid.map((row, ci) => row.map((n, di) => {
  if (!n) return `\\draw[gray!30] (${di},${ci}) rectangle ++(1,1);`;
  const t = Math.round(100 * Math.log(1 + n) / Math.log(1 + peak));
  return `\\fill[teal!${t}!white] (${di},${ci}) rectangle ++(1,1); \\draw[gray!30] (${di},${ci}) rectangle ++(1,1); \\node[font=\\tiny, ${t > 55 ? 'white' : 'black!70'}] at (${di + 0.5},${ci + 0.5}) {${n}};`;
}).join('\n')).join('\n')}
${CLABEL.map((lab, ci) => `\\node[anchor=east, font=\\tiny] at (-0.2,${ci + 0.5}) {${lab}};`).join('\n')}
${Array.from({length: DMAX - DMIN + 1}, (_, di) => DMIN + di).filter(d => d % 2 === (DMIN % 2)).map(d =>
  `\\node[anchor=north, font=\\tiny] at (${d - DMIN + 0.5},0) {${d}};`).join('\n')}
\\node[anchor=north] at (${(DMAX - DMIN + 1) / 2},-0.9) {fold depth (folds in the reference sequence)};
\\node[rotate=90, anchor=south] at (-2.2,${CBINS / 2}) {coupling (creases per fold)};
\\end{tikzpicture}
\\end{document}
`;

const outDir = join(HERE, 'out');
mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'difficulty_grid.svg'), svg);
writeFileSync(join(outDir, 'difficulty_grid.tex'), tex);

console.log(`\n  ${samples.length} samples, depth ${DMIN}-${DMAX}, peak cell ${peak}`);
console.log(`  depth >= ${CORNER_D} with coupling < ${CORNER_C}: ${corner} samples (deepest low-coupling sample: ${deepest} folds)`);
console.log(`  wrote ${join(outDir, 'difficulty_grid.svg')}`);
console.log(`  wrote ${join(outDir, 'difficulty_grid.tex')}`);
