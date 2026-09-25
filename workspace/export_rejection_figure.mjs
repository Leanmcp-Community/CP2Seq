// Run from repository root: node workspace/export_rejection_figure.mjs
// Uses existing verification fixtures; never calls a model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {FoldSession} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {CASES} from '../DHEERAJ_WORKSPACE/viewer/verification-cases.mjs';

const build = id => {
  const fixture = CASES.find(c => c.id === id);
  const session = new FoldSession(fixture.cp);
  for (const a of fixture.candidate.slice(0, -1)) {
    const result = session.apply({tool: 'apply_fold', ...a});
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  const before = session.observation();
  const action = fixture.candidate.at(-1);
  const response = session.apply({tool: 'apply_fold', ...action});
  return {fixture: id, before, action, response, after: session.observation()};
};
const rejected = build('tear-single');
const accepted = build('legal-pair');
assert.deepEqual(rejected.before, accepted.before);
assert.equal(rejected.response.error, 'would-tear');
assert.deepEqual(rejected.after, rejected.before);
assert.equal(accepted.response.ok, true);
const d = rejected.response.diagnostic;
assert.equal(d.join_current_coords.length, 2);
assert.equal(rejected.action.angle_index, 2); // Vertical line x = offset.
assert.equal(accepted.action.angle_index, 2);
assert.equal(rejected.action.offset, accepted.action.offset);
const layers = rejected.before.layers_bottom_to_top;
assert.equal(layers.length, 4);
// Pure display offsets separate overlapping layers; no simulated thickness.
const point = ([x,y], rank) => `(${(x + .11*rank).toFixed(6)},${(y + .035*rank).toFixed(6)})`;
function panel(record, title) {
  const selected = layers.length - record.action.layer_count;
  let s = `\\begin{minipage}[t]{.47\\linewidth}\n\\centering\n\\textbf{${title}}\\par\\smallskip\n`;
  s += '\\begin{tikzpicture}[x=3.6cm,y=3.6cm,font=\\scriptsize]\n';
  layers.forEach((layer, rank) => {
    s += `\\draw[fill=${rank >= selected ? 'blue!12' : 'gray!12'},draw=gray] ${layer.polygon.map(p=>point(p,rank)).join(' -- ')} -- cycle;\n`;
    if (rank >= selected) {
      const ys = layer.polygon.map(p=>p[1]);
      s += `\\draw[blue!75!black,dashed,thick] ${point([record.action.offset,Math.min(...ys)],rank)} -- ${point([record.action.offset,Math.max(...ys)],rank)};\n`;
    }
  });
  // Show the same material join on its two incident layers in both panels.
  for (const rank of [d.moving_layer_rank, d.stationary_layer_rank]) {
    s += `\\draw[red!75!black,line width=1.5pt] ${d.join_current_coords.map(p=>point(p,rank)).join(' -- ')};\n`;
  }
  s += '\\end{tikzpicture}\\par\n';
  s += record === rejected
    ? '\\texttt{would-tear}\\par Top leaf selected; state unchanged.\n'
    : '\\texttt{ok: true}\\par Connected top pair selected.\n';
  return s + '\\end{minipage}\n';
}
const directory = fileURLToPath(new URL('../PAPER_FINAL/iclr2026/figures/', import.meta.url));
const tex = panel(rejected, '(a) Rejected proposal') + '\\hfill\n' + panel(accepted, '(b) Accepted proposal');
fs.writeFileSync(directory + 'rejection-feedback-panels.tex', tex);
fs.writeFileSync(directory + 'rejection-feedback-evidence.json', JSON.stringify({rejected,accepted},null,2)+'\n');
console.log('Verified rejection and acceptance from identical states. Saved TikZ panels and evidence JSON.');
