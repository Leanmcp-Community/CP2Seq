"""Command-line Python CP + target-frame sequence baseline (stdlib only)."""
import argparse
from dataclasses import asdict
from datetime import datetime
import hashlib
import json
from pathlib import Path
import sys
from uuid import uuid4

from model import Action, InputError, Problem
from search import Limits, search
from search_trace import Trace


HERE = Path(__file__).resolve().parent
DEFAULT_DATA = HERE.parent / "data" / "pureland" / "seq"
DEFAULT_MAX_STATES = 20_000
DEFAULT_EXPERIMENTS = HERE.parent / "experiments"


def default_output(args):
    target = Path(args.target) if args.command == "solve" else None
    name = (f"{target.parent.name}-{target.stem}" if target else "benchmark")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return DEFAULT_EXPERIMENTS / name / f"{stamp}-{uuid4().hex[:8]}"


def read(path):
    with Path(path).open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise InputError(f"Expected a JSON object: {path}")
    return data


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, data, compact=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Reject accidental overwrites of user inputs/artifacts.
    with path.open("x", encoding="utf-8") as handle:
        json.dump(data, handle, indent=None if compact else 2, allow_nan=False)
        handle.write("\n")


def options(parser):
    parser.add_argument("--algorithm", choices=("bfs", "dfs", "both"), default="both")
    parser.add_argument("--max-depth", type=int, default=24)
    parser.add_argument("--max-queries", type=int, default=100000)
    parser.add_argument("--max-states", type=int, default=DEFAULT_MAX_STATES)
    parser.add_argument("--seconds", type=float, default=60)
    parser.add_argument("--trace-events", type=int, default=0,
                        help="Record up to this many search events for the 3D viewer")
    parser.add_argument("--tolerance", type=float, default=0.004,
                        help="Absolute distance in CP units; Pureland sheets are unit-sized")
    parser.add_argument("--convention", choices=("pureland", "fold"), default="pureland")
    parser.add_argument("--out", type=Path,
                        help="Optional override; default: experiments/<target>/<unique-run>")


def limits_for(args):
    return Limits(args.max_depth, args.max_queries, args.max_states, args.seconds)


def solve_one(cp_path, target_path, args, output):
    problem = Problem(read(cp_path), read(target_path), args.tolerance, args.convention)
    limits = limits_for(args)
    algorithms = ("bfs", "dfs") if args.algorithm == "both" else (args.algorithm,)
    rows = []
    for algorithm in algorithms:
        if args.trace_events < 0:
            raise InputError("--trace-events must be nonnegative")
        trace = Trace(problem, args.trace_events) if args.trace_events else None
        result = search(problem, algorithm, limits, observer=trace)
        row = result.as_dict() | {
            "cp": str(Path(cp_path).resolve()), "target": str(Path(target_path).resolve()),
            "cp_sha256": digest(cp_path), "target_sha256": digest(target_path),
            "limits": asdict(limits), "tolerance": args.tolerance,
            "convention": args.convention, "model_version": 1,
            "model": "exposed same-side 180-degree flaps on final CP mesh",
            "physical_validation": "restricted geometric model; no independent physics validation",
            "target_layer_constraints": len(problem.orders),
            "target_geometry_resolved": problem.target_transforms is not None,
        }
        # Always save the complete solution, independently of trace recording.
        if result.status == "SOLVED":
            frames = [problem.frame(state) for state in result.states]
            write(output / algorithm / "sequence.fold", frames[0] | {"file_frames": frames[1:]})
            for i, frame in enumerate(frames):
                write(output / algorithm / "frames" / f"step_{i:03d}.fold", frame)
        if trace is not None:
            write(output / algorithm / "trace.json", trace.export(result), compact=True)
        # Publish the catalog marker only once the artifacts are ready.
        write(output / algorithm / "result.json", row)
        rows.append(row)
        print(f"{Path(target_path).parent.name:22} {algorithm:3} {result.status:16} "
              f"steps={row['steps']} queries={result.queries} states={result.visited} "
              f"seconds={result.elapsed_seconds:.3f}", flush=True)
    return rows


