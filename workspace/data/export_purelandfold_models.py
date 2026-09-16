"""Export PurelandFold's 27 real sequences as something we can actually look at.

Run:  python workspace/data/export_purelandfold_models.py
Needs: pip install datasets pillow
Out:  workspace/purelandfold/models/<sequence>/
          step-NN.png      the rendered frame
          step-NN.fold     the crease pattern at that step
          info.json        name, step count, per-step flat_folder stats

WHY THIS EXISTS. The synthetic corpus gives controlled difficulty and scale, but every sample
is an unnamed random pattern -- you cannot look at one and say what it is. That is fine for
scoring and useless for a figure, and it leaves the corpus with no recognisable anchor.

PurelandFold is where the recognisable anchor already lives: 27 sequences folded by people,
WITH names and rendered images, inside the frozen action space. It has been listed as the
"reality anchor" in the plan since the start and never actually opened.

This also clears two open questions that have been sitting in DATASET.md section 2:
  * whether the frame format converts to the per-step .fold the simulator expects
  * what the 74 skipped rows (variables=0) are -- 27 are step-1 rows, ~47 are unexplained,
    and the guess on record is that they are pre-crease steps, which matters because
    pre-creases are OUTSIDE the frozen action space and would have to be dropped or merged.
"""
import io
import json
import os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
CACHE = os.path.join(ROOT, "workspace", "purelandfold")
OUT = os.path.join(CACHE, "models")

os.environ.setdefault("HF_HOME", CACHE)
from datasets import load_dataset

def merge_precrease(steps):
    """Fold pre-crease frames into the step that follows them. (Decided 2026-09-16.)

    Pre-creasing is outside the frozen action space, so those frames cannot stand as steps of
    their own. MERGE rather than DROP: a pre-crease exists to set up the fold that comes next,
    so dropping it leaves the two neighbouring states geometrically inconsistent, while merging
    keeps the sequence continuous and simply charges the preparation to the step it serves.

    Trailing pre-crease frames have no following step, so they attach to the previous one --
    stated here because it is the one case the rule as worded does not cover.

    Returns (merged, effective_step_count), where each merged entry names the frames it absorbed
    so nothing is silently discarded.
    """
    merged, pending = [], []
    for s in steps:
        if s["looks_like_precrease"]:
            pending.append(s["step"])
            continue
        merged.append({"step": s["step"], "absorbed": pending,
                       "variables": s["variables"], "faces": s["faces"]})
        pending = []
    if pending:
        if merged:
            merged[-1]["absorbed"] = merged[-1]["absorbed"] + pending
            merged[-1]["absorbed_trailing"] = True
        else:                                   # a sequence that is nothing but pre-creases
            merged.append({"step": pending[-1], "absorbed": pending[:-1],
                           "variables": 0, "faces": 0, "all_precrease": True})
    return merged, len(merged)


ds = load_dataset("mayaweiz/PurelandFold", split="train")
print(f"rows: {len(ds)}   columns: {ds.column_names}\n")

rows_by_seq = defaultdict(list)
for r in ds:
    rows_by_seq[r["sequence"]].append(r)

os.makedirs(OUT, exist_ok=True)
summary = []

for name, rows in sorted(rows_by_seq.items()):
    rows.sort(key=lambda r: r["step"])
    safe = "".join(c if (c.isalnum() or c in "-_") else "_" for c in name)
    d = os.path.join(OUT, safe)
    os.makedirs(d, exist_ok=True)

    steps, skipped = [], 0
    for r in rows:
        tag = f"step-{r['step']:02d}"

        img = r.get("image")
        if img is not None:
            img.save(os.path.join(d, tag + ".png"))

        if r.get("cp.fold"):
            with open(os.path.join(d, tag + ".fold"), "w") as f:
                f.write(r["cp.fold"])

        # flat_folder carries the constraint counts -- the same quantity used as the
        # non-local-dependency proxy on the instagram corpus, so it is directly comparable
        ff = {}
        if r.get("flat_folder"):
            try:
                ff = json.loads(r["flat_folder"])
            except Exception:
                ff = {}
        # `transitivity` sits at the top level but `variables` and `faces` live under
        # `counts` -- reading them from the top level silently yields 0 for every row, which
        # makes all 337 rows look skipped instead of the real 74.
        counts = ff.get("counts") or {}
        variables = counts.get("variables") or 0
        if not variables:
            skipped += 1
        steps.append({
            "step": r["step"],
            "variables": variables,
            "faces": counts.get("faces") or 0,
            "transitivity": ff.get("transitivity") or 0,
            # a row with variables=0 has no layer-ordering problem to solve at all, which is
            # what a pre-crease step looks like: creases made, nothing stacked
            "looks_like_precrease": (not variables) and r["step"] > 1,
        })

    merged, effective = merge_precrease(steps)
    info = {"sequence": name, "n_steps": len(rows),
            "max_step": max(r["step"] for r in rows),
            "skipped_rows": skipped, "steps": steps,
            "effective_steps": effective, "merged": merged}
    with open(os.path.join(d, "info.json"), "w") as f:
        json.dump(info, f, indent=1)
    summary.append(info)

print(f"{len(summary)} sequences -> {os.path.relpath(OUT, ROOT)}\n")
print(f"{'sequence':<30} {'raw':>5} {'precrease':>10} {'effective':>10}")
for s in sorted(summary, key=lambda s: s["effective_steps"]):
    pc = sum(1 for x in s["steps"] if x["looks_like_precrease"])
    print(f"{s['sequence'][:29]:<30} {s['n_steps']:>5} {pc:>10} {s['effective_steps']:>10}")

tot_skipped = sum(s["skipped_rows"] for s in summary)
tot_pc = sum(1 for s in summary for x in s["steps"] if x["looks_like_precrease"])
print(f"\ntotal rows {sum(s['n_steps'] for s in summary)}   "
      f"skipped (variables=0) {tot_skipped}   of which past step 1 {tot_pc}")

# The cut points the synthetic corpus is stratified on come from HERE, so print them rather
# than leaving them to be transcribed by hand -- that transcription is exactly how the strata
# ended up calibrated against raw counts in the first place.
eff = sorted(s["effective_steps"] for s in summary)
n = len(eff)
lo, hi = eff[n // 3], eff[2 * n // 3]
print(f"\neffective step count (pre-crease frames merged into the step they precede):")
print(f"  min={eff[0]}  p33={lo}  median={eff[n // 2]}  p67={hi}  max={eff[-1]}")
print(f"  tertiles -> <={lo} / {lo + 1}-{hi} / >{hi}")
print(f"\n  raw counts would have said: min={min(s['n_steps'] for s in summary)} "
      f"max={max(s['n_steps'] for s in summary)} -- a different scale, and not the one the")
print( "  action space actually has. workspace/corpus/strata-3x3.json must match the line above.")
