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

# --- 4. the non-local-dependency axis, same formula as the instagram corpus ---
print("\nnon-local dependency proxy (transitivity / variables), per sequence:")
vals = []
for r in ds:
    try:
        f = json.loads(r["flat_topfolder"]) if False else json.loads(r["flat_folder"])
        t, v = f.get("transitivity"), f.get("variables")
        if t and v: vals.append((r["sequence"], r["step"], t / v))
    except Exception:
        pass
if vals:
    vs = sorted(x[2] for x in vals)
    m = len(vs)
    print(f"  n={m}  p10={vs[m//10]:.1f}  p50={vs[m//2]:.1f}  p90={vs[9*m//10]:.1f}  max={vs[-1]:.1f}")
else:
    print("  (field names differ -- inspect the flat_folder keys printed above)")
