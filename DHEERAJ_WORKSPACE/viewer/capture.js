// Shared by both viewer pages and the experiment's headless browser.
import * as T from './vendor/three.module.js';

let N = 512;
export function setCaptureSize(size) {
  if (!Number.isInteger(size) || size < 256 || size > 2048) throw Error('Capture size must be 256..2048');
  N = size;
}
function canvas() {
  const c = document.createElement('canvas'); c.width = c.height = N;
  return c;
}
function label(c, text) {
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, N, 32);
  ctx.fillStyle = '#182b38'; ctx.font = '16px sans-serif'; ctx.fillText(text, 12, 22);
  return c.toDataURL('image/png');
}
function fit2(points) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const s = N * .82 / Math.max(x1 - x0, y1 - y0, .001);
  return p => [N / 2 + (p[0] - (x0 + x1) / 2) * s, N * .55 - (p[1] - (y0 + y1) / 2) * s];
}
export function captureCP(cp) {
  const c = canvas(), ctx = c.getContext('2d'), fit = fit2(cp.vertices_coords);
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, N, N);
  cp.edges_vertices.forEach(([a, b], i) => {
    ctx.strokeStyle = ({M: '#c52e3a', V: '#2468d2'})[cp.edges_assignment[i]] || '#263238';
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...fit(cp.vertices_coords[a]));
    ctx.lineTo(...fit(cp.vertices_coords[b])); ctx.stroke();
  });
  return label(c, 'CP · red mountain · blue valley · x right, y up');
}

let renderer;
// Diagram only: separate layers upward in bottom-to-top order without changing
// simulator geometry. Shared fitting preserves each layer's relative size.
function captureExploded(pieces, title) {
  const points = pieces.flatMap(p => p.pts);
  const ys = points.map(p => p[1]), xs = points.map(p => p[0]);
  const span = Math.max(Math.max(...ys) - Math.min(...ys), Math.max(...xs) - Math.min(...xs), .001);
  const shifted = pieces.map((p, rank) => ({...p,
    pts: p.pts.map(v => [v[0] + rank * span * .12, v[1] + rank * span * .65])}));
  const fit = fit2(shifted.flatMap(p => p.pts));
  const c = canvas(), ctx = c.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, N, N);
  shifted.forEach((p, rank) => {
    ctx.beginPath(); p.pts.forEach((v, i) => ctx[i ? 'lineTo' : 'moveTo'](...fit(v)));
    ctx.closePath(); ctx.fillStyle = p.par ? 'rgba(201,155,101,.70)' : 'rgba(240,217,168,.70)';
    ctx.fill(); ctx.strokeStyle = '#344956'; ctx.lineWidth = 1.5; ctx.stroke();
    const anchor = p.pts.reduce((a, b) => b[0] < a[0] ? b : a);
    const [x, y] = fit(anchor);
    ctx.fillStyle = '#182b38'; ctx.font = '12px sans-serif';
    ctx.fillText(`${rank + 1} / p${p.par}`, x, y - 4);
  });
  return label(c, `${title} · exploded · 1 = bottom · p = parity`);
}

export function captureViews(pieces, title = 'State') {
  if (!pieces.length) throw Error('No paper geometry to capture');
  // A separate renderer makes capture independent of playback camera and canvas size.
  renderer ||= new T.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
  renderer.setSize(N, N); renderer.setPixelRatio(1);
  const scene = new T.Scene(); scene.background = new T.Color('white');
  const box = new T.Box3();
  pieces.forEach(p => p.pts.forEach(v => box.expandByPoint(new T.Vector3(...v))));
  const center = box.getCenter(new T.Vector3());
  const size = Math.max(box.getSize(new T.Vector3()).length(), .01);
  const resources = [];
  pieces.forEach((p, rank) => {
    const points = p.pts.map(v => new T.Vector2(v[0], v[1]));
    // Completed states are planar; ShapeUtils also handles concave layer polygons.
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p.pts.flat(), 3));
    g.setIndex(T.ShapeUtils.triangulateShape(points, []).flat()); g.computeVertexNormals();
    const mat = new T.MeshBasicMaterial({color: p.par ? 0xc99b65 : 0xf0d9a8, side: T.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1});
    const mesh = new T.Mesh(g, mat); mesh.renderOrder = rank; scene.add(mesh);
    const edge = new T.BufferGeometry().setFromPoints([...p.pts, p.pts[0]].map(v => new T.Vector3(...v)));
    const ink = new T.LineBasicMaterial({color: 0x344956});
    scene.add(new T.Line(edge, ink)); resources.push(g, mat, edge, ink);
  });
  const result = {};
  try {
    for (const [name, direction] of [['top', [0, 0, 1]], ['oblique', [0.8, -1.4, 1.1]], ['reverse', [-0.8, 1.4, 1.1]]]) {
      const camera = new T.OrthographicCamera(-size * .65, size * .65, size * .65, -size * .65, .001, size * 20);
      camera.up.set(0, name === 'top' ? 1 : 0, name === 'top' ? 0 : 1);
      camera.position.copy(center).add(new T.Vector3(...direction).normalize().multiplyScalar(size * 4));
      camera.lookAt(center); renderer.render(scene, camera);
      const c = canvas(); c.getContext('2d').drawImage(renderer.domElement, 0, 0);
      result[name] = label(c, `${title} · ${name}`);
    }
    // Draw each polygon once: optical density increases with overlapping layers.
    // No depth buffer, no doubled back faces, and no artificial z-gap in this view.
    const c = canvas(), ctx = c.getContext('2d'), fit = fit2(pieces.flatMap(p => p.pts));
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, N, N);
    for (const p of pieces) {
      ctx.beginPath(); p.pts.forEach((v, i) => ctx[i ? 'lineTo' : 'moveTo'](...fit(v)));
      ctx.closePath(); ctx.fillStyle = 'rgba(20, 45, 70, 0.20)'; ctx.fill();
    }
    result.xray = label(c, `${title} · X-ray: darker = more layers`);
    result.exploded = captureExploded(pieces, title);
    return result;
  } finally { resources.forEach(r => r.dispose()); }
}

export function layersToPieces(layers) {
  const gap = .035 / Math.max(6, layers.length);
  return layers.map((l, i) => ({par: l.par, pts: l.poly.map(p => [p[0], p[1], (p[2] || 0) + i * gap])}));
}

export function mountCaptureControls(capture) {
  const bar = document.querySelector('.controls'), gallery = document.createElement('div');
  gallery.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;max-height:300px;overflow:auto';
  document.querySelector('footer').append(gallery);
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  const show = mode => {
    try {
      const images = capture(); gallery.replaceChildren();
      for (const [name, url] of Object.entries(images)) {
        if (mode === 'xray' && name !== 'xray') continue;
        const a = document.createElement('a'), img = document.createElement('img');
        a.href = url; a.download = `fold-${name}.png`; a.title = 'Click to download PNG';
        img.src = url; img.alt = name; img.style.cssText = 'width:220px;max-width:100%';
        a.append(img); gallery.append(a);
      }
      status.textContent = 'Click an image to save its PNG.';
    } catch (e) { status.textContent = e.message; }
  };
  for (const [name, mode] of [['Capture PNG views', 'all'], ['X-ray', 'xray']]) {
    const button = document.createElement('button'); button.textContent = name;
    button.onclick = () => show(mode); bar.append(button);
  }
  bar.append(status);
}
