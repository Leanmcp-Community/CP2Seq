// Emit the main result figure: solve rate per difficulty group, one bar per arm.
//
// WHY A BAR CHART AND NOT A CURVE. There are three groups and three arms with enough attempts
// to carry a rate. A curve would imply the groups are points on a continuum; they are strata
// with different reference depths, and the interesting comparison is vertical, within a group,
// between the search baseline and the models.
//
// WHAT IT MUST NOT HIDE. Every bar prints solved/attempts. §9 of the paper says any main table
// prints n in every cell or drops the row, and a figure has no excuse the table does not. Arms
// with fewer than MIN_N attempts are left out entirely rather than drawn as a bar nobody should
// read; the caption says how many attempts they account for, so the omission is visible.
//
// SOURCE is the "By model and tool tier" table of workspace/RESULTS/results.md, which is what
// the paper's headline table quotes. Parsing that table rather than re-deriving from the run
// directory keeps the figure and the table from drifting apart: one file changes, both move.
//
//   node workspace/figures/make_main_result_figure.mjs
//   node workspace/figures/make_main_result_figure.mjs --min-n 10
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const argv = process.argv.slice(2);
const pick = (n, f) => { const i = argv.indexOf(n); return i === -1 ? f : argv[i + 1]; };
const MIN_N = Number(pick('--min-n', 10));
const SRC = join(ROOT, 'workspace/RESULTS/results.md');

// Rows look like: | gpt-5.6-luna / tools=legal-folds | 59/289 | 0/66 | 0/25 | 59/380 (15.5%) | 23.5 |
const cell = t => {
  const m = t.trim().match(/^(\d+)\/(\d+)/);
  return m ? {solved: +m[1], n: +m[2]} : null;
};

const md = readFileSync(SRC, 'utf8');
const section = md.split('### By model and tool tier')[1]?.split('###')[0];
if (!section) { console.error('results.md has no "By model and tool tier" table'); process.exit(2); }

const rows = [];
for (const line of section.split('\n')) {
  if (!line.startsWith('|') || line.includes('---') || line.includes('easy solved')) continue;
  const c = line.split('|').map(s => s.trim()).filter(Boolean);
  if (c.length < 5) continue;
  const [arm, easy, mid, hard] = c;
  if (arm.startsWith('unknown')) continue;
  rows.push({arm, easy: cell(easy), mid: cell(mid), hard: cell(hard)});
}

// Tier order is the difficulty order, not the order the table happens to list.
const GROUPS = [['easy', 'easy'], ['mid', 'medium'], ['hard', 'hard']];
const shown = rows.filter(r => (r.easy?.n ?? 0) + (r.mid?.n ?? 0) + (r.hard?.n ?? 0) >= MIN_N);
const dropped = rows.filter(r => !shown.includes(r));
const droppedN = dropped.reduce((s, r) =>
  s + (r.easy?.n ?? 0) + (r.mid?.n ?? 0) + (r.hard?.n ?? 0), 0);

// Readable names. The harness writes "tools=none" for the basic-tools condition, which is the
// name of a flag and not the name of a condition; the paper calls it basic tools.
const label = arm => arm
    .replace('deterministic-bfs', 'BFS')
    .replace('gpt-5.6-luna', 'Luna')
    .replace(' / tools=legal-folds', ', candidate filtering')
    .replace(' / tools=none', ', basic tools');

// Categorical slots 1-3 of the validated default palette, assigned in fixed order and never
// cycled. Checked with the palette validator on a light surface: lightness band, chroma floor,
// CVD separation (worst adjacent pair dE 9.2 deutan) and normal-vision floor all pass. Slot 3
// warns on contrast at 2.74:1, which is why every bar carries a visible solved/n label.
const COLOR = [
  {svg: '#2a78d6', tex: 'vizA'},
  {svg: '#eb6834', tex: 'vizB'},
  {svg: '#1baf7a', tex: 'vizC'},
];
const TEXDEFS = ['\\definecolor{vizA}{HTML}{2A78D6}', '\\definecolor{vizB}{HTML}{EB6834}',
                 '\\definecolor{vizC}{HTML}{1BAF7A}'].join('\n');

const pct = c => c && c.n ? 100 * c.solved / c.n : 0;
const tag = c => c ? `${c.solved}/${c.n}` : '--';

/* ---------- SVG ---------- */
const W = 560, H = 330, M = {l: 52, r: 14, t: 22, b: 76};
const PX = W - M.l - M.r, PY = H - M.t - M.b;
const YMAX = 60;
const gw = PX / GROUPS.length;
const bw = Math.min(46, (gw - 26) / shown.length);
const y = v => M.t + PY - (v / YMAX) * PY;

