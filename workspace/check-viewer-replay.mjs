// Does the viewer's replay agree with the dataset it is showing?
//
// The dataset browser (DHEERAJ_WORKSPACE/viewer/corpus.html) does not read the folded frames
// out of steps.fold; it replays seq.json so the paper can move between states. This checks that
// replay against every shipped steps.fold: same number of states, same layer count at every
// step, and the same polygons at the end. Read-only.
//
//   node workspace/check-viewer-replay.mjs [releaseDir]
//
// releaseDir defaults to workspace/corpus/out/release.
import { readFile, readdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replay } from "../DHEERAJ_WORKSPACE/viewer/fold-replay.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.argv[2] ?? join(HERE, "corpus", "out", "release"));
const TOL = 1e-9;

async function sampleDirs(root) {
  const index = await readFile(join(root, "index.json"), "utf8").then(JSON.parse).catch(() => null);
  if (index?.samples?.length) return index.samples.map(s => s.dir);
  const out = [];
  const walk = async (dir, depth) => {
    if (depth > 6) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const here = join(dir, entry.name);
      const files = await readdir(here);
      if (files.includes("seq.json") && files.includes("steps.fold")) out.push(here.slice(root.length + 1));
      else await walk(here, depth + 1);
    }
  };
  await walk(root, 0);
  return out;
}

// Layers are one convex polygon each, so two states match when their sorted vertex lists do.
const fingerprint = (polys) => polys
  .map(poly => poly.map(p => `${p[0].toFixed(9)},${p[1].toFixed(9)}`).sort().join(" "))
  .sort().join(" | ");

function facesOf(frame) {
  return (frame.faces_vertices ?? []).map(face => face.map(v => frame.vertices_coords[v]));
}

function compare(states, frames) {
  if (frames.length !== states.length) return `state count ${states.length} vs steps.fold ${frames.length}`;
  for (let i = 0; i < frames.length; i++) {
    const shipped = facesOf(frames[i]);
    if (shipped.length !== states[i].length) {
      return `step ${i}: ${states[i].length} layers replayed, ${shipped.length} in steps.fold`;
    }
  }
  const mine = fingerprint(states.at(-1).map(l => l.poly));
  const theirs = fingerprint(facesOf(frames.at(-1)));
  if (mine !== theirs) {
    const a = states.at(-1).flatMap(l => l.poly), b = facesOf(frames.at(-1)).flat();
    const bb = (pts) => [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])),
                         Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
    const [p, q] = [bb(a), bb(b)];
    const slip = Math.max(...p.map((v, i) => Math.abs(v - q[i])));
    if (slip > TOL) return `final silhouette differs by ${slip.toExponential(2)}`;
    return `final polygons differ (silhouette agrees to ${slip.toExponential(2)}: vertex order only)`;
  }
  return null;
}

const dirs = await sampleDirs(ROOT);
console.log(`${dirs.length} samples under ${ROOT}`);
let ok = 0;
const bad = [];
for (const dir of dirs) {
  try {
    const [seq, steps] = await Promise.all([
      readFile(join(ROOT, dir, "seq.json"), "utf8").then(JSON.parse),
      readFile(join(ROOT, dir, "steps.fold"), "utf8").then(JSON.parse),
    ]);
    const why = compare(replay(seq).states, steps.file_frames ?? []);
    if (why) bad.push(`${dir}: ${why}`); else ok++;
  } catch (error) {
    bad.push(`${dir}: ${error.message}`);
  }
}
console.log(`${ok} match, ${bad.length} differ`);
for (const line of bad.slice(0, 25)) console.log("  " + line);
if (bad.length > 25) console.log(`  … and ${bad.length - 25} more`);
process.exit(bad.length ? 1 : 0);
