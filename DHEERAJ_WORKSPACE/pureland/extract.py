"""Unpack PurelandFold's parquet into per-sequence files the rest of the tooling can read.

  python3 DHEERAJ_WORKSPACE/pureland/extract.py

Writes to DHEERAJ_WORKSPACE/data/pureland/:
  seq/<name>/step_NN.fold        the cp.fold for that keyframe (unfolded CP + fold angles + faceOrders)
  seq/<name>/step_NN.ff.json     the flat_folder compile output (Vf = FOLDED coords, Ff, faceOrders)
  seq/<name>/step_NN.jpg         the real photo
  seq/<name>/step_NN.svg         the rendered crease pattern
  viz/<name>.json                folded geometry + layer depth per step, for the 3D viewer
  index.json                     sequence -> step count

WHERE THE SEQUENCE LIVES (the question this script exists to answer):
  NOT inside any .fold file. Every cp.fold is a STATE -- a snapshot of the paper at one
  keyframe -- and contains no action, step or ordering field. The sequence is carried
  RELATIONALLY by the parquet's own (sequence, step) columns: 337 rows = 27 sequences x 5-21
  keyframes, ordered by `step`. To get a sequence of ACTIONS you have to diff consecutive
  states; the dataset never states the action itself.
"""
import json, os, sys, collections
import pyarrow.parquet as pq

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "pureland")
OUT = os.path.join(DATA, "seq")
VIZ = os.path.join(DATA, "viz")

t = pq.read_table(os.path.join(DATA, "train.parquet")).to_pydict()
rows = sorted(
    zip(t["sequence"], t["step"], t["cp.fold"], t["flat_folder"], t["cp.svg"], t["image"]),
    key=lambda r: (r[0], r[1]),
)

os.makedirs(OUT, exist_ok=True)
os.makedirs(VIZ, exist_ok=True)

by_seq = collections.defaultdict(list)
for seq, step, cf, ff, svg, img in rows:
    by_seq[seq].append((step, cf, ff, svg, img))

index = {}
for seq, items in sorted(by_seq.items()):
    d = os.path.join(OUT, seq)
    os.makedirs(d, exist_ok=True)
    viz_steps = []
    for step, cf, ff, svg, img in items:
        base = os.path.join(d, f"step_{step:02d}")
        with open(base + ".fold", "w") as fh:
            fh.write(cf)
        with open(base + ".ff.json", "w") as fh:
            fh.write(ff)
        if svg:
            with open(base + ".svg", "w") as fh:
                fh.write(svg)
        if img and img.get("bytes"):
            with open(base + ".jpg", "wb") as fh:
                fh.write(img["bytes"])

        fold = json.loads(cf)
        ffd = json.loads(ff)

        # The viewer needs the FOLDED geometry, which lives in flat_folder, not cp.fold:
        #   Vf  folded vertex coordinates (cp.fold's vertices_coords are the UNFOLDED sheet)
        #   Ff  per-face flip flag in the folded state
        #   faceOrders  triples [a, b, s]: s=1 means face a is above face b where they overlap
        # Layer depth per face is derived from faceOrders: how many faces sit below it. That
        # is what the X-ray shading reads -- more paper underneath => darker.
        faces = fold.get("faces_vertices") or []
        fo = ffd.get("faceOrders") or fold.get("faceOrders") or []
        below = collections.Counter()
        for tri in fo:
            if len(tri) != 3:
                continue
            a, b, s = tri
            if s == 1:
                below[a] += 1          # a is above b  => one sheet under a
            elif s == -1:
                below[b] += 1
        viz_steps.append({
            "step": step,
            "Vf": ffd.get("Vf") or [],
            "faces": faces,
            "Ff": ffd.get("Ff") or [],
            "depth": [below.get(i, 0) for i in range(len(faces))],
            "maxDepth": max([below.get(i, 0) for i in range(len(faces))], default=0),
            "V": fold.get("vertices_coords") or [],
            "EV": fold.get("edges_vertices") or [],
            "EA": fold.get("edges_assignment") or [],
            "nFaceOrders": len(fo),
            "compiled": ffd.get("compilation_success"),
        })

    with open(os.path.join(VIZ, f"{seq}.json"), "w") as fh:
        json.dump({"sequence": seq, "steps": viz_steps}, fh)
    index[seq] = len(items)
    print(f"{seq:20s} {len(items):3d} steps")

with open(os.path.join(DATA, "index.json"), "w") as fh:
    json.dump(index, fh, indent=1)

print(f"\n{len(index)} sequences, {sum(index.values())} keyframes -> {OUT}")
print(f"viewer payloads -> {VIZ}")
