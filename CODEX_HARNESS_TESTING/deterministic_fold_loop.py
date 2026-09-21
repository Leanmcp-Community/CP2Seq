"""Deterministic search arm: BFS decides the folds, the same tools execute them.

The control condition for every model arm. It writes the same artifacts to the same runs
folder, so a deterministic episode opens in the viewer beside a Luna or Claude one and can be
stepped through turn by turn.

WHY IT BELONGS NEXT TO THE MODEL ARMS
list_legal_folds prunes roughly 2010 candidate actions per state down to a mean of 3.51 that
are legal and on-target. Most of the geometry is therefore done by the simulator before the
model sees anything, and the honest question is how much is left. If blind search over the
same enumerated actions matches or beats a model given the same enumerator, the enumerator arm
is not measuring origami reasoning.

HOW IT STAYS HONEST
No new action space and no new verifier. The search expands with enumerateLegalFolds -- the
exact function behind the list_legal_folds tool -- and every fold it commits goes through
add_fold on the real ToolSession, so the same tryFold that judges a model's fold judges this
one. Scoring is the untouched evaluation the harness already runs on finish.

The search runs first and the winning sequence is then replayed as add_fold turns. Searching
live through the tools would work too, but backtracking would make every explored node a turn
and bury the solution in thousands of them; replaying keeps the episode readable while the
search statistics (nodes expanded, generated, wall time) are preserved in result.json.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SETUP = ROOT / "DHEERAJ_WORKSPACE/EXPERIMENT_SETUP"
sys.path.insert(0, str(SETUP))
from capture_fold import (BrowserSession, CORPUS, DEFAULT_SAMPLES, load_task,
                          save_images, write_json, add_image_options)
from codex_fold_loop import save_candidate, sequence_metrics, model_view


def search(samples, seconds, max_states, node_bin):
    """Run the BFS in node and return its verdict per sample."""
    command = [node_bin, str(ROOT / "workspace/search_baseline.mjs"), "--json",
               "--seconds", str(seconds), "--max-states", str(max_states), *samples]
    done = subprocess.run(command, capture_output=True, text=True, cwd=str(ROOT))
    if done.returncode:
        raise RuntimeError(f"search failed: {done.stderr.strip()[-400:]}")
    return {row["sample_id"]: row for row in json.loads(done.stdout.strip().splitlines()[-1])}


def episode(args, sample_id, browser, run_dir, verdict):
    out = run_dir / sample_id
    out.mkdir()
    cp, target = load_task(sample_id, args.corpus)
    initial = browser.init(cp, target, args.render_size)
    write_json(out / "cp.fold", cp)
    write_json(out / "target.fold", target)
    save_candidate(out, browser.artifacts())
    image_options = {"max_edge": args.max_image_edge, "max_bytes": args.max_image_bytes}
    save_images(initial["images"], out / "initial", **image_options)
    write_json(out / "search.json", verdict)

    history = []
    actions = verdict.get("actions") or []
    for turn, action in enumerate(actions, 1):
        turn_dir = out / f"turn-{turn:03d}"
        turn_dir.mkdir()
        # Strip the engine's internal tool key; add_fold takes the arguments alone, exactly as
        # a model would send them.
        arguments = {k: v for k, v in action.items() if k != "tool"}
        result = browser.call("add_fold", arguments)
        if not result.get("ok"):
            # The searcher validated every move through the same verifier, so a rejection here
            # means the two paths have diverged and the comparison is void. Say so loudly.
            raise RuntimeError(f"{sample_id} turn {turn}: search move rejected by add_fold "
                               f"({result.get('error')}). Search and harness have diverged.")
        images = browser.call("get_images")["images"]
        save_images(images, turn_dir / "feedback-images", **image_options)
        write_json(turn_dir / "tool.json", {"action": {"name": "add_fold", "arguments": arguments},
                                            "result": result})
        write_json(turn_dir / "model-feedback.json", model_view(result))
        history.append({"action": {"name": "add_fold", "arguments": arguments}, "result": result})
        write_json(out / "history.json", history)
        save_candidate(out, browser.artifacts())

    final_turn = out / f"turn-{len(actions) + 1:03d}"
    final_turn.mkdir()
    finished = browser.call("finish")
    write_json(final_turn / "tool.json", {"action": {"name": "finish", "arguments": {}},
                                          "result": finished})
    artifacts = browser.artifacts()
    save_candidate(out, artifacts)
    save_images(browser.call("get_images")["images"], out / "final", **image_options)
    reference = json.loads((args.corpus / sample_id / "seq.json").read_text())["folds"]
    result = {"sample_id": sample_id, "backend": "deterministic-bfs",
              "model_requested": "deterministic-bfs", "tools": "legal-folds",
              "termination": "finished" if verdict.get("status") == "solved" else verdict.get("status"),
              "sample_calls": 0, "tool_calls": len(actions) + 1,
              "search_status": verdict.get("status"), "search_expanded": verdict.get("expanded"),
              "search_generated": verdict.get("generated"), "search_seconds": verdict.get("seconds"),
              **artifacts["evaluation"],
              **sequence_metrics(artifacts["sequence"]["folds"], reference)}
    result["solved"] = bool(result.get("pilot_match"))
    write_json(out / "result.json", result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", nargs="+", default=DEFAULT_SAMPLES)
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--out", type=Path, default=HERE / "runs")
    parser.add_argument("--node-bin", default="node")
    parser.add_argument("--seconds", type=float, default=60, help="Search budget per sample")
    parser.add_argument("--max-states", type=int, default=500000)
    add_image_options(parser)
    args = parser.parse_args()
    args.out = args.out.expanduser().resolve()
    args.corpus = args.corpus.expanduser().resolve()
    for sample_id in args.samples:
        load_task(sample_id, args.corpus)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_dir = args.out / f"deterministic-{stamp}"
    run_dir.mkdir(parents=True)
    config = {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()}
    # model/tools are what the viewer's sidebar reads to label the arm.
    config.update(model="deterministic-bfs", tools="legal-folds", compare_tier=0,
                  backend="deterministic-bfs")
    write_json(run_dir / "config.json", config)
    print(json.dumps(config, indent=2), flush=True)

    print(f"searching {len(args.samples)} sample(s)...", flush=True)
    verdicts = search(args.samples, args.seconds, args.max_states, args.node_bin)

    results = []
    with BrowserSession() as browser:
        for sample_id in args.samples:
            verdict = verdicts.get(sample_id, {"status": "missing"})
            row = episode(args, sample_id, browser, run_dir, verdict)
            results.append(row)
            write_json(run_dir / "results.json", results)
            print(f"{sample_id}: {row['search_status']} solved={row['solved']} "
                  f"folds={row['candidate_steps']}/{row['reference_steps']}", flush=True)
    solved = sum(1 for r in results if r["solved"])
    print(f"Saved: {run_dir}", flush=True)
    print(f"deterministic BFS solved {solved} of {len(results)}", flush=True)


if __name__ == "__main__":
    main()
