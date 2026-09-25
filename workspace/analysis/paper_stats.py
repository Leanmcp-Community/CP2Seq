#!/usr/bin/env python3
"""Statistics for the CP2Seq paper, computed from the run inventory.

Reads workspace/RESULTS/run-inventory/report.json (written by
workspace/report_run_inventory.mjs) and the release corpus, and writes
workspace/RESULTS/paper-stats/{stats.md,stats.json}.

It reports, and checks against the numbers quoted in the paper:
  1. Wilson 95% intervals for every Luna ablation cell (Table 4).
  2. Low- vs high-effort GPT-6 Luna: per-condition Fisher exact tests and an
     exact McNemar test over the paired (sample, condition) outcomes.
  3. Termination reasons for every ablation configuration (the paper
     currently says these "remain to be aggregated").
  4. The earlier 447-attempt GPT-5.6 Luna termination snapshot quoted in
     Section 5.4 (215 cycling, 18 repetition, 47 turn budget, 167 submitted).
  5. Solve rate by reference fold count on the easy group.

Standard library only. Usage:
    python3 workspace/analysis/paper_stats.py
    python3 workspace/analysis/paper_stats.py --report PATH --corpus PATH --out DIR
"""

import argparse
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REPORT = ROOT / "workspace/RESULTS/run-inventory/report.json"
DEFAULT_CORPUS = ROOT / "workspace/corpus/out/release"
DEFAULT_OUT = ROOT / "workspace/RESULTS/paper-stats"

# Numbers the paper states; the script flags any disagreement.
PAPER = {
    "earlier_luna_snapshot": {
        "attempts": 447, "state_cycling": 215, "repetition_detected": 18,
        "turn_budget": 47, "submitted": 167, "solved": 63,
    },
    "gpt6_some_layers": {"low": (6, 30), "high": (18, 30)},
    "fisher_p": {"basic": 0.21, "legal": 0.02, "auto-tier-3": 0.35},
}


# ---------------------------------------------------------------- statistics

def wilson(k, n, z=1.959963984540054):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def hypergeom_pmf(x, total, successes, draws):
    return (math.comb(successes, x) * math.comb(total - successes, draws - x)
            / math.comb(total, draws))


def fisher_two_sided(a, b, c, d):
    """2x2 table [[a, b], [c, d]]; two-sided p by summing tables no likelier than observed."""
    total, successes, draws = a + b + c + d, a + c, a + b
    lo, hi = max(0, draws - (total - successes)), min(draws, successes)
    observed = hypergeom_pmf(a, total, successes, draws)
    p = sum(hypergeom_pmf(x, total, successes, draws) for x in range(lo, hi + 1)
            if hypergeom_pmf(x, total, successes, draws) <= observed * (1 + 1e-7))
    return min(1.0, p)


def mcnemar_exact(only_first, only_second):
    """Exact two-sided McNemar (binomial test on discordant pairs, p = 1/2)."""
    n = only_first + only_second
    if n == 0:
        return 1.0
    k = min(only_first, only_second)
    tail = sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n
    return min(1.0, 2 * tail)


# ---------------------------------------------------------------- data access

def load_meta_index(corpus_root):
    """Map (corpus subpath, sample id) -> meta.json, keyed the way attempts record corpora."""
    index = {}
    for meta in corpus_root.glob("**/samples/*/meta.json"):
        sub = meta.parent.parent.relative_to(corpus_root).as_posix()
        index[(sub, meta.parent.name)] = json.loads(meta.read_text())
    return index


def corpus_subpath(corpus_field):
    """'/any/prefix/release/all-layers/samples' -> 'all-layers/samples'."""
    if not corpus_field:
        return None
    parts = corpus_field.split("/release/", 1)
    return parts[1].rstrip("/") if len(parts) == 2 else None


def fmt_p(p):
    return "<0.001" if p < 0.001 else f"{p:.3f}"


# ---------------------------------------------------------------- analyses

def ablation_cells(report):
    cells = []
    for abl in report["ablations"]:
        for s in abl["strata"]:
            lo, hi = wilson(s["solved"], s["expected"])
            cells.append({
                "model": abl["model"], "effort": abl["effort"], "condition": abl["condition"],
                "group": s["group"], "solved": s["solved"], "expected": s["expected"],
                "completed": s["completed"], "wilson95": [lo, hi],
            })
    return cells


