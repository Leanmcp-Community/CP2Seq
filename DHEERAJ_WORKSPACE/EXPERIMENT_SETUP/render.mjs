// Dependency-free PNG diagram: fixed CP + current top view + exploded oblique view.
import { deflateSync } from 'node:zlib';
export const WIDTH = 960, HEIGHT = 384;
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
export function render(cp, layers) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3, 250);
  function dot(x, y, color) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
    const i = (y * WIDTH + x) * 3;
    pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2];
  }
  function line(a, b, color, width = 1) {
    const count = Math.ceil(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])));
    for (let i = 0; i <= count; i++) {
      const t = count ? i / count : 0;
      for (let k = 0; k < width; k++) dot(a[0] + t * (b[0] - a[0]) + k, a[1] + t * (b[1] - a[1]), color);
    }
  }
  function polygon(poly, color) {
    const ymin = Math.max(0, Math.floor(Math.min(...poly.map(p => p[1]))));
    const ymax = Math.min(HEIGHT - 1, Math.ceil(Math.max(...poly.map(p => p[1]))));
    for (let y = ymin; y <= ymax; y++) {
      const xs = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) dot(x, y, color);
      }
    }
    poly.forEach((a, i) => line(a, poly[(i + 1) % poly.length], [35, 45, 60]));
  }
  function fit(points, panel) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const lo = [Math.min(...xs), Math.min(...ys)], hi = [Math.max(...xs), Math.max(...ys)];
    const scale = Math.min(270 / Math.max(hi[0] - lo[0], 0.01), 310 / Math.max(hi[1] - lo[1], 0.01));
    return p => [panel * 320 + 160 + (p[0] - (lo[0] + hi[0]) / 2) * scale,
      HEIGHT / 2 - (p[1] - (lo[1] + hi[1]) / 2) * scale];
  }
  const cpFit = fit(cp.vertices_coords, 0);
  cp.edges_vertices.forEach(([a, b], i) => line(cpFit(cp.vertices_coords[a]), cpFit(cp.vertices_coords[b]),
    cp.edges_assignment[i] === 'M' ? [205, 40, 50] : cp.edges_assignment[i] === 'V' ? [25, 90, 215] : [20, 20, 20], 2));
  const topFit = fit(layers.flatMap(l => l.poly), 1);
  layers.forEach(l => polygon(l.poly.map(topFit), l.par ? [242, 207, 159] : [182, 222, 241]));
  const oblique = layers.map((l, i) => l.poly.map(([x, y]) => [x - y * 0.45, y * 0.58 + i * 0.025]));
  const obliqueFit = fit(oblique.flat(), 2);
  oblique.forEach((poly, i) => polygon(poly.map(obliqueFit), layers[i].par ? [242, 207, 159] : [182, 222, 241]));
  line([320, 0], [320, HEIGHT - 1], [200, 200, 200]);
  line([640, 0], [640, HEIGHT - 1], [200, 200, 200]);
  const scanlines = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) pixels.copy(scanlines, y * (WIDTH * 3 + 1) + 1, y * WIDTH * 3, (y + 1) * WIDTH * 3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH); header.writeUInt32BE(HEIGHT, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}
