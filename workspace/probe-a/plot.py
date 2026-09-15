"""Probe A — explosion curves from Flat-Folder's shipped batch CSVs.

Run:  python workspace/probe-a/plot.py
Out:  workspace/probe-a/states.png, workspace/probe-a/time.png
"""
import csv, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

EX = os.path.expanduser("~/Downloads/flat-folder-main/examples")
SETS = {"grids": "grids_data.csv", "instagram": "instagram_data.csv"}

data = {}
for name, fn in SETS.items():
    rows = []
    with open(os.path.join(EX, fn)) as f:
        for r in csv.DictReader(f):
            try:
                faces = int(r["faces"])
                # `states` can exceed 2**64 — keep it exact, convert to float only for plotting
                states = int(r["states"])
                solve = float(r["solve_sec"]) + float(r["setup_sec"])
                var = int(r["variables"])
            except (ValueError, KeyError):
                continue
            rows.append((faces, states, solve, var))
    data[name] = rows
    print(f"{name}: {len(rows)} rows, max faces={max(r[0] for r in rows)}")

# --- states vs faces ---
plt.figure(figsize=(7, 5))
for name, rows in data.items():
    xs = [r[0] for r in rows]
    ys = [max(float(r[1]), 1.0) for r in rows]  # float() on a huge int is fine up to ~1e308
    plt.scatter(xs, ys, s=12, alpha=0.6, label=name)
plt.xscale("log"); plt.yscale("log")
plt.xlabel("faces"); plt.ylabel("flat-folded states (NOT sequences)")
plt.title("Probe A — state-space explosion")
plt.axvspan(100, 500, alpha=0.12, color="green")
plt.text(110, 1e60, "candidate main-experiment band\n(space huge, verifier still cheap)", fontsize=8)
plt.legend(); plt.grid(alpha=0.3)
plt.tight_layout(); plt.savefig("workspace/probe-a/states.png", dpi=150)

# --- solve time vs faces ---
plt.figure(figsize=(7, 5))
for name, rows in data.items():
    xs = [r[0] for r in rows]
    ys = [max(r[2], 1e-4) for r in rows]
    plt.scatter(xs, ys, s=12, alpha=0.6, label=name)
plt.xscale("log"); plt.yscale("log")
plt.axhline(1.0, ls="--", lw=1, color="gray"); plt.text(3, 1.2, "1 s", fontsize=8, color="gray")
plt.axhline(60.0, ls="--", lw=1, color="red"); plt.text(3, 75, "1 min", fontsize=8, color="red")
plt.xlabel("faces"); plt.ylabel("setup + solve (sec)")
plt.title("Probe A — where the verifier stops being free")
plt.axvspan(100, 500, alpha=0.12, color="green")
plt.legend(); plt.grid(alpha=0.3)
plt.tight_layout(); plt.savefig("workspace/probe-a/time.png", dpi=150)
print("wrote workspace/probe-a/states.png and workspace/probe-a/time.png")