def outcomes(report, model, effort):
    """{(condition, group, sample): solved} for one ablation arm; missing counts as unsolved."""
    out = {}
    for abl in report["ablations"]:
        if abl["model"] != model or abl["effort"] != effort:
            continue
        for s in abl["strata"]:
            for att in s["selected_attempts"]:
                out[(abl["condition"], s["group"], att["sample"])] = bool(att["solved"])
            for sample in s.get("missing", []):
                name = sample["sample"] if isinstance(sample, dict) else sample
                out.setdefault((abl["condition"], s["group"], name), False)
    return out


def effort_comparison(report, group_filter):
    low = outcomes(report, "gpt-6-luna", "low")
    high = outcomes(report, "gpt-6-luna", "high")
    rows, pairs = [], Counter()
    by_condition = defaultdict(lambda: {"low": [0, 0], "high": [0, 0]})
    for key in sorted(set(low) | set(high)):
        condition, group, _ = key
        if group_filter and group not in group_filter:
            continue
        l, h = low.get(key, False), high.get(key, False)
        by_condition[condition]["low"][0] += l
        by_condition[condition]["low"][1] += 1
        by_condition[condition]["high"][0] += h
        by_condition[condition]["high"][1] += 1
        pairs[(l, h)] += 1
    for condition, c in sorted(by_condition.items()):
        (kl, nl), (kh, nh) = c["low"], c["high"]
        rows.append({"condition": condition, "low": [kl, nl], "high": [kh, nh],
                     "fisher_p": fisher_two_sided(kl, nl - kl, kh, nh - kh)})
    pooled_low = sum(r["low"][0] for r in rows), sum(r["low"][1] for r in rows)
    pooled_high = sum(r["high"][0] for r in rows), sum(r["high"][1] for r in rows)
    return {
        "per_condition": rows,
        "pooled": {"low": list(pooled_low), "high": list(pooled_high)},
        "discordant": {"low_only": pairs[(True, False)], "high_only": pairs[(False, True)]},
        "mcnemar_p": mcnemar_exact(pairs[(True, False)], pairs[(False, True)]),
    }


def ablation_terminations(report):
    by_run_sample = {(a["run"], a["sample"]): a for a in report["attempts"]}
    rows = []
    for abl in report["ablations"]:
        counts, unmatched = Counter(), 0
        for s in abl["strata"]:
            for att in s["selected_attempts"]:
                full = by_run_sample.get((att["run"], att["sample"]))
                if full is None:
                    unmatched += 1
                    continue
                label = "solved" if full.get("solved") else full.get("termination", "unknown")
                counts[label] += 1
        rows.append({"model": abl["model"], "effort": abl["effort"],
                     "condition": abl["condition"], "counts": dict(counts), "unmatched": unmatched})
    return rows


def earlier_luna_snapshot(report):
    earlier = [a for a in report["attempts"]
               if a["model"] == "gpt-5.6-luna" and a["effort"] == "low"
               and not a["recent"] and a["complete"]]
    counts = Counter(a["termination"] for a in earlier)
    return {"attempts": len(earlier), "solved": sum(bool(a["solved"]) for a in earlier),
            "terminations": dict(counts)}


def easy_by_depth(report, meta_index):
    table = defaultdict(lambda: [0, 0])
    missing_meta = 0
    for a in report["attempts"]:
        if not a["complete"] or a["model"] in ("unknown",):
            continue
        sub = corpus_subpath(a.get("corpus"))
        meta = meta_index.get((sub, a["sample"]))
        if meta is None:
            missing_meta += 1
            continue
        if meta.get("stratum") != "easy":
            continue
        depth = meta["metrics"]["steps"]
        table[depth][0] += bool(a["solved"])
        table[depth][1] += 1
    return {"by_depth": {d: v for d, v in sorted(table.items())}, "missing_meta": missing_meta}


# ---------------------------------------------------------------- output

