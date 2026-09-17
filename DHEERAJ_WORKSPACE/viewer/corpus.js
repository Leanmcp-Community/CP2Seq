// Dataset browser: crease pattern on the left, the sequence folding itself on the right.
//
// The folded states are not read out of steps.fold. They are replayed from seq.json with the
// generator's own algebra (workspace/corpus/fold-engine.mjs + geom.mjs): a fold is an angle
// index plus an offset, the moving half is clipped off, reflected by an exact matrix, its
// internal order reversed, and dropped on top (over) or underneath (under). Replaying gives
// every in-between pose the shipped frames cannot: the flap actually swings. steps.fold is
// then used as the check that the replay landed where the dataset says it should.
import * as T from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { ANGLE_DEG, replay, swing, verify, box2 } from './fold-replay.mjs';
import { captureViews, captureCP, layersToPieces, mountCaptureControls } from './capture.js';

const $ = id => document.getElementById(id);

/* ---------- three.js stage ---------- */
const scene = new T.Scene(); scene.background = new T.Color('#f4f3ee');
const camera = new T.PerspectiveCamera(38, 1, .001, 1000); camera.up.set(0, 0, 1);
const renderer = new T.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
$('stage').append(renderer.domElement);
const orbit = new OrbitControls(camera, renderer.domElement); orbit.enableDamping = true;
scene.add(new T.HemisphereLight(0xffffff, 0x536b76, 2.6));
const key = new T.DirectionalLight(0xffffff, 1.9); key.position.set(2, -3, 5); scene.add(key);
const paper = new T.Group(); scene.add(paper);

const FRONT = new T.MeshStandardMaterial({color: 0xf0d9a8, side: T.DoubleSide, roughness: .88,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1});
const BACK = new T.MeshStandardMaterial({color: 0xc9a06a, side: T.DoubleSide, roughness: .88,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1});
const WIRE = new T.LineBasicMaterial({color: 0x42565b});
const front = new T.Mesh(new T.BufferGeometry(), FRONT);
const back = new T.Mesh(new T.BufferGeometry(), BACK);
const wire = new T.LineSegments(new T.BufferGeometry(), WIRE);
paper.add(front, back, wire);

