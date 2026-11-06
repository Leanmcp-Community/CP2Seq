#!/usr/bin/env python3
"""Instance-clustered inference for the Luna ablations (reviewer Fff9 W3/Q4).

The 360 ablation outcomes reuse 40 instances across 3 tool conditions x 3 model settings, so
outcomes are not independent. This script:

  1. applies the identity audit: any (run, sample) that is solved under E_plane but not under
     E_id (workspace/RESULTS/identity-audit/report.json) is re-scored as unsolved;
  2. reports every ablation cell under both relations, with Wilson 95% intervals;
  3. for GPT-6 Luna low vs high effort, estimates the solve-rate difference with a
     CLUSTER bootstrap over instances (all of an instance's paired outcomes resampled
     together), and an exact sign-flip permutation test over per-instance differences
     (each instance's summed high-minus-low difference across tool conditions is one unit);
  4. does the same for tool conditions (L - B, A - L, A - B), pooled over model settings.

Standard library only. Writes workspace/RESULTS/rebuttal-stats/{stats.md,stats.json}.

    python3 workspace/analysis/rebuttal_stats.py --boot 10000 --seed 1
"""
import argparse
import itertools
import json
import math
import random
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("--inventory", default=ROOT / "workspace/RESULTS/run-inventory/report.json")
ap.add_argument("--identity", default=ROOT / "workspace/RESULTS/identity-audit/report.json")
ap.add_argument("--out", default=ROOT / "workspace/RESULTS/rebuttal-stats")
ap.add_argument("--boot", type=int, default=10000)
ap.add_argument("--seed", type=int, default=1)
a = ap.parse_args()

inv = json.loads(Path(a.inventory).read_text())
flips = set()
ident_path = Path(a.identity)
if ident_path.is_file():
    for r in json.loads(ident_path.read_text()).get("accepted", []):
        if r.get("plane") and not r.get("identity"):
            flips.add((r["run"], r["sample"]))
else:
    print(f"WARNING: {ident_path} missing; E_id column equals E_plane", flush=True)

TOOL = {"basic": "B", "legal": "L", "auto-tier-3": "A"}
cells = {}  # (model, effort, tool) -> {sample: (plane, identity)}
for abl in inv["ablations"]:
    key = (abl["model"], abl["effort"], TOOL.get(abl["condition"], abl["condition"]))
    outcomes = {}
    for stratum in abl["strata"]:
        for att in stratum["selected_attempts"]:
            plane = bool(att.get("solved"))
            ident = plane and (att.get("run"), att["sample"]) not in flips
            outcomes[att["sample"]] = (plane, ident)
        for missing in stratum.get("missing", []):
            sid = missing["sample"] if isinstance(missing, dict) else missing
            outcomes.setdefault(sid, (False, False))  # protocol failures count unsolved
    cells[key] = outcomes


def wilson(k, n, z=1.959964):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - h) / d, (c + h) / d)


def group(s):
    return s.split("-")[0]


def paired(lhs, rhs, rel, samples_filter=None):
    """Per-instance summed differences between two lists of cells (paired by sample)."""
    per = defaultdict(int)
    for lc, rc in zip(lhs, rhs):
        for s in cells[lc]:
            if samples_filter and not samples_filter(s):
                continue
            per[s] += int(cells[rc][s][rel]) - int(cells[lc][s][rel])
    return per


def cluster_boot(lhs, rhs, rel, flt, rng):
    samples = sorted({s for c in lhs for s in cells[c] if not flt or flt(s)})
    n_obs = len(samples) * len(lhs)
    diffs = paired(lhs, rhs, rel, flt)
    point = sum(diffs.values()) / n_obs
    boots = []
    for _ in range(a.boot):
        draw = [rng.choice(samples) for _ in samples]
        boots.append(sum(diffs[s] for s in draw) / n_obs)
    boots.sort()
    lo, hi = boots[int(0.025 * a.boot)], boots[int(0.975 * a.boot) - 1]
    # Exact sign-flip test over instances with nonzero difference (enumerate if small).
    nz = [d for d in diffs.values() if d]
    obs = abs(sum(nz))
    if len(nz) <= 20:
        tot = sum(1 for signs in itertools.product([1, -1], repeat=len(nz))
                  if abs(sum(s * d for s, d in zip(signs, nz))) >= obs)
        p = tot / 2 ** len(nz)
    else:
        hits = sum(1 for _ in range(a.boot)
                   if abs(sum(rng.choice((1, -1)) * d for d in nz)) >= obs)
        p = (hits + 1) / (a.boot + 1)
    return {"diff": point, "ci95": [lo, hi], "p_signflip": p,
            "instances": len(samples), "instances_nonzero": len(nz), "observations": n_obs}


