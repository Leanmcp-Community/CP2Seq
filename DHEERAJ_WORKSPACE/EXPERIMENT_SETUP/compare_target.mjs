// How the current stack differs from the target stack, at three levels of detail.
//
// WHY THIS EXISTS
// Every add_fold gets per-crease diagnostics with coordinates and repair advice. The terminal
// state gets nothing until finish, by which point the episode is over. The measured failures
// sit exactly in that blind spot: seven of twelve easy episodes reproduced the crease pattern
// EXACTLY -- 8/8, 23/23, 25/25 segments -- and every one of them lost on layer order. easy-0023
// stopped one fold short with a silhouette identical to the target's.
//
// WHAT IT DOES NOT ADD
// Nothing the model was not already handed. target.fold, with its faces and fo:faces_parity,
// is in every prompt; the reference SEQUENCE is not used here and never enters a prompt. All
// three tiers read the final state alone, so this works in exactly the setting the benchmark
// already defines: a crease pattern and a folded object, no recipe.
//
// THE TIERS differ in how much of the reasoning the tool does, not in what it knows:
//   1  a fact about the model's own state    -- "you have 10 layers, the target has 12"
//   2  where two given objects disagree      -- "ranks 7 and 8 have the wrong parity"
//   3  what to change                        -- "rank 7 should be parity 1"
// Tier 3 is a legitimate experimental condition rather than a leak, but it does most of the
// work, so a run using it has to say so when its numbers are reported.
import {cleanPoly, samePolygon} from './terminal_match.mjs';

const MATCH_TOL = 2e-6;

// The unique isometry sending a1 -> b1 and a2 -> b2, optionally mirrored. Same construction
// terminalMatch uses; duplicated here because that one is not exported and scoring needs it.
function isometry(a1, a2, b1, b2, mirror) {
  const ax = a2[0] - a1[0], ay = mirror ? -(a2[1] - a1[1]) : a2[1] - a1[1];
  const bx = b2[0] - b1[0], by = b2[1] - b1[1];
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < 1e-7 || Math.abs(la - lb) > MATCH_TOL) return null;
  const cos = (ax * bx + ay * by) / (la * lb), sin = (ax * by - ay * bx) / (la * lb);
  return point => {
    const x = point[0] - a1[0], y = mirror ? -(point[1] - a1[1]) : point[1] - a1[1];
    return [cos * x - sin * y + b1[0], sin * x + cos * y + b1[1]];
  };
}

// terminalMatch returns on the first isometry that carries EVERY layer, and abandons a mirror
// branch as soon as one parity disagrees. Neither is usable for feedback: a near miss needs
// the best partial fit, not a bool. This scores every candidate and keeps the best.
function bestAlignment(layers, target) {
  const depth = Math.min(layers.length, target.length);
  let best = {matched: -1, turned: false, ranks: [], transform: null};
  if (!depth) return best;
  for (const mirror of [false, true]) {
    const aligned = mirror
      ? [...layers].reverse().map(l => ({...l, par: 1 - l.par}))
      : layers;
    const from = cleanPoly(aligned[0].poly);
    for (const ontoIndex of [0]) {
      const onto = cleanPoly(target[ontoIndex].poly);
      if (from.length < 2 || onto.length < 2) continue;
      for (let start = 0; start < onto.length; start++) {
        for (const sign of [1, -1]) {
          const T = isometry(from[0], from[1], onto[start],
                             onto[(start + sign + onto.length) % onto.length], mirror);
          if (!T) continue;
          const ranks = [];
          let matched = 0;
          for (let i = 0; i < depth; i++) {
            const shape_ok = samePolygon(aligned[i].poly.map(T), target[i].poly);
            const parity_ok = aligned[i].par === target[i].par;
            if (shape_ok && parity_ok) matched++;
            else ranks.push({rank: i, shape_ok, parity_ok,
                             parity_now: aligned[i].par, parity_target: target[i].par});
          }
          if (matched > best.matched) best = {matched, turned: mirror, ranks, transform: T, aligned};
        }
      }
    }
  }
  return best;
}