def benchmark(args):
    if not args.data.is_dir():
        raise InputError(f"Missing dataset directory {args.data}; see README extraction commands")
    directories = sorted(p for p in args.data.iterdir() if p.is_dir())
    if args.sequence:
        directories = [p for p in directories if p.name in args.sequence]
        missing = set(args.sequence) - {p.name for p in directories}
        if missing:
            raise InputError(f"Sequences not found: {sorted(missing)}")
    rows = []
    for directory in directories:
        # Filenames choose the terminal frame; intermediate file contents are
        # never read by this runner or passed to the solver.
        paths = list(directory.glob("step_*.fold"))
        if not paths:
            continue
        try:
            paths.sort(key=lambda p: int(p.stem.split("_")[-1]))
        except ValueError as exc:
            raise InputError(f"Unexpected step filename in {directory}") from exc
        target = paths[-1]
        try:
            records = solve_one(target, target, args, args.out / directory.name)
        except (InputError, KeyError, TypeError, ValueError) as exc:
            records = [{"status": "UNSUPPORTED_INPUT", "error": str(exc)}]
            print(f"{directory.name:22} UNSUPPORTED_INPUT {exc}", flush=True)
        for row in records:
            row["sequence"] = directory.name
            row["reference_keyframes"] = len(paths)
            # Keyframes include flips/duplicates; do not label this optimality.
            row["reference_transitions"] = len(paths)-1
        rows.extend(records)
    if not rows:
        raise InputError("No step_*.fold frames found")
    summary = {}
    for row in rows:
        key = row.get("algorithm", "input")
        counts = summary.setdefault(key, {})
        counts[row["status"]] = counts.get(row["status"], 0)+1
    write(args.out / "benchmark.json", {"summary": summary, "runs": rows})
    print(json.dumps(summary, indent=2))
    return 0


def replay(args):
    row = read(args.result)
    if row.get("status") != "SOLVED":
        raise InputError("Only a solved result has a sequence to replay")
    cp, target = Path(row["cp"]), Path(row["target"])
    if digest(cp) != row["cp_sha256"] or digest(target) != row["target_sha256"]:
        raise InputError("Input hashes changed since the search")
    problem = Problem(read(cp), read(target), row["tolerance"], row["convention"])
    state = problem.initial
    for i, data in enumerate(row["actions"], start=1):
        action = Action(tuple(data["axis"]), tuple(data["moving_faces"]),
                        data["direction"], tuple(data["hinge_edges"]))
        state = problem.apply(state, action)
        if state is None:
            raise InputError(f"Replay rejected action {i}")
    if not problem.is_goal(state):
        raise InputError("Replay does not reach the target")
    print(f"Replay passed: {len(row['actions'])} folds; target and CP coverage matched")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    solve = commands.add_parser("solve", help="Search using only a CP and one target snapshot")
    solve.add_argument("--cp", type=Path, required=True, help="CP encoded as FOLD JSON")
    solve.add_argument("--target", type=Path, required=True, help="Single target FOLD snapshot")
    options(solve)
    bench = commands.add_parser("benchmark", help="Evaluate final Pureland snapshots")
    bench.add_argument("--data", type=Path, default=DEFAULT_DATA)
    bench.add_argument("--sequence", nargs="+", help="Optional sequence names")
    options(bench)
    verify = commands.add_parser("replay", help="Replay a saved solution without searching")
    verify.add_argument("--result", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "replay":
            return replay(args)
        limits_for(args).validate()
        if args.out is None:
            args.out = default_output(args)
        if args.out.exists():
            raise InputError(f"Output already exists: {args.out}; choose a new directory")
        print(f"Saving experiment to: {args.out.resolve()}", flush=True)
        if args.command == "benchmark":
            return benchmark(args)
        rows = solve_one(args.cp, args.target, args, args.out)
        return 0 if all(row["status"] == "SOLVED" for row in rows) else 2
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