rng = random.Random(a.seed)
out = {"identity_flips_applied": sorted(map(list, flips)), "cells": {}, "effort": {}, "tools": {}}
lines = ["# Instance-clustered statistics for the Luna ablations", "",
         f"Identity audit flips applied: {len(flips)}. Bootstrap: {a.boot} cluster resamples of instances, seed {a.seed}.", "",
         "## Cells (solved/total, Wilson 95%)", "",
         "| model | effort | tools | E_plane | E_id | E_id 95% CI |", "| --- | --- | --- | --- | --- | --- |"]
for (m, e, t), oc in sorted(cells.items()):
    n = len(oc)
    kp = sum(p for p, _ in oc.values())
    ki = sum(i for _, i in oc.values())
    lo, hi = wilson(ki, n)
    out["cells"][f"{m}|{e}|{t}"] = {"n": n, "plane": kp, "identity": ki, "ci95": [lo, hi]}
    lines.append(f"| {m} | {e} | {t} | {kp}/{n} | {ki}/{n} | {lo:.2f}-{hi:.2f} |")

lines += ["", "## Reasoning effort, GPT-6 Luna high minus low (paired by instance and tool condition)", "",
          "| subset | relation | diff in solve rate | cluster-bootstrap 95% CI | sign-flip p | instances (nonzero) |",
          "| --- | --- | --- | --- | --- | --- |"]
low = [("gpt-6-luna", "low", t) for t in "BLA"]
high = [("gpt-6-luna", "high", t) for t in "BLA"]
if all(c in cells for c in low + high):
    for name, flt in [("all 40", None), ("some-layers", lambda s: group(s) == "layers"),
                      ("easy", lambda s: group(s) == "easy")]:
        for rel, rn in [(0, "E_plane"), (1, "E_id")]:
            r = cluster_boot(low, high, rel, flt, rng)
            out["effort"][f"{name}|{rn}"] = r
            lines.append(f"| {name} | {rn} | {r['diff']:+.3f} | {r['ci95'][0]:+.3f} to {r['ci95'][1]:+.3f} | "
                         f"{r['p_signflip']:.4f} | {r['instances']} ({r['instances_nonzero']}) |")

lines += ["", "## Tool conditions, pooled over the three model settings (paired by instance)", "",
          "| contrast | relation | diff | cluster-bootstrap 95% CI | sign-flip p |", "| --- | --- | --- | --- | --- |"]
settings = [("gpt-5.6-luna", "low"), ("gpt-6-luna", "low"), ("gpt-6-luna", "high")]
for x, y in [("B", "L"), ("L", "A"), ("B", "A")]:
    lhs = [(m, e, x) for m, e in settings]
    rhs = [(m, e, y) for m, e in settings]
    if not all(c in cells for c in lhs + rhs):
        continue
    for rel, rn in [(0, "E_plane"), (1, "E_id")]:
        r = cluster_boot(lhs, rhs, rel, None, rng)
        out["tools"][f"{y}-{x}|{rn}"] = r
        lines.append(f"| {y} - {x} | {rn} | {r['diff']:+.3f} | {r['ci95'][0]:+.3f} to {r['ci95'][1]:+.3f} | {r['p_signflip']:.4f} |")

od = Path(a.out)
od.mkdir(parents=True, exist_ok=True)
(od / "stats.json").write_text(json.dumps(out, indent=2) + "\n")
(od / "stats.md").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
