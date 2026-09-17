// Browser-native adapter around the existing exact all-layers engine.
import { FoldSession, replay } from './engine.mjs';
import { captureCP, captureViews, layersToPieces, setCaptureSize } from '../viewer/capture.js';

export function frameLayers(frame) {
  if (!frame?.faces_vertices?.length || !frame.vertices_coords?.length) throw Error('Final FOLD frame lacks geometry');
  return frame.faces_vertices.map((face, i) => ({
    poly: face.map(v => frame.vertices_coords[v].slice(0, 2)),
    par: frame['fo:faces_parity']?.[i] ?? 0,
    rank: frame['fo:faces_layer']?.[i] ?? i,
  })).sort((a, b) => a.rank - b.rank);
}

function cleanPoly(poly) {
  let p = poly.filter((v, i) => Math.hypot(v[0] - poly[(i + 1) % poly.length][0], v[1] - poly[(i + 1) % poly.length][1]) > 1e-7);
  let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < 1e-9) { p.splice(i, 1); changed = true; break; }
    }
  }
  return p;
}
function samePolygon(a, b) {
  a = cleanPoly(a); b = cleanPoly(b);
  if (a.length !== b.length) return false;
  return b.some((_, start) => [1, -1].some(sign => a.every((p, i) => {
    const q = b[(start + sign * i + b.length) % b.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) <= 2e-6;
  })));
}
export function strictTerminalMatch(layers, target) {
  return layers.length === target.length && layers.every((l, i) =>
    l.par === target[i].par && samePolygon(l.poly, target[i].poly));
}

export class ToolSession {
  constructor(cp, target) {
    this.cp = cp; this.target = frameLayers(target); this.session = new FoldSession(cp);
    this.revision = 0; this.history = new Map([[0, []]]);
  }
  state() {
    return {...this.session.observation(), revision: this.revision,
      sequence: this.session.actions.map(({tool, ...a}) => a)};
  }
  commit(next) {
    this.session = next; this.revision++;
    this.history.set(this.revision, structuredClone(next.actions));
  }
  evaluate() {
    const cp = this.session.evaluate(), terminal = strictTerminalMatch(this.session.layers, this.target);
    return {...cp, terminal_reference_match: terminal, pilot_match: cp.cp_match && terminal,
      terminal_metric: 'Fixed-coordinate polygon, parity and bottom-to-top layer equality; no symmetry quotient'};
  }
  images(step = this.session.actions.length) {
    if (!Number.isInteger(step) || step < 0 || step >= this.session.states.length) throw Error('step must be 0..current sequence length');
    return captureViews(layersToPieces(this.session.states[step]), `Step ${step}`);
  }
  call(name, args = {}) {
    try {
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('arguments must be an object');
      const keys = {add_fold: ['angle_index', 'offset', 'move_positive', 'over'], remove_fold: ['step'],
        go_to_step: ['step'], restore_revision: ['revision'], get_images: ['step'], get_state: [], finish: []}[name];
      if (!keys || Object.keys(args).some(k => !keys.includes(k))) throw Error('Unknown tool or argument');
      let info = {};
      if (name === 'add_fold') {
        const next = replay(this.cp, this.session.actions);
        info = next.apply({tool: 'apply_fold', ...args});
        if (!info.ok) return {...info, ...this.state()};
        this.commit(next);
      } else if (name === 'remove_fold' || name === 'go_to_step') {
        const n = this.session.actions.length, k = args.step;
        if (!Number.isInteger(k) || k < (name === 'remove_fold' ? 1 : 0) || k > n) throw Error('Invalid step index');
        const actions = this.session.actions.filter((_, i) => name === 'remove_fold' ? i !== k - 1 : i < k);
        // Replay a candidate first: failed middle removals never corrupt the live state.
        this.commit(replay(this.cp, actions));
      } else if (name === 'restore_revision') {
        if (!Number.isInteger(args.revision) || !this.history.has(args.revision)) throw Error('Unknown revision');
        this.commit(replay(this.cp, this.history.get(args.revision)));
      } else if (name === 'get_images') {
        return {ok: true, ...this.state(), image_step: args.step ?? this.session.actions.length, images: this.images(args.step)};
      } else if (name === 'finish') {
        return {ok: true, finished: true, ...this.state(), evaluation: this.evaluate()};
      }
      return {ok: true, ...info, ...this.state()};
    } catch (e) { return {ok: false, error: e.message, ...this.state()}; }
  }
  artifacts() {
    const trace = new FoldSession(this.cp), folds = [];
    for (const {tool, ...action} of this.session.actions) {
      const before = trace.layers.length, n = trace.creases.length;
      trace.apply({tool: 'apply_fold', ...action});
      folds.push({step: folds.length + 1, angle_deg: [0, 45, 90, 135][action.angle_index], ...action,
        selection: {mode: 'all'}, layers_before: before, layers_after: trace.layers.length,
        creases_created: trace.creases.length - n,
        creases: trace.creases.slice(n).map(c => ({P: c.P, Q: c.Q, assignment: c.a}))});
    }
    return {sequence: {steps: folds.length, folds},
    steps: this.session.sequence(), evaluation: this.evaluate(), state: this.state()};
  }
}

window.foldTools = {
  init(cp, target, size = 512) {
    setCaptureSize(size);
    this.active = new ToolSession(cp, target);
    return {state: this.active.state(), images: {cp: captureCP(cp),
      ...Object.fromEntries(Object.entries(captureViews(layersToPieces(this.active.target), 'Target')).map(([k, v]) => [`target-${k}`, v])),
      ...Object.fromEntries(Object.entries(this.active.images()).map(([k, v]) => [`initial-${k}`, v]))}};
  },
  call(name, args) { return this.active.call(name, args); },
  artifacts() { return this.active.artifacts(); },
};