// Does this stack hold the right pieces in the wrong order? Answered by asking, for each
// candidate layer, which target rank its polygon belongs at. A permutation means the folds
// were right and the stacking was not, which is a different repair from a wrong shape.
function orderingDiagnosis(aligned, target, transform) {
  if (!transform || aligned.length !== target.length) return null;
  const belongs = aligned.map(l => {
    const moved = l.poly.map(transform);
    return target.findIndex(t => samePolygon(moved, t.poly));
  });
  if (belongs.some(i => i < 0)) return null;
  const permuted = belongs.some((want, at) => want !== at);
  return permuted ? belongs : null;
}

/**
 * @param layers  current stack, bottom to top, from frameLayers/currentPolys shape
 * @param target  target stack, same shape
 * @param tier    1, 2 or 3
 */
export function compareToTarget(layers, target, tier = 1) {
  const level = Math.max(1, Math.min(3, Math.trunc(tier) || 1));
  const counts = {
    layers_now: layers.length,
    layers_target: target.length,
    layer_difference: layers.length - target.length,
  };
  const short = -counts.layer_difference;
  counts.summary = short > 0
    ? `${short} layer${short === 1 ? '' : 's'} short of the target: more folding to do.`
    : short < 0
    ? `${-short} layer${-short === -1 ? '' : 's'} more than the target: a fold too many, or the wrong one.`
    : 'Layer count matches the target.';
  const out = {tier: level, tier_meaning: TIER_MEANING[level], ...counts,
               uses_reference_sequence: false};
  if (level === 1) return out;

  const best = bestAlignment(layers, target);
  const depth = Math.min(layers.length, target.length);
  out.alignment = {
    compared_under: best.turned ? 'the target turned over (stack reversed, parities flipped)'
                                : 'a direct rotation/translation of the target',
    layers_matching: Math.max(best.matched, 0),
    layers_compared: depth,
  };
  const parityOnly = best.ranks.length && best.ranks.every(r => r.shape_ok && !r.parity_ok);
  const order = orderingDiagnosis(best.aligned, target, best.transform);
  out.diagnosis = counts.layer_difference !== 0 ? 'layer_count'
    : !best.ranks.length ? 'matches'
    : parityOnly ? 'parity'
    : order ? 'order'
    : 'shape';
  out.diagnosis_meaning = DIAGNOSIS_MEANING[out.diagnosis];
  out.mismatched_ranks = best.ranks.map(r => r.rank);
  if (level === 2) return out;

  out.corrections = best.ranks.slice(0, 12).map(r => ({
    rank: r.rank,
    ...(r.parity_ok ? {} : {parity_now: r.parity_now, parity_target: r.parity_target}),
    fix: !r.shape_ok && order
      ? `this layer's shape belongs at rank ${order[r.rank]}, not ${r.rank}: the pieces are right and the stacking order is not`
      : !r.shape_ok
      ? 'this layer is not the target\'s shape at this rank: an earlier fold took the wrong line or the wrong side'
      : `this layer should face the other way (parity ${r.parity_target}, not ${r.parity_now}): the fold that placed it went over where it should have gone under, or the other side of the line moved`,
  }));
  return out;
}

const TIER_MEANING = {
  1: 'layer counts only',
  2: 'which layers disagree with the target, and in what way',
  3: 'which layers disagree and what each one should be',
};

const DIAGNOSIS_MEANING = {
  matches: 'Every compared layer agrees with the target under one rigid motion.',
  layer_count: 'The stacks are different sizes, so folding is incomplete or overdone; ranks are compared only as deep as the shorter stack.',
  parity: 'Every layer is the right shape in the right place; some face the wrong way. That is an over/under or moving-side choice, not a wrong crease.',
  order: 'The stack holds exactly the target\'s pieces in the wrong order. The folds are right; the sequence that stacked them is not.',
  shape: 'At least one layer is not a shape the target has at that rank, so an earlier fold took a different line or side.',
};