function meshFrom(pieces) {
  const position = [], index = [];
  for (const pts of pieces) {
    const base = position.length / 3;
    for (const p of pts) position.push(p[0], p[1], p[2]);
    for (let i = 1; i + 1 < pts.length; i++) index.push(base, base + i, base + i + 1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(position, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
function wireFrom(pieces) {
  const position = [];
  for (const pts of pieces) for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    position.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(position, 3));
  return g;
}
function show(pieces) {                                  // pieces: [{pts, par}]
  const a = pieces.filter(p => !p.par).map(p => p.pts), b = pieces.filter(p => p.par).map(p => p.pts);
  front.geometry.dispose(); back.geometry.dispose(); wire.geometry.dispose();
  front.geometry = meshFrom(a);
  back.geometry = meshFrom(b);
  wire.geometry = wireFrom(pieces.map(p => p.pts));
}

let sample = null, model = null, check = null, position = 0, playing = false, last = 0, loadToken = 0;
let center = new T.Vector3(), size = 1.6, rows = [], selected = null, lastCpKey = null;

const pause = () => {playing = false; $('play').textContent = 'Play';};
const gap = () => $('layers').checked ? 0.035 / Math.max(6, model?.states.at(-1).length || 6) : 0;

function piecesForState(k) {
  const layers = model.states[k], g = gap();
  return layers.map((lay, i) => ({par: lay.par, pts: lay.poly.map(p => [p[0], p[1], i * g])}));
}
function piecesForStep(k, t) {
  const step = model.steps[k], g = gap(), theta = step.sigma * Math.PI * t;
  const lift = (r0, r1) => (r0 + (r1 - r0) * t) * g;
  const out = [];
  for (const lay of step.stay) {
    const z = lift(lay.r0, lay.r1);
    out.push({par: lay.par, pts: lay.poly.map(p => [p[0], p[1], z])});
  }
  for (const lay of step.move) {
    const z = lift(lay.r0, lay.r1);
    out.push({par: lay.par0, pts: lay.pre.map(p => {const q = swing(p, step.uv, theta); return [q[0], q[1], q[2] + z];})});
  }
  return out;
}

function resetCamera() {
  camera.position.copy(center).add(new T.Vector3(size * .55, -size * 1.25, size * 1.25));
  orbit.target.copy(center);
  camera.near = size / 1000; camera.far = size * 100;
  camera.updateProjectionMatrix(); orbit.update();
}
function fit() {
  const b = new T.Box3();
  for (const lay of model.states[0]) for (const p of lay.poly) b.expandByPoint(new T.Vector3(p[0], p[1], 0));
  b.getCenter(center);
  size = Math.max(b.getSize(new T.Vector3()).length(), .01);
  resetCamera();
}

/* ---------- crease pattern ---------- */
function cpSvg(cp, doneSteps, activeStep) {
  if (!cp?.vertices_coords?.length) return '<p>This sample ships no cp.fold.</p>';
  const [x0, y0, x1, y1] = box2(cp.vertices_coords);
  const w = (x1 - x0) || 1, h = (y1 - y0) || 1, s = Math.max(w, h), m = s * .07;
  const vb = [x0 - (s - w) / 2 - m, y0 - (s - h) / 2 - m, s + 2 * m, s + 2 * m];
  const sw = vb[2] * .007;
  const parts = [`<svg viewBox="${vb.join(' ')}" role="img" aria-label="crease pattern">`,
    `<g transform="translate(0,${2 * vb[1] + vb[3]}) scale(1,-1)">`];
  const line = (A, B, color, width, dash, opacity) =>
    `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="${color}" stroke-width="${width}"` +
    `${dash ? ` stroke-dasharray="${sw * 4} ${sw * 3}"` : ''} stroke-opacity="${opacity}" stroke-linecap="round"/>`;
  cp.edges_vertices.forEach(([u, v], i) => {
    const a = cp.edges_assignment?.[i], A = cp.vertices_coords[u], B = cp.vertices_coords[v];
    if (!A || !B) return;
    if (a === 'B') parts.push(line(A, B, '#9aa0a6', sw, false, 1));
    else if (a === 'M' || a === 'V') parts.push(line(A, B, '#9aa0a6', sw, a === 'V', .28));
  });
  for (const step of doneSteps) for (const c of (step.creases || [])) {
    parts.push(line(c.P, c.Q, c.assignment === 'V' ? '#2f5fa8' : '#b8402b', sw * 1.2, c.assignment === 'V', .95));
  }
  for (const c of (activeStep?.creases || [])) parts.push(line(c.P, c.Q, '#1c6b5b', sw * 2.1, false, 1));
  return parts.join('') + '</g></svg>';
}

/* ---------- drawing one playback position ---------- */
function draw() {
  if (!model) return;
  const total = model.steps.length;
  const k = Math.min(Math.floor(position), total), frac = position - k;
  const animating = frac > 0 && k < total;
  const t = animating ? frac * frac * (3 - 2 * frac) : 0;
  show(animating ? piecesForStep(k, t) : piecesForState(k));
  $('empty').hidden = true;

  const folds = sample.seq?.folds || [];
  const activeIndex = animating ? k : k - 1;
  const active = folds[activeIndex] || null;
  // The pattern only changes when the highlighted fold does, so it is not rebuilt per frame.
  const cpKey = `${activeIndex}:${animating}`;
  if (cpKey !== lastCpKey) {
    lastCpKey = cpKey;
    $('cp').innerHTML = cpSvg(sample.cp, folds.slice(0, k), active);
  }
  const stack = animating ? model.states[k + 1].length : model.states[k].length;
  $('event').textContent = active
    ? `Fold ${activeIndex + 1} of ${total} · ${animating ? 'folding' : 'done'} · ${ANGLE_DEG[active.angle_index] ?? active.angle_deg}° line, offset ${active.offset}` +
      ` · ${active.over ? 'over' : 'under'} · creases ${active.creases_created ?? active.creases?.length ?? '—'}` +
      ` · layers ${active.layers_before} → ${active.layers_after}`
    : `Flat sheet · ${total} folds ahead`;
  $('cp-note').textContent = active
    ? `Green marks the creases this fold makes in the flat sheet: ${active.creases_created ?? active.creases?.length ?? 0} of them, `
      + `because the line cuts ${active.creases_created ?? 0} layer${(active.creases_created ?? 0) === 1 ? '' : 's'} at once.`
    : 'The full pattern is faint. Creases light up as the sequence makes them.';
  $('position').textContent = `${Math.min(activeIndex + 1, total)} / ${total} folds · ${stack} layers`;
  $('timeline').value = position;
}

/* ---------- loading ---------- */
function showError(message) {
  $('load-error').hidden = !message;
  $('load-error').textContent = message || '';
}
async function api(path) {
  const response = await fetch(path, {cache: 'no-store', signal: AbortSignal.timeout(30000)});
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw Error('Start viewer/server.py, then open http://127.0.0.1:8000/corpus.');
  const data = await response.json();
  if (!response.ok) throw Error(data.error || `Request failed (${response.status})`);
  return data;
}
function summarise(row) {
  const m = sample.meta?.metrics || {};
  const flags = Object.entries(m.flags || {}).filter(([, on]) => on).map(([name]) => name);
  const lines = [
    `${sample.meta?.id || row.id} · ${row.tier} · ${row.band}`,
    `${model.steps.length} folds · ${m.crease_edges ?? row.creases ?? '—'} crease edges · ${m.layers_final ?? row.layers ?? '—'} layers`,
    `coupling max ${m.coupling_max ?? '—'} · mean ${m.coupling_mean ?? '—'} · ${m.distinct_angles ?? '—'} angles used`,
    `seed ${sample.meta?.seed ?? '—'} · cp hash ${sample.meta?.cp_hash ?? '—'}`,
    `replay check on disk: ${row.replay ?? 'not recorded'}${row.shorter ? ` · a ${row.shorter}-fold solution exists` : ''}`,
    flags.length ? `flags: ${flags.join(', ')}` : 'flags: none',
    check.text,
  ];
  $('summary').innerHTML = lines.map(l => `<div>${l.replace(/[<&]/g, c => c === '<' ? '&lt;' : '&amp;')}</div>`).join('');
  $('summary').className = check.ok === false ? 'warn' : '';
}
async function loadSample(row) {
  const token = ++loadToken;
  pause(); showError('');
  selected = row.dir;
  for (const button of $('samples').children) button.setAttribute('aria-selected', String(button.dataset.dir === row.dir));
  $('empty').hidden = false; $('empty').textContent = 'Loading ' + row.id + '…';
  $('summary').textContent = 'Loading ' + row.dir;
  try {
    const data = await api('/api/corpus/sample?dir=' + encodeURIComponent(row.dir));
    if (token !== loadToken) return;
    if (!data.seq?.folds) throw Error('seq.json has no folds array.');
    sample = data;
    model = replay(data.seq);
    check = verify(model, data.steps);
    position = 0;
    lastCpKey = null;
    $('timeline').max = model.steps.length;
    $('timeline').value = 0;
    fit();
    draw();
    summarise(row);
  } catch (error) {
    if (token !== loadToken) return;
    model = null; sample = null;
    $('summary').textContent = 'Sample could not be loaded';
    $('empty').hidden = false; $('empty').textContent = error.message;
    showError(error.message);
  }
}

let all = [];
function renderList() {
  const text = $('search').value.trim().toLowerCase();
  const tier = $('tier').value, band = $('band').value;
  rows = all.filter(r => (!tier || r.tier === tier) && (!band || r.band === band) &&
    (!text || r.id.toLowerCase().includes(text) || r.dir.toLowerCase().includes(text)));
  const box = $('samples');
  box.replaceChildren();
  if (!rows.length) {
    const none = document.createElement('p'); none.className = 'none';
    none.textContent = 'No sample matches that filter.';
    box.append(none);
    return;
  }
  for (const row of rows) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.dir = row.dir;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(row.dir === selected));
    button.innerHTML = `<span class="sid">${row.id}</span><span class="sm">${row.folds ?? '?'} folds · ${row.layers ?? '?'}L${row.replay === 'FAIL' ? ' · replay FAIL' : ''}</span>`;
    button.onclick = () => loadSample(row);
    box.append(button);
  }
}
function fillFilters() {
  for (const [id, key] of [['tier', 'tier'], ['band', 'band']]) {
    const values = [...new Set(all.map(r => r[key]))].sort();
    const select = $(id), keep = select.value;
    select.replaceChildren();
    const any = document.createElement('option');
    any.value = ''; any.textContent = id === 'tier' ? 'all tiers' : 'all bands';
    select.append(any);
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value; option.textContent = value;
      select.append(option);
    }
    if (values.includes(keep)) select.value = keep;
  }
}
async function loadIndex(reload = true) {
  $('refresh').disabled = true;
  showError('');
  try {
    const listing = await api('/api/corpus');
    all = listing.samples;
    $('connection').textContent = `${all.length} samples · ${listing.root} · from ${listing.source}` +
      (listing.truncated ? ' · listing capped' : '');
    if (listing.errors?.length) $('connection').textContent += ` · ${listing.errors.length} entries skipped`;
    fillFilters();
    renderList();
    $('count').textContent = `${rows.length} shown`;
    if (!all.length) {
      $('empty').hidden = false;
      $('empty').textContent = 'No samples under the dataset folder. Start the server with --corpus <folder>.';
      $('summary').textContent = 'Dataset folder is empty or missing.';
      if (listing.errors?.length) showError(listing.errors[0]);
      return;
    }
    if (reload || !model) await loadSample(rows[0] || all[0]);
  } catch (error) {
    $('connection').textContent = 'Dataset index unavailable';
    showError(error.message);
    $('empty').hidden = false; $('empty').textContent = error.message;
  } finally {
    $('refresh').disabled = false;
  }
}