const bars = [];
GROUPS.forEach(([key], gi) => {
  shown.forEach((r, ai) => {
    const c = r[key];
    const cx = M.l + gi * gw + (gw - bw * shown.length) / 2 + ai * bw;
    const v = pct(c);
    bars.push({x: cx + 1, w: bw - 2, v, c, col: COLOR[ai % COLOR.length]});
  });
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">
<title>Solve rate by difficulty group</title>
<desc>Solve rate per difficulty group for ${shown.map(r => label(r.arm)).join(', ')}. Source: ${SRC}. Every bar is labelled with solved over attempts.</desc>
<rect width="${W}" height="${H}" fill="#ffffff"/>
${[0, 10, 20, 30, 40, 50, 60].map(v =>
  `<line x1="${M.l}" y1="${y(v).toFixed(1)}" x2="${W - M.r}" y2="${y(v).toFixed(1)}" stroke="#e3e3e3" stroke-width="0.8" stroke-dasharray="${v ? '3 3' : '0'}"/>
<text x="${M.l - 6}" y="${(y(v) + 3.5).toFixed(1)}" font-size="9" fill="#444" text-anchor="end">${v}%</text>`).join('\n')}
${bars.map(b => b.c === null ? '' : `<rect x="${b.x.toFixed(1)}" y="${y(b.v).toFixed(1)}" width="${b.w.toFixed(1)}" height="${(M.t + PY - y(b.v)).toFixed(1)}" fill="${b.col.svg}" opacity="0.9"/>
<text x="${(b.x + b.w / 2).toFixed(1)}" y="${(y(b.v) - 4).toFixed(1)}" font-size="8" fill="#333" text-anchor="middle">${tag(b.c)}</text>`).join('\n')}
${GROUPS.map(([, name], gi) =>
  `<text x="${(M.l + gi * gw + gw / 2).toFixed(1)}" y="${(M.t + PY + 16).toFixed(1)}" font-size="10.5" fill="#333" text-anchor="middle">${name}</text>`).join('\n')}
<line x1="${M.l}" y1="${(M.t + PY).toFixed(1)}" x2="${W - M.r}" y2="${(M.t + PY).toFixed(1)}" stroke="#444" stroke-width="0.8"/>
<text x="14" y="${(M.t + PY / 2).toFixed(1)}" font-size="10.5" fill="#444" text-anchor="middle" transform="rotate(-90 14 ${(M.t + PY / 2).toFixed(1)})">solve rate</text>
<g font-size="9" fill="#444">
${shown.map((r, i) => `<rect x="${M.l + i * 170}" y="${H - 50}" width="9" height="9" fill="${COLOR[i % COLOR.length].svg}"/><text x="${M.l + i * 170 + 14}" y="${H - 42}">${label(r.arm)}</text>`).join('\n')}
</g>
<text x="${M.l}" y="${H - 22}" font-size="8.5" fill="#999">Bars are labelled solved/attempts. Attempts, not distinct samples: one sample may be attempted more than once.</text>
<text x="${M.l}" y="${H - 11}" font-size="8.5" fill="#999">Arms with fewer than ${MIN_N} attempts are omitted; they account for ${droppedN} attempts, none solved${dropped.some(d => (d.easy?.solved ?? 0) > 0) ? ' except one' : ''}.</text>
</svg>
`;

/* ---------- pgfplots ---------- */
const tex = `% Main result: solve rate per difficulty group.
% Generated by workspace/figures/make_main_result_figure.mjs
% Source: ${SRC} ("By model and tool tier")
${rows.map(r => `% ${r.arm}: easy ${tag(r.easy)}, medium ${tag(r.mid)}, hard ${tag(r.hard)}`).join('\n')}
%
% Standalone: pdflatex main_result.tex
% In a paper: keep the tikzpicture, drop the documentclass wrapper.
\\documentclass[border=2pt]{standalone}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
${TEXDEFS}
\\begin{document}
\\begin{tikzpicture}
\\begin{axis}[
  width=8.8cm, height=5.6cm,
  ybar, bar width=9pt,
  ymin=0, ymax=${YMAX},
  ylabel={solve rate (\\%)},
  symbolic x coords={${GROUPS.map(g => g[1]).join(',')}},
  xtick=data,
  point meta=explicit symbolic,
  nodes near coords={\\pgfplotspointmeta},
  every node near coord/.append style={font=\\tiny, color=black!70},
  tick label style={font=\\small},
  label style={font=\\small},
  legend style={font=\\scriptsize, at={(0.5,1.16)}, anchor=north, legend columns=-1, draw=none},
  ymajorgrids, grid style={gray!25, dashed},
  axis line style={gray!60},
]
${shown.map((r, i) => `\\addplot[fill=${COLOR[i % COLOR.length].tex}, draw=none] coordinates {${
  GROUPS.map(([key, name]) => `(${name},${pct(r[key]).toFixed(1)}) [${tag(r[key])}]`).join(' ')}};
\\addlegendentry{${label(r.arm)}}`).join('\n')}
\\end{axis}
\\end{tikzpicture}
\\end{document}
`;

const outDir = join(HERE, 'out');
mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'main_result.svg'), svg);
writeFileSync(join(outDir, 'main_result.tex'), tex);

console.log(`\n  arm${' '.repeat(34)}easy        medium      hard`);
for (const r of rows) {
  console.log('  ' + label(r.arm).padEnd(36) + [r.easy, r.mid, r.hard].map(c => tag(c).padEnd(12)).join(''));
}
console.log(`\n  shown: ${shown.length} arms; omitted: ${dropped.length} arms over ${droppedN} attempts`);
console.log(`  wrote ${join(outDir, 'main_result.svg')}`);
console.log(`  wrote ${join(outDir, 'main_result.tex')}`);
