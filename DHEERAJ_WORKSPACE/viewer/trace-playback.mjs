// Saved-turn playback only. No simulation, model requests, or artifact writes.
export const EDIT_ACTIONS = new Set(['add_fold', 'remove_fold', 'go_to_step', 'restore_revision']);

export function artifactRelative(run, info) {
  let path = typeof info === 'string' ? info : info?.path || info?.image_path;
  if (!path) return null;
  if (path.startsWith(run.directory + '/')) path = path.slice(run.directory.length + 1);
  else if (path.includes(run.id + '/')) path = path.slice(path.lastIndexOf(run.id + '/') + run.id.length + 1);
  return path.startsWith('/') ? null : path;
}

export function namedViews(manifest, prefix = '') {
  return Object.fromEntries(Object.entries(manifest || {})
    .filter(([name]) => name.startsWith(prefix))
    .map(([name, value]) => [name.slice(prefix.length), value]));
}

export function frameLayers(frame) {
  if (!frame?.faces_vertices || !frame?.vertices_coords) return [];
  return frame.faces_vertices.map((face, i) => ({polygon: face.map(v => frame.vertices_coords[v]),
    parity: frame['fo:faces_parity']?.[i] ?? 0, rank: frame['fo:faces_layer']?.[i] ?? i}))
    .sort((a, b) => a.rank - b.rank);
}

export function sheetLayers(cp) {
  if (!cp?.edges_vertices || !cp?.vertices_coords) return [];
  const edges = cp.edges_vertices.filter((_, i) => cp.edges_assignment?.[i] === 'B');
  if (!edges.length) return [];
  const loop = [edges[0][0]], remaining = edges.map(e => [...e]);
  while (remaining.length) {
    const last = loop.at(-1), at = remaining.findIndex(e => e.includes(last));
    if (at < 0) return [];
    const [a, b] = remaining.splice(at, 1)[0], next = a === last ? b : a;
    if (next === loop[0]) return remaining.length ? [] : [{polygon: loop.map(v => cp.vertices_coords[v]), parity: 0}];
    loop.push(next);
  }
  return [];
}

export function normalizeAction(record) {
  const action = record?.action ?? record?.call;
  if (!action) return null;
  const fn = action.function ?? action;
  let args = fn.arguments ?? {};
  if (typeof args === 'string') { try { args = JSON.parse(args); } catch {} }
  return {name: fn.name, arguments: args};
}

export function buildTimeline(initial, records) {
  let images = namedViews(initial.manifest, 'initial-'), layers = sheetLayers(initial.cp), step = 0;
  const frames = [{turn: 0, phase: 'initial', label: 'Initial sheet', images, layers, step}];
  for (const {turn, tool, feedback} of records) {
    const action = normalizeAction(tool), result = tool?.result ?? (tool?.ok !== undefined ? tool : null);
    const before = {images, layers, step};
    frames.push({turn, phase: 'thinking', label: `Turn ${turn} · Thinking`, ...before});
    frames.push({turn, phase: 'action', label: `Turn ${turn} · Tool call`, ...before, action});
    if (result?.ok && EDIT_ACTIONS.has(action?.name)) {
      layers = result.layers_bottom_to_top ?? [];
      step = result.state_id ?? step;
      // Never carry an obsolete screenshot across an accepted state change.
      images = feedback ?? result.image_artifacts ?? {};
    } else if (result?.ok && action?.name === 'get_images' && result.image_step === result.state_id) {
      images = feedback ?? result.image_artifacts ?? images;
    }
    frames.push({turn, phase: 'result', label: `Turn ${turn} · ${result ? result.ok ? 'Result' : 'Rejected' : 'Waiting for result'}`,
      images, layers, step, action, result, record: tool});
  }
  return frames;
}

export async function loadSequence(read, sample) {
  const [manifest, cp, target] = await Promise.all([
    read(`${sample.id}/initial/images.json`), read(`${sample.id}/cp.fold`), read(`${sample.id}/target.fold`)]);
  const records = new Array(sample.turns.length);
  let cursor = 0;
  // Bound concurrent artifact reads for large experiments.
  await Promise.all(Array.from({length: Math.min(4, sample.turns.length)}, async () => {
    while (cursor < sample.turns.length) {
      const i = cursor++, turn = sample.turns[i], prefix = `${sample.id}/turn-${String(turn).padStart(3, '0')}`;
      const [tool, feedback] = sample.layout === 'codex'
        ? await Promise.all([read(`${prefix}/tool.json`), read(`${prefix}/feedback-images.json`)])
        : [await read(`${prefix}-tool.json`), null];
      records[i] = {turn, tool, feedback};
    }
  }));
  return {frames: buildTimeline({manifest, cp}, records), target: frameLayers(target),
    targetImages: namedViews(manifest, 'target-')};
}

// Geometry fallback for older runs without a saved exploded PNG. This diagram
// uses the recorded state, so missing images never require rerunning a model.
export function drawLayers(canvas, layers, view) {
  const ctx = canvas.getContext('2d'), width = canvas.width = 800, height = canvas.height = 560;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  if (!layers.length) return;
  const points = layers.flatMap(l => l.polygon);
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), .001);
  const projected = layers.map((l, i) => ({...l, polygon: l.polygon.map(([x, y]) => {
    if (view === 'exploded') return [x + i * span * .12, y + i * span * .65];
    if (view === 'oblique' || view === 'reverse') {
      const sign = view === 'reverse' ? -1 : 1;
      return [sign * (x - y) * .707, sign * (x + y) * .4 + i * span * .02];
    }
    return [x, y];
  })}));
  const all = projected.flatMap(l => l.polygon), xx = all.map(p => p[0]), yy = all.map(p => p[1]);
  const x0 = Math.min(...xx), x1 = Math.max(...xx), y0 = Math.min(...yy), y1 = Math.max(...yy);
  const scale = Math.min((width - 90) / Math.max(x1 - x0, .001), (height - 65) / Math.max(y1 - y0, .001));
  const fit = ([x, y]) => [width / 2 + (x - (x0 + x1) / 2) * scale, height / 2 - (y - (y0 + y1) / 2) * scale];
  projected.forEach((l, i) => {
    ctx.beginPath(); l.polygon.forEach((p, j) => ctx[j ? 'lineTo' : 'moveTo'](...fit(p))); ctx.closePath();
    ctx.fillStyle = l.highlight || (view === 'xray' ? 'rgba(20,45,70,.20)' : l.parity ? '#c99b65' : '#f0d9a8');
    if (view === 'exploded') ctx.globalAlpha = .75;
    ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = '#344956'; ctx.lineWidth = 1.5; ctx.stroke();
    if (view === 'exploded') {
      const [x, y] = fit(l.polygon.reduce((a, b) => a[0] < b[0] ? a : b));
      ctx.fillStyle = '#182b38'; ctx.font = '16px sans-serif'; ctx.fillText(`${i + 1} / p${l.parity}`, x, y - 5);
    }
  });
}
