// Bidirectional search: forward from the flat sheet, backward from the target, meet in the
// middle. Measured against the one-directional BFS on the same samples and budget.
//
// WHY
// Exhaustive search cannot be rescued by speed -- at an effective base of 12.4 a 10x speedup
// buys 0.9 levels and hard-0001 is 16 short. Meeting in the middle changes the exponent
// instead of the constant: b^(d/2) twice rather than b^d once. Probe 1 measured forward
// branching at 3.14-3.43 against a mean in-degree of 1.20-1.33, predicting 300x on
// easy-0003 and 880x on mid-0001. This is the implementation that tests the prediction.
//
// WHAT IS KNOWN TO BE INCOMPLETE, AND WHY THE NUMBERS STILL MEAN SOMETHING
//   * predecessors() recovers the true predecessor on 8 of 14 reference steps. A backward
//     search on it can therefore miss paths, so a FAILURE here is not evidence that no
//     solution exists. A SUCCESS is still a success: every path is verified by replaying it
//     forward from the flat sheet before being reported.
//   * The target is rebuilt from the reference sequence's provenance, so the backward half
//     explores the pre-images of that particular folding. Two of nine solved instances
//     reach a terminalMatch-equal target with the paper arranged differently, and those
//     routes are invisible from here.
// Both cut the same way: this UNDERSTATES what a complete bidirectional search would do.
//
//   node workspace/search_bidirectional.mjs --seconds 60 easy-0001 easy-0003
//   node workspace/search_bidirectional.mjs --compare --seconds 120 mid-0001
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FoldSession, replay, tryFold} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
import {enumerateLegalFolds} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/legal_folds.mjs';
import {frameLayers, terminalMatch} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';
import {predecessors, stateKey, meetKey} from './unfold.mjs';
import {targetEngineState} from './target_state.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
// Defaults to the provenance-carrying copy, because the backward half needs it.
const CORPUS = process.env.CORPUS_DIR ?? join(ROOT, 'workspace/corpus_provenance');

const argv = process.argv.slice(2);
const flag = (n, f) => { const i = argv.indexOf(n); return i === -1 ? f : Number(argv.splice(i, 2)[1]); };
const seconds = flag('--seconds', 60);
const maxDepth = flag('--max-depth', 24);
const selection = (() => { const i = argv.indexOf('--selection'); return i === -1 ? 'all' : argv.splice(i, 2)[1]; })();
const compare = argv.includes('--compare');
const samples = argv.filter(a => !a.startsWith('--'));
if (!samples.length) { console.error('usage: node workspace/search_bidirectional.mjs [--seconds S] [--compare] <sample-id>...'); process.exit(2); }

const pad = (v, n) => String(v).padEnd(n);
const opts = {max_results: 500, selection_filter: selection};

function load(id) {
  const dir = join(CORPUS, id);
  const raw = JSON.parse(readFileSync(join(dir, 'cp.fold'), 'utf8'));
  const cp = {file_spec: 1.1, frame_classes: ['creasePattern'], vertices_coords: raw.vertices_coords,
              edges_vertices: raw.edges_vertices, edges_assignment: raw.edges_assignment};
  const frame = JSON.parse(readFileSync(join(dir, 'steps.fold'), 'utf8')).file_frames.at(-1);
  const reference = JSON.parse(readFileSync(join(dir, 'seq.json'), 'utf8')).folds.length;
  return {cp, frame, target: frameLayers(frame), reference};
}

// Forward: the legal folds from a state, as (action, resulting paper).
function successors(paper, cp, creases, actions) {
  const out = [];
  for (const e of enumerateLegalFolds({paper, cp, creases, actions}, opts).legal_folds) {
    const move = {tool: 'apply_fold', ...e.action};
    const v = tryFold(paper, cp, move);
    if (v.ok) out.push({action: move, paper: v.fold.state, made: v.fold.made});
  }
  return out;
}

