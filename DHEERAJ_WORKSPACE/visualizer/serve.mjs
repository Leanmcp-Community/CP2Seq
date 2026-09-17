// Read-only dataset server. Run from any directory with Node; no dependencies.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const roots = ['workspace/corpus/out', 'workspace/corpus/failures-snapshot',
  'DHEERAJ_WORKSPACE/data', 'DHEERAJ_WORKSPACE/experiments', 'DHEERAJ_WORKSPACE/exports'];
const exists = async p => fs.access(p).then(() => true, () => false);
const json = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const relative = p => path.relative(root, p).split(path.sep).join('/');

async function catalog() {
  const samples = [], warnings = [];
  async function walk(dir) {
    if (!await exists(dir)) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const names = new Set(entries.filter(e => e.isFile()).map(e => e.name));
    const base = relative(dir);
    if (names.has('cp.fold') && names.has('steps.fold')) {
      samples.push({ id: base, name: path.basename(dir), set: relative(path.dirname(dir)).replace(/\/samples$/, ''),
        kind: 'generated', cp: `${base}/cp.fold`, sequence: `${base}/steps.fold`,
        actions: names.has('seq.json') ? `${base}/seq.json` : null,
        meta: names.has('meta.json') ? `${base}/meta.json` : null });
      return;
    }
    if (names.has('result.json')) {
      try {
        const result = await json(path.join(dir, 'result.json'));
        samples.push({ id: base, name: base.split('/').slice(-3).join(' / '),
          set: base.split('/').slice(0, 3).join('/'), kind: 'run', status: result.status,
          sequence: names.has('sequence.fold') ? `${base}/sequence.fold` : null,
          actions: `${base}/result.json` });
      } catch (e) { warnings.push(`${base}: ${e.message}`); }
      return;
    }
    for (const e of entries) if (e.isDirectory()) await walk(path.join(dir, e.name));
  }
  for (const dir of roots) await walk(path.join(root, dir));
  const pureland = path.join(root, 'DHEERAJ_WORKSPACE/data/pureland/seq');
  if (await exists(pureland)) {
    for (const e of await fs.readdir(pureland, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const dir = path.join(pureland, e.name), base = relative(dir);
      const names = await fs.readdir(dir);
      const steps = names.filter(n => /^step_\d+\.fold$/.test(n)).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
      if (!steps.length) continue;
      const viz = `DHEERAJ_WORKSPACE/data/pureland/viz/${e.name}.json`;
      samples.push({ id: base, name: e.name, set: 'Pureland reference sequences', kind: 'pureland',
        viz: await exists(path.join(root, viz)) ? viz : null,
        steps: steps.map(n => ({ fold: `${base}/${n}`, image: names.includes(n.replace('.fold','.jpg')) ? `${base}/${n.replace('.fold','.jpg')}` : null })) });
    }
  }
  return { samples: samples.sort((a,b) => a.set.localeCompare(b.set) || a.name.localeCompare(b.name, undefined, {numeric:true})), warnings };
}

const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.fold':'application/json', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/catalog') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(await catalog())); return;
    }
    const requested = decodeURIComponent(url.pathname);
    const file = requested.startsWith('/files/') ? path.resolve(root, requested.slice(7))
      : path.resolve(here, '.' + (requested === '/' ? '/index.html' : requested));
    const allowed = requested.startsWith('/files/') ? roots.map(p => path.join(root,p)) : [here];
    const real = await fs.realpath(file);
    if (!allowed.some(p => real.startsWith(p + path.sep)) || !mime[path.extname(real)]) {
      res.writeHead(403).end('Forbidden'); return;
    }
    const data = await fs.readFile(real);
    res.writeHead(200, { 'Content-Type': mime[path.extname(real)], 'Cache-Control':'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (e) { res.writeHead(e.code === 'ENOENT' ? 404 : 500).end(e.message); }
});
const port = Number(process.env.PORT || 8080);
server.listen(port, '127.0.0.1', () => console.log(`Dataset viewer: http://127.0.0.1:${port}`));
