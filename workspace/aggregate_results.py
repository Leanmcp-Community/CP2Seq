#!/usr/bin/env python3
"""Aggregate every harness run into the tables the paper needs.

    python3 workspace/aggregate_results.py
    python3 workspace/aggregate_results.py --runs CODEX_HARNESS_TESTING/runs --out workspace/RESULTS

Reads every  <runs>/*/results.json , groups runs into arms, and writes:

    <out>/results.md     markdown tables, paste-ready for paper/DRAFT.md
    <out>/results.json   the same numbers as facts, for notes/facts.json

An "arm" is (model, tools, reasoning_effort, image_history). A sample's stratum
is the prefix of its id (easy / mid / hard). Nothing is inferred and nothing is
smoothed: a sample with no `solved` field is counted as unsolved and reported
separately, so a missing field can never quietly become a success.
"""
import argparse, json, os, statistics, sys
from collections import Counter, defaultdict

ap = argparse.ArgumentParser()
ap.add_argument("--runs", default="CODEX_HARNESS_TESTING/runs")
ap.add_argument("--out", default="workspace/RESULTS")
a = ap.parse_args()

rows = []
for run in sorted(os.listdir(a.runs)):
    rp = os.path.join(a.runs, run, "results.json")
    if not os.path.isfile(rp):
        continue
    try:
        recs = json.load(open(rp))
    except Exception as e:
        print(f"  skipped {run}: {e}", file=sys.stderr)
        continue
    for r in recs if isinstance(recs, list) else []:
        sid = r.get("sample_id", "")
        rows.append({
            "run": run,
            "model": r.get("model_requested") or r.get("backend") or "unknown",
            "tools": r.get("tools") or "none",
            "effort": r.get("reasoning_effort") or "-",
            "images": str(r.get("image_history", "-")),
            "stratum": sid.split("-")[0] if "-" in sid else "?",
            "sample": sid,
            "solved": bool(r.get("solved")),
            "has_solved_field": "solved" in r,
            "termination": r.get("termination") or "-",
            "tool_calls": r.get("tool_calls"),
            "sample_calls": r.get("sample_calls"),
            "cp_match": bool(r.get("cp_match")),
            "expanded": r.get("search_expanded"),
        })

if not rows:
    sys.exit(f"no results.json found under {a.runs}")

os.makedirs(a.out, exist_ok=True)
STRATA = ["easy", "mid", "hard"]


def med(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return round(statistics.median(xs), 1) if xs else None


def block(title, keyfn, rs):
    """One markdown table: rows are arms, columns are strata."""
    out = [f"\n### {title}\n"]
    out.append("| Arm | " + " | ".join(f"{s} solved/n" for s in STRATA) +
               " | overall | median tool calls |")
    out.append("|---|" + "---|" * (len(STRATA) + 2))
    groups = defaultdict(list)
    for r in rs:
        groups[keyfn(r)].append(r)
    for k in sorted(groups):
        g = groups[k]
        cells = []
        for s in STRATA:
            gs = [r for r in g if r["stratum"] == s]
            cells.append(f"{sum(r['solved'] for r in gs)}/{len(gs)}" if gs else "--")
        rate = 100.0 * sum(r["solved"] for r in g) / len(g)
        out.append(f"| {k} | " + " | ".join(cells) +
                   f" | {sum(r['solved'] for r in g)}/{len(g)} ({rate:.1f}%) |"
                   f" {med([r['tool_calls'] for r in g])} |")
    return "\n".join(out)


md = ["# Aggregated results",
      "",
      f"Generated from `{a.runs}`. Every attempt in every run is counted once.",
      f"Total attempts: **{len(rows)}** across **{len({r['run'] for r in rows})}** runs "
      f"and **{len({r['sample'] for r in rows})}** distinct samples.",
      ""]

missing = [r for r in rows if not r["has_solved_field"]]
if missing:
    md.append(f"> **{len(missing)} attempts carry no `solved` field** and are counted as unsolved. "
              f"Runs affected: {', '.join(sorted({r['run'] for r in missing}))}\n")

md.append(block("By model", lambda r: r["model"], rows))
md.append(block("By model and tool tier", lambda r: f"{r['model']} / tools={r['tools']}", rows))
md.append(block("By model, tier, effort and image history",
                lambda r: f"{r['model']} / {r['tools']} / eff={r['effort']} / img={r['images']}", rows))

md.append("\n### Termination reasons\n")
md.append("| Model | " + " | ".join(sorted({r["termination"] for r in rows})) + " |")
md.append("|---|" + "---|" * len({r["termination"] for r in rows}))
terms = sorted({r["termination"] for r in rows})
for m in sorted({r["model"] for r in rows}):
    c = Counter(r["termination"] for r in rows if r["model"] == m)
    md.append(f"| {m} | " + " | ".join(str(c.get(t, 0)) for t in terms) + " |")

det = [r for r in rows if "deterministic" in r["model"]]
if det:
    md.append("\n### Deterministic search baseline\n")
    md.append(f"- attempts: {len(det)}, solved: {sum(r['solved'] for r in det)} "
              f"({100.0*sum(r['solved'] for r in det)/len(det):.1f}%)")
    md.append(f"- median states expanded: {med([r['expanded'] for r in det])}")
    for s in STRATA:
        gs = [r for r in det if r["stratum"] == s]
        if gs:
            md.append(f"- {s}: {sum(r['solved'] for r in gs)}/{len(gs)} solved, "
                      f"median expanded {med([r['expanded'] for r in gs])}")

open(os.path.join(a.out, "results.md"), "w").write("\n".join(md) + "\n")

facts = {"results.attempts": len(rows), "results.runs": len({r["run"] for r in rows}),
         "results.samples": len({r["sample"] for r in rows})}
for m in sorted({r["model"] for r in rows}):
    g = [r for r in rows if r["model"] == m]
    slug = m.replace("-", "").replace(".", "")
    facts[f"results.{slug}.n"] = len(g)
    facts[f"results.{slug}.solved"] = sum(r["solved"] for r in g)
    facts[f"results.{slug}.solvePct"] = round(100.0 * sum(r["solved"] for r in g) / len(g), 1)
json.dump({k: {"v": v, "src": f"derived: {a.runs}"} for k, v in facts.items()},
          open(os.path.join(a.out, "results.json"), "w"), indent=2, sort_keys=True)

print(f"wrote {a.out}/results.md and {a.out}/results.json")
print(f"{len(rows)} attempts, {len({r['run'] for r in rows})} runs, "
      f"{len({r['sample'] for r in rows})} distinct samples")