function bidirectional(id, {cp, frame, target}) {
  const started = Date.now();
  const root = new FoldSession(cp);
  let targetPaper;
  try { targetPaper = targetEngineState(frame); }
  catch (e) { return {status: 'no-target-state', reason: e.message}; }

  // Each side maps a state key to the path that reaches it -- forward paths run from the
  // flat sheet, backward paths run TO the target, and a key in both is a complete sequence.
  // Dedup exactly, meet loosely: fSeen/bSeen key on the exact stack so neither side prunes
  // a state the goal test could tell apart, while fMeet/bMeet key on the canonical form so
  // the two sides recognise the same paper through an unobservable reordering.
  const fSeen = new Set([stateKey(root.paper)]);
  const bSeen = new Set([stateKey(targetPaper)]);
  const fMeet = new Map([[meetKey(root.paper), []]]);
  const bMeet = new Map([[meetKey(targetPaper), []]]);
  let fFrontier = [{paper: root.paper, creases: root.creases, actions: []}];
  let bFrontier = [{paper: targetPaper, actions: []}];
  let fExpanded = 0, bExpanded = 0;

  const finish = (forwardPath, backwardPath) => {
    const actions = [...forwardPath, ...backwardPath];
    // Verified, not trusted: replay from the flat sheet and check the goal test itself.
    try {
      const s = replay(cp, actions.map(a => ({...a})));
      if (!terminalMatch(s.layers, target)) return null;
      return {status: 'solved', depth: actions.length, actions,
              forward_expanded: fExpanded, backward_expanded: bExpanded,
              seconds: (Date.now() - started) / 1000};
    } catch { return null; }
  };

  for (let level = 0; level < maxDepth; level++) {
    if ((Date.now() - started) / 1000 > seconds) break;
    // Expand whichever side is narrower: that is the whole point of meeting in the middle.
    const forward = fFrontier.length <= bFrontier.length;
    if (forward) {
      const next = [];
      for (const node of fFrontier) {
        if ((Date.now() - started) / 1000 > seconds) break;
        fExpanded++;
        for (const s of successors(node.paper, cp, node.creases, node.actions)) {
          const key = stateKey(s.paper), mk = meetKey(s.paper);
          const path = [...node.actions, s.action];
          if (bMeet.has(mk)) { const done = finish(path, bMeet.get(mk)); if (done) return done; }
          if (fSeen.has(key)) continue;
          fSeen.add(key);
          if (!fMeet.has(mk)) fMeet.set(mk, path);
          next.push({paper: s.paper, creases: [...node.creases, ...s.made], actions: path});
        }
      }
      if (!next.length) return {status: 'forward-exhausted', depth: level,
                                forward_expanded: fExpanded, backward_expanded: bExpanded};
      fFrontier = next;
    } else {
      const next = [];
      for (const node of bFrontier) {
        if ((Date.now() - started) / 1000 > seconds) break;
        bExpanded++;
        for (const p of predecessors(node.paper, cp)) {
          const key = stateKey(p.paper), mk = meetKey(p.paper);
          const path = [p.action, ...node.actions];
          if (fMeet.has(mk)) { const done = finish(fMeet.get(mk), path); if (done) return done; }
          if (bSeen.has(key)) continue;
          bSeen.add(key);
          if (!bMeet.has(mk)) bMeet.set(mk, path);
          next.push({paper: p.paper, actions: path});
        }
      }
      if (!next.length) return {status: 'backward-exhausted', depth: level,
                                forward_expanded: fExpanded, backward_expanded: bExpanded,
                                note: 'predecessors() is 10/14 complete, so this may be the generator rather than the graph'};
      bFrontier = next;
    }
  }
  return {status: 'timeout', forward_expanded: fExpanded, backward_expanded: bExpanded,
          forward_states: fSeen.size, backward_states: bSeen.size};
}

// The same one-directional BFS the rest of the measurements use, for the comparison column.
function unidirectional(id, {cp, target}) {
  const started = Date.now();
  const root = new FoldSession(cp);
  let frontier = [{paper: root.paper, creases: root.creases, actions: []}];
  const seen = new Set([stateKey(root.paper)]);
  let expanded = 0;
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = [];
    for (const node of frontier) {
      if ((Date.now() - started) / 1000 > seconds) return {status: 'timeout', expanded, depth};
      expanded++;
      for (const s of successors(node.paper, cp, node.creases, node.actions)) {
        const key = stateKey(s.paper);
        if (seen.has(key)) continue;
        seen.add(key);
        const actions = [...node.actions, s.action];
        if (terminalMatch(replay(cp, actions.map(a => ({...a}))).layers, target)) {
          return {status: 'solved', depth: depth + 1, expanded, seconds: (Date.now() - started) / 1000};
        }
        next.push({paper: s.paper, creases: [...node.creases, ...s.made], actions});
      }
    }
    if (!next.length) return {status: 'exhausted', expanded, depth};
    frontier = next;
  }
  return {status: 'depth_limit', expanded};
}

console.log(`corpus ${CORPUS}, selection=${selection}, ${seconds}s per search\n`);
const head = compare
  ? `  ${pad('sample', 12)}${pad('ref', 5)}${pad('bidirectional', 34)}one-directional`
  : `  ${pad('sample', 12)}${pad('ref', 5)}${pad('result', 20)}fwd/bwd expanded`;
console.log(head);
for (const id of samples) {
  const task = load(id);
  const bi = bidirectional(id, task);
  const cell = r => r.status === 'solved'
    ? `solved d${r.depth} in ${r.seconds.toFixed(1)}s`
    : r.status === 'no-target-state' ? `no target state` : r.status;
  if (compare) {
    const uni = unidirectional(id, task);
    const un = uni.status === 'solved' ? `solved d${uni.depth} in ${uni.seconds.toFixed(1)}s (${uni.expanded} exp)` : `${uni.status} (${uni.expanded} exp)`;
    console.log(`  ${pad(id, 12)}${pad(task.reference, 5)}` +
                `${pad(`${cell(bi)} (${bi.forward_expanded ?? 0}f/${bi.backward_expanded ?? 0}b)`, 34)}${un}`);
  } else {
    console.log(`  ${pad(id, 12)}${pad(task.reference, 5)}${pad(cell(bi), 20)}` +
                `${bi.forward_expanded ?? 0}f / ${bi.backward_expanded ?? 0}b` +
                (bi.reason ? `  ${bi.reason.slice(0, 60)}` : ''));
  }
}