def check(label, got, want, notes):
    if got != want:
        notes.append(f"MISMATCH {label}: paper says {want}, data gives {got}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    ap.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    report = json.loads(args.report.read_text())
    meta_index = load_meta_index(args.corpus)

    cells = ablation_cells(report)
    effort_some = effort_comparison(report, {"layers"})  # the inventory names the some-layers group "layers"
    effort_all = effort_comparison(report, None)
    terminations = ablation_terminations(report)
    snapshot = earlier_luna_snapshot(report)
    depth = easy_by_depth(report, meta_index)

    notes = []
    t = snapshot["terminations"]
    want = PAPER["earlier_luna_snapshot"]
    check("earlier Luna attempts", snapshot["attempts"], want["attempts"], notes)
    check("earlier Luna solved", snapshot["solved"], want["solved"], notes)
    for key in ("state_cycling", "repetition_detected", "turn_budget"):
        check(f"earlier Luna {key}", t.get(key, 0), want[key], notes)
    check("earlier Luna submitted (finished)", t.get("finished", 0), want["submitted"], notes)
    check("GPT-6 some-layers low", tuple(effort_some["pooled"]["low"]),
          PAPER["gpt6_some_layers"]["low"], notes)
    check("GPT-6 some-layers high", tuple(effort_some["pooled"]["high"]),
          PAPER["gpt6_some_layers"]["high"], notes)
    for row in effort_some["per_condition"]:
        quoted = PAPER["fisher_p"].get(row["condition"])
        if quoted is not None and abs(row["fisher_p"] - quoted) > 0.01:
            notes.append(f"MISMATCH Fisher p ({row['condition']}): paper ~{quoted}, "
                         f"data {row['fisher_p']:.3f}")

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "stats.json").write_text(json.dumps({
        "source_report": str(args.report), "generated_at_source": report.get("generated_at"),
        "ablation_cells": cells, "effort_some_layers": effort_some, "effort_all_groups": effort_all,
        "ablation_terminations": terminations, "earlier_luna_snapshot": snapshot,
        "easy_by_depth": depth, "checks": notes,
    }, indent=2, default=list))

    md = [f"# Paper statistics\n\nSource: `{args.report}` (generated {report.get('generated_at')})\n"]
    md.append("## Checks against numbers quoted in the paper\n")
    md += [f"- {n}" for n in notes] or ["- All quoted numbers match."]
    md.append("\n## Ablation cells with Wilson 95% intervals\n")
    md.append("| Model | Effort | Tools | Group | Solved/n | 95% CI |\n|---|---|---|---|---|---|")
    for c in cells:
        lo, hi = c["wilson95"]
        md.append(f"| {c['model']} | {c['effort']} | {c['condition']} | {c['group']} | "
                  f"{c['solved']}/{c['expected']} | {lo:.2f}–{hi:.2f} |")
    for title, res in (("some-layers", effort_some), ("all groups", effort_all)):
        md.append(f"\n## GPT-6 Luna low vs high effort ({title})\n")
        md.append("| Tools | Low | High | Fisher p |\n|---|---|---|---|")
        for r in res["per_condition"]:
            md.append(f"| {r['condition']} | {r['low'][0]}/{r['low'][1]} | "
                      f"{r['high'][0]}/{r['high'][1]} | {fmt_p(r['fisher_p'])} |")
        d = res["discordant"]
        md.append(f"\nPooled: low {res['pooled']['low'][0]}/{res['pooled']['low'][1]}, "
                  f"high {res['pooled']['high'][0]}/{res['pooled']['high'][1]}. "
                  f"Paired exact McNemar over (sample, condition): low-only {d['low_only']}, "
                  f"high-only {d['high_only']}, p = {fmt_p(res['mcnemar_p'])}.")
    md.append("\n## Termination reasons per ablation configuration\n")
    labels = sorted({k for r in terminations for k in r["counts"]})
    md.append("| Model | Effort | Tools | " + " | ".join(labels) + " | unmatched |")
    md.append("|---" * (len(labels) + 4) + "|")
    for r in terminations:
        md.append(f"| {r['model']} | {r['effort']} | {r['condition']} | "
                  + " | ".join(str(r["counts"].get(k, 0)) for k in labels)
                  + f" | {r['unmatched']} |")
    md.append("\n## Earlier GPT-5.6 Luna snapshot (Section 5.4)\n")
    md.append(f"{snapshot['attempts']} attempts, {snapshot['solved']} solved; terminations "
              + ", ".join(f"{k}: {v}" for k, v in sorted(t.items())))
    md.append("\n## Easy group: solve rate by reference folds (all completed model attempts)\n")
    md.append("| Folds | Solved/attempts | Rate |\n|---|---|---|")
    for d_, (k, n) in depth["by_depth"].items():
        md.append(f"| {d_} | {k}/{n} | {k / n:.1%} |")
    md.append(f"\nAttempts whose sample metadata was not found: {depth['missing_meta']}")
    (args.out / "stats.md").write_text("\n".join(md) + "\n")

    print((args.out / "stats.md").read_text())


if __name__ == "__main__":
    main()
