"""Recover fold sequences using ChatGPT-authenticated codex exec subprocesses.

The controller owns the simulator; Codex returns one schema-constrained action.
No Tinker or OpenAI SDK is imported. Run only when the user executes this file.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import traceback

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SETUP = ROOT / "DHEERAJ_WORKSPACE/EXPERIMENT_SETUP"
sys.path.insert(0, str(SETUP))
from capture_fold import (BrowserSession, CORPUS, DEFAULT_SAMPLES, load_task,
                          save_images, write_json, add_image_options)
from tool_schemas import TOOLS


def action_schema():
    variants = []
    for tool in TOOLS:
        function = tool["function"]
        parameters = json.loads(json.dumps(function["parameters"]))
        for key in parameters["properties"]:
            if key not in parameters["required"]:
                parameters["properties"][key] = {"anyOf": [parameters["properties"][key], {"type": "null"}]}
        parameters["required"] = list(parameters["properties"])
        variants.append({"type": "object", "properties": {
            "name": {"type": "string", "enum": [function["name"]]},
            "arguments": parameters}, "required": ["name", "arguments"],
            "additionalProperties": False})
    return {"type": "object", "properties": {"action": {"anyOf": variants}},
            "required": ["action"], "additionalProperties": False}


def validate_action(response):
    if not isinstance(response, dict) or set(response) != {"action"}:
        raise ValueError("Response must contain exactly action")
    action = response["action"]
    if not isinstance(action, dict) or set(action) != {"name", "arguments"}:
        raise ValueError("Action must contain name and arguments")
    function = next((t["function"] for t in TOOLS if t["function"]["name"] == action["name"]), None)
    if function is None or not isinstance(action["arguments"], dict):
        raise ValueError("Unknown action or invalid arguments")
    arguments = {k: v for k, v in action["arguments"].items() if v is not None}
    params = function["parameters"]
    if set(arguments) - set(params["properties"]) or set(params["required"]) - set(arguments):
        raise ValueError("Extra or missing action arguments")
    for key, value in arguments.items():
        spec = params["properties"][key]
        valid = {"integer": type(value) is int, "number": type(value) in (int, float),
                 "boolean": type(value) is bool}[spec["type"]]
        if not valid or (type(value) in (int, float) and not math.isfinite(value)):
            raise ValueError(f"Invalid type or nonfinite value: {key}")
        if "enum" in spec and value not in spec["enum"]:
            raise ValueError(f"Invalid enum: {key}")
        if "minimum" in spec and value < spec["minimum"]:
            raise ValueError(f"Below minimum: {key}")
    return {"name": action["name"], "arguments": arguments}


def save_candidate(out, artifacts):
    write_json(out / "seq.json", artifacts["sequence"])
    write_json(out / "steps.fold", artifacts["steps"])
    final = artifacts["steps"]["file_frames"][-1]
    write_json(out / "final.fold", {"file_spec": 1.1, **{k: v for k, v in final.items()
        if k not in ("frame_parent", "frame_inherit")}})


def sequence_metrics(candidate, reference):
    def equal(a, b):
        return all(abs(a[k] - b[k]) < 2e-6 if k == "offset" else a[k] == b[k]
                   for k in ("angle_index", "offset", "move_positive", "over"))
    row = list(range(len(reference) + 1))
    for i, a in enumerate(candidate, 1):
        nxt = [i]
        for j, b in enumerate(reference, 1):
            nxt.append(min(nxt[-1] + 1, row[j] + 1, row[j-1] + (not equal(a, b))))
        row = nxt
    return {"action_edit_distance": row[-1], "candidate_steps": len(candidate),
            "reference_steps": len(reference),
            "step_count_ratio": len(candidate) / len(reference) if reference else None}


def ask_codex(args, prompt, manifest, turn_dir, workdir, schema_path):
    command = [args.codex_bin, "-a", "never", "exec", "--sandbox", "read-only",
               "--skip-git-repo-check", "--ephemeral", "--json", "-C", str(workdir),
               "-c", 'forced_login_method="chatgpt"', "-c", 'model_provider="openai"',
               "-c", "features.shell_tool=false", "-c", "features.unified_exec=false",
               "-c", 'web_search="disabled"', "--output-schema", str(schema_path),
               "--output-last-message", str(turn_dir / "response.json")]
    if args.model:
        command += ["--model", args.model]
    for info in manifest.values():
        command += ["--image", info["path"]]
    command += ["-"]
    (turn_dir / "prompt.md").write_text(prompt, encoding="utf-8")
    write_json(turn_dir / "command.json", command)
    environment = os.environ.copy()
    for key in ("OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL"):
        environment.pop(key, None)
    started = time.monotonic()
    with (turn_dir / "events.jsonl").open("w") as stdout, (turn_dir / "stderr.log").open("w") as stderr:
        try:
            result = subprocess.run(command, input=prompt, text=True, env=environment,
                                    stdout=stdout, stderr=stderr, timeout=args.timeout)
        except subprocess.TimeoutExpired:
            write_json(turn_dir / "process.json", {"timeout": True, "duration_s": time.monotonic()-started})
            raise RuntimeError(f"Codex timed out; see {turn_dir / 'stderr.log'}") from None
    write_json(turn_dir / "process.json", {"returncode": result.returncode, "duration_s": time.monotonic()-started})
    if result.returncode:
        raise RuntimeError(f"Codex exited {result.returncode}; see {turn_dir / 'stderr.log'}")
    return json.loads((turn_dir / "response.json").read_text())


def episode(args, sample_id, browser, run_dir, workdir, schema_path):
    out = run_dir / sample_id
    out.mkdir()
    cp, target = load_task(sample_id, args.corpus)
    initial = browser.init(cp, target, args.render_size)
    write_json(out / "cp.fold", cp)
    write_json(out / "target.fold", target)
    save_candidate(out, browser.artifacts())
    image_options = {"max_edge": args.max_image_edge, "max_bytes": args.max_image_bytes}
    fixed_images = save_images(initial["images"], out / "initial", **image_options)
    current_images = {}
    history, seen = [], Counter()
    termination, sample_calls, tool_calls = "turn_budget", 0, 0
    for turn in range(1, args.max_turns + 1):
        turn_dir = out / f"turn-{turn:03d}"
        turn_dir.mkdir()
        manifest = {**fixed_images, **{f"current-{k}": v for k, v in current_images.items()}}
        prompt = (args.prompt.read_text() + "\n\nFind the next action. Geometry and history:\n" +
                  json.dumps({"cp": cp, "target": target, "current": browser.artifacts()["state"],
                              "history": history, "turn": turn, "max_turns": args.max_turns}) +
                  "\nAttached images, in order:\n" + "\n".join(manifest))
        write_json(turn_dir / "images.json", manifest)
        print(f"{sample_id}: Codex turn {turn}/{args.max_turns}", flush=True)
        sample_calls += 1
        response = ask_codex(args, prompt, manifest, turn_dir, workdir, schema_path)
        try:
            action = validate_action(response)
        except ValueError as exc:
            feedback = {"ok": False, "error": str(exc), "instruction": "Return one valid action; nothing executed."}
            history.append({"response": response, "result": feedback})
            write_json(turn_dir / "tool.json", feedback)
            continue
        signature = json.dumps({"action": action, "state": browser.artifacts()["state"]}, sort_keys=True)
        seen[signature] += 1
        if seen[signature] > 3:
            termination = "repetition_detected"
            break
        tool_calls += 1
        result = browser.call(action["name"], action["arguments"])
        images = result.pop("images", {})
        write_json(turn_dir / "tool.json", {"action": action, "result": result})
        save_candidate(out, browser.artifacts())
        if result.get("ok") and action["name"] in ("add_fold", "remove_fold", "go_to_step", "restore_revision"):
            images = browser.call("get_images")["images"]
        if images:
            current_images = save_images(images, turn_dir / "feedback-images", **image_options)
        history.append({"action": action, "result": result})
        write_json(out / "history.json", history)
        if result.get("finished"):
            termination = "finished"
            break
    artifacts = browser.artifacts()
    save_candidate(out, artifacts)
    save_images(browser.call("get_images")["images"], out / "final", **image_options)
    # Reference actions are read only after the final Codex subprocess returns.
    reference = json.loads((args.corpus / sample_id / "seq.json").read_text())["folds"]
    result = {"sample_id": sample_id, "backend": "codex-cli-chatgpt", "model_requested": args.model,
              "termination": termination, "sample_calls": sample_calls, "tool_calls": tool_calls,
              **artifacts["evaluation"], **sequence_metrics(artifacts["sequence"]["folds"], reference)}
    result["solved"] = termination == "finished" and result["pilot_match"]
    write_json(out / "result.json", result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", nargs="+", default=DEFAULT_SAMPLES)
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--out", type=Path, default=HERE / "runs")
    parser.add_argument("--prompt", type=Path, default=HERE / "codex_fold_prompt.md")
    parser.add_argument("--codex-bin", default="codex")
    parser.add_argument("--model", help="An explicit model available to your Codex account; otherwise CLI default")
    parser.add_argument("--max-turns", type=int, default=40)
    parser.add_argument("--timeout", type=float, default=300, help="Seconds per Codex invocation")
    add_image_options(parser)
    args = parser.parse_args()
    if args.max_turns < 1 or not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error("Require max-turns > 0 and finite timeout > 0")
    if len(args.samples) != len(set(args.samples)):
        parser.error("Sample IDs must be unique")
    if not 256 <= args.render_size <= 2048 or args.max_image_edge < 1 or args.max_image_bytes < 1:
        parser.error("Invalid image options")
    executable = shutil.which(args.codex_bin)
    if not executable:
        parser.error("Codex CLI not found. Install it and run codex login first; see README.md")
    args.codex_bin = executable
    args.out = args.out.expanduser().resolve()
    args.corpus = args.corpus.expanduser().resolve()
    args.prompt = args.prompt.expanduser().resolve()
    args.prompt.read_text()
    for sample_id in args.samples:
        load_task(sample_id, args.corpus)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_dir = args.out / f"codex-{stamp}"
    run_dir.mkdir(parents=True)
    write_json(run_dir / "config.json", {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()})
    (run_dir / "prompt.md").write_text(args.prompt.read_text())
    schema_path = run_dir / "action.schema.json"
    write_json(schema_path, action_schema())
    write_json(run_dir / "tools.json", TOOLS)
    # CWD is outside the repository so project instructions/reference files are not auto-loaded.
    # This is context separation, not a filesystem security boundary.
    results = []
    with tempfile.TemporaryDirectory(prefix="codex-fold-") as temporary, BrowserSession() as browser:
        workdir = Path(temporary)
        for sample_id in args.samples:
            try:
                results.append(episode(args, sample_id, browser, run_dir, workdir, schema_path))
            except Exception as exc:
                error = {"sample_id": sample_id, "termination": "error", "error": str(exc),
                         "traceback": traceback.format_exc()}
                folder = run_dir / sample_id
                folder.mkdir(exist_ok=True)
                write_json(folder / "error.json", error)
                results.append(error)
                print(f"{sample_id}: {exc}", flush=True)
                # Auth/quota/CLI errors should stop the batch rather than retry every sample.
                break
    write_json(run_dir / "results.json", results)
    print(f"Saved: {run_dir}", flush=True)
    if any(r["termination"] == "error" for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
