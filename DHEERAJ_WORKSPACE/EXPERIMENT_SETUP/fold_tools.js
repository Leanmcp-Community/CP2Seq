// Browser-native adapter around the shared connectivity-aware folding engine.
import { FoldSession, replay, actionLine } from './engine.mjs';
import { enumerateLegalFolds } from './legal_folds.mjs';
import { captureCP, captureViews, layersToPieces, setCaptureSize } from '../viewer/capture.js';
export { frameLayers, strictTerminalMatch, terminalMatch, TERMINAL_METRIC } from './terminal_match.mjs';
import { frameLayers } from './terminal_match.mjs';
import { evaluateSession } from './evaluation.mjs';


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
    return evaluateSession(this.session, this.target);
  }
  images(step = this.session.actions.length) {
    if (!Number.isInteger(step) || step < 0 || step >= this.session.states.length) throw Error('step must be 0..current sequence length');
    return captureViews(layersToPieces(this.session.states[step]), `Step ${step}`);
  }
  call(name, args = {}) {
    try {
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('arguments must be an object');
      const keys = {add_fold: ['angle_index', 'angle_degrees', 'selection_mode', 'layer_count', 'offset', 'move_positive', 'over'], remove_fold: ['step'],
        go_to_step: ['step'], restore_revision: ['revision'], get_images: ['step'], get_state: [],
        list_legal_folds: ['max_results', 'selection_filter', 'include_rejected'], finish: []}[name];
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
      } else if (name === 'list_legal_folds') {
        // Read-only: no commit, so the revision and the accepted sequence are untouched.
        return {ok: true, ...this.state(), enumeration: enumerateLegalFolds(this.session, args)};
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
      const mode = action.selection_mode ?? 'all';
      folds.push({step: folds.length + 1, angle_deg: action.angle_degrees ?? [0, 45, 90, 135][action.angle_index], ...action,
        line: actionLine(action), selection: mode === 'all' ? {mode} : {mode, k: action.layer_count},
        layers_before: before, layers_after: trace.layers.length,
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
