"""Download PurelandFold and report what's actually in it.

Run:  python workspace/get_purelandfold.py
Needs: pip install datasets
Out:  workspace/purelandfold/  (parquet cache)  + a printed summary

What it answers:
  1. step distribution per sequence -> can 27 sequences support 3 difficulty tiers?
  2. does cp.fold really carry faceOrder / stacking order?
  3. what is inside the flat_folder column (constraint counts we can use as the
     non-local-dependency axis, same quantity we used on the instagram corpus)
"""
import json, os
from collections import Counter, defaultdict

os.environ.setdefault("HF_HOME", os.path.join(os.path.dirname(__file__), "purelandfold"))
from datasets import load_dataset

ds = load_dataset("mayaweiz/PurelandFold", split="train")
print(f"rows: {len(ds)}")
print(f"columns: {ds.column_names}\n")

# --- 1. step distribution ---
seqs = defaultdict(list)
for r in ds:
    seqs[r["sequence"]].append(r["step"])
lens = {k: max(v) for k, v in seqs.items()}
print(f"sequences: {len(seqs)}")
print("steps per sequence (sorted):")
for k, v in sorted(lens.items(), key=lambda kv: kv[1]):
    print(f"  {v:3d}  {k}")
c = sorted(lens.values())
n = len(c)
print(f"\n  min={c[0]}  p33={c[n//3]}  p67={c[2*n//3]}  max={c[-1]}")
print("  -> tertile split by step count would be: "
      f"<={c[n//3]} / {c[n//3]+1}-{c[2*n//3]} / >{c[2*n//3]}")

# --- 2. what is in cp.fold ---
row = ds[0]
fold = json.loads(row["cp.fold"])
print(f"\ncp.fold keys (row 0, {row['sequence']} step {row['step']}):")
for k in sorted(fold): print(f"  {k}")
for k in fold:
    if "order" in k.lower() or "Order" in k:
        v = fold[k]
        print(f"  --> stacking order field '{k}': {type(v).__name__}, len={len(v)}, head={str(v)[:120]}")

# --- 3. what is in flat_folder ---
ff = json.loads(row["flat_folder"])
print(f"\nflat_folder keys (row 0):")
for k in sorted(ff): print(f"  {k}  ({type(ff[k]).__name__})")

# --- 3b. what is inside `counts` (the instagram corpus calls this `variables`) ---
cnt = ff.get("counts")
print(f"\nflat_folder['counts'] = {json.dumps(cnt)[:400]}")

# --- 4. the non-local-dependency axis ---
# On the instagram corpus the axis was transitivity / variables, where `variables`
# = len(BF) = number of overlapping face pairs. PurelandFold exposes `transitivity`
# at top level; the denominator is looked up below in whichever field carries it.
def n_vars(f):
    for k in ("variables", "num_variables", "n_variables"):
        if isinstance(f.get(k), int): return f[k]
    c = f.get("counts")
    if isinstance(c, dict):
        for k in ("variables", "num_variables", "n_variables", "B", "BF"):
            if isinstance(c.get(k), int): return c[k]
    fo = f.get("faceOrders")
    if isinstance(fo, list) and fo: return len(fo)   # fallback: one entry per pair
    return None

print("\nnon-local dependency proxy (transitivity / variables):")
vals, skipped = [], []
for r in ds:
    f = json.loads(r["flat_folder"])
    t, v = f.get("transitivity"), n_vars(f)
    if isinstance(t, int) and v: vals.append((r["sequence"], r["step"], t / v))
    else: skipped.append((r["sequence"], r["step"], f))
if vals:
    vs = sorted(x[2] for x in vals); m = len(vs)
    print(f"  n={m} (skipped {len(skipped)})  p10={vs[m//10]:.1f}  p50={vs[m//2]:.1f}  "
          f"p90={vs[9*m//10]:.1f}  max={vs[-1]:.1f}")
    print("  instagram corpus, same formula:  p10=2.6  p50=12.8  p90=54.4  max=159.9")
else:
    print(f"  no usable rows ({len(skipped)} skipped) -- see the `counts` dump above")

# --- 5. why were rows skipped? (variables == 0 means no overlapping face pairs) ---
print(f"\nskipped rows ({len(skipped)}) by step:")
bystep = Counter(st for _, st, _ in skipped)
for st in sorted(bystep): print(f"  step {st:2d}: {bystep[st]}")
print("  (step 1 = unfolded square, expected to have variables=0)")
print(f"  skipped at step>1: {sum(v for k, v in bystep.items() if k > 1)}")
print("\n  faces/variables for the first few skipped rows at step>1:")
for seq, st, f in [x for x in skipped if x[1] > 1][:8]:
    c = f.get("counts", {})
    print(f"    {seq:18s} step {st:2d}  faces={c.get('faces')}  variables={c.get('variables')}  "
          f"compiled={f.get('compilation_success')}  faceOrders={len(f.get('faceOrders') or [])}")
