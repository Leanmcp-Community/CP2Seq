import assert from 'node:assert/strict';
import { terminalMatch } from './terminal_match.mjs';

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
console.log('Terminal matching regression checks passed.');