/* ---------- controls ---------- */
$('play').onclick = () => {
  if (!model || !model.steps.length) return;
  if (playing) return pause();
  if (position >= model.steps.length) position = 0;
  playing = true; $('play').textContent = 'Pause';
};
$('prev').onclick = () => {pause(); position = Math.max(0, Math.ceil(position) - 1); draw();};
$('next').onclick = () => {
  if (!model) return;
  pause(); position = Math.min(model.steps.length, Math.floor(position) + 1); draw();
};
$('timeline').oninput = e => {pause(); position = Number(e.target.value); draw();};
$('reset').onclick = resetCamera;
$('layers').onchange = draw;
$('refresh').onclick = () => loadIndex(false);
for (const id of ['search', 'tier', 'band']) {
  $(id).oninput = () => {renderList(); $('count').textContent = `${rows.length} shown`;};
}

new ResizeObserver(() => {
  const w = $('stage').clientWidth, h = $('stage').clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}).observe($('stage'));

resetCamera();
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, .1); last = now;
  if (playing && model) {
    position = Math.min(model.steps.length, position + dt * Number($('speed').value));
    draw();
    if (position >= model.steps.length) {
      if ($('loop').checked) position = 0; else pause();
    }
  }
  orbit.update();
  renderer.render(scene, camera);
});
// Completed sequence states, including step zero; capturing does not move playback.
window.captureFoldStep = (step = Math.floor(position)) => {
  pause();
  if (!model || !Number.isInteger(step) || step < 0 || step >= model.states.length) throw Error('Select a valid fold step first');
  return {cp: captureCP(sample.cp), ...captureViews(layersToPieces(model.states[step]), `Step ${step}`)};
};
mountCaptureControls(() => window.captureFoldStep());
loadIndex();
