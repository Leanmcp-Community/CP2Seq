import assert from 'node:assert/strict';
import { terminalMatch, identityTerminalMatch, terminalMatchDetail, sessionLayers }
  from './terminal_match.mjs';
import { replay } from './engine.mjs';
import { readFileSync } from 'node:fs';

// Asymmetric polygons prevent a bad reflection from passing through an
// accidental symmetry of a square. Distinct layers expose ordering mistakes.
const source = [
  {poly: [[0, 0], [2, 0], [.3, .8]], par: 0},
  {poly: [[.1, .1], [.9, .1], [.2, .5]], par: 1},
  {poly: [[.2, .2], [.5, .2], [.25, .35]], par: 0},
];

function place(layers, degrees, dx, dy, turnover = false) {
  const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const stack = turnover ? [...layers].reverse() : layers;
  return stack.map(l => ({par: turnover ? 1 - l.par : l.par,
    poly: l.poly.map(([x, y]) => {
      if (turnover) y = -y;
      return [c * x - s * y + dx, s * x + c * y + dy];
    })}));
}

for (const degrees of [0, 30, 37, 90, 123.456, 180, 270, 359.9]) {
  for (const turnover of [false, true]) {
    const target = place(source, degrees, 12.75, -8.125, turnover);
    assert.equal(terminalMatch(source, target), true, `${degrees} degrees, turnover=${turnover}`);
    assert.equal(terminalMatch(target, source), true, 'comparison must work in both directions');
    // Polygon start vertex and winding do not change the folded object.
    const reordered = target.map(l => ({...l, poly: [...l.poly.slice(1), l.poly[0]].reverse()}));
    assert.equal(terminalMatch(source, reordered), true);
  }
}

const turned = place(source, 30, 4, -3, true);
assert.equal(terminalMatch(source, [...turned].reverse()), false, 'turnover needs stack reversal');
assert.equal(terminalMatch(source, turned.map(l => ({...l, par: 1 - l.par}))), false,
  'turnover needs parity flips');
const flatMirror = source.map(l => ({...l, poly: l.poly.map(([x, y]) => [x, -y])}));
assert.equal(terminalMatch(source, flatMirror), false, 'coordinate-only mirror is not a turnover');
assert.equal(terminalMatch(source, [source[1], source[0], source[2]]), false, 'wrong layer order');
assert.equal(terminalMatch(source, source.slice(1)), false, 'missing layer');
assert.equal(terminalMatch(source, source.map(l => ({...l,
  poly: l.poly.map(([x, y]) => [2 * x, 2 * y])}))), false, 'scaling is not allowed');
const shiftedLayer = source.map((l, i) => ({...l,
  poly: l.poly.map(([x, y]) => [x + (i === 1 ? .1 : 0), y])}));
assert.equal(terminalMatch(source, shiftedLayer), false, 'all layers must share one transformation');
assert.equal(terminalMatch([], []), false);

// ---- Identity-aware relation (E_id) -------------------------------------------------
// Adversarial: two layers with congruent current-plane polygons whose original-sheet
// regions are swapped. E_plane cannot see the swap; E_id must reject it.
const sq = (x, y) => [[x, y], [x + .5, y], [x + .5, y + .5], [x, y + .5]];
const withSheets = [
  {poly: sq(0, 0), par: 0, sheet: sq(0, 0)},
  {poly: sq(0, 0), par: 1, sheet: sq(.5, 0)},
  {poly: sq(0, 0), par: 0, sheet: sq(.5, .5)},
];
const swapped = withSheets.map((l, i) => ({...l, sheet: withSheets[[0, 2, 1][i]].sheet}));
assert.equal(terminalMatch(withSheets, swapped), true, 'E_plane is blind to sheet identity');
assert.equal(identityTerminalMatch(withSheets, swapped), false, 'E_id rejects swapped sheet regions');
assert.equal(identityTerminalMatch(withSheets, withSheets), true, 'E_id is reflexive');
// Sheet coordinates are never transformed: moving the object must not break E_id.
const movedWithSheets = place(withSheets, 90, 3, 1).map((l, i) => ({...l, sheet: withSheets[i].sheet}));
assert.equal(identityTerminalMatch(withSheets, movedWithSheets), true, 'E_id is isometry invariant');
// Turnover reverses the stack, so sheet regions travel with their layers.
const turnedWithSheets = place(withSheets, 0, 0, 0, true)
  .map((l, i) => ({...l, sheet: withSheets[withSheets.length - 1 - i].sheet}));
assert.equal(identityTerminalMatch(withSheets, turnedWithSheets), true, 'E_id under turnover');
// Missing sheet data fails closed.
assert.equal(identityTerminalMatch(source, source), false, 'no sheet data: fail closed');
const detail = terminalMatchDetail(withSheets, swapped);
assert.equal(detail.plane_match && !detail.identity_match && detail.identity_checked, true);

// Real engine states: every reference sequence in a few corpus samples satisfies E_id
// against itself, and a stack whose sheet regions are permuted does not.
const corpus = new URL('../../workspace/corpus/out/release/all-layers/samples/', import.meta.url);
for (const id of ['easy-0001', 'easy-0002', 'mid-0001']) {
  const cp = JSON.parse(readFileSync(new URL(`${id}/cp.fold`, corpus)));
  const seq = JSON.parse(readFileSync(new URL(`${id}/seq.json`, corpus)));
  const {actionFromFold} = await import('./engine.mjs');
  const layers = sessionLayers(replay(cp, seq.folds.map(actionFromFold)));
  assert.equal(identityTerminalMatch(layers, layers), true, `${id}: reference matches itself`);
  const rolled = layers.map((l, i) => ({...l, sheet: layers[(i + 1) % layers.length].sheet}));
  assert.equal(identityTerminalMatch(layers, rolled), false, `${id}: permuted sheets rejected`);
}
console.log('Terminal matching regression checks passed.');
