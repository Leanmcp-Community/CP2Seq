"""Recover fold sequences using ChatGPT-authenticated codex exec subprocesses.

The controller owns the simulator; Codex returns one schema-constrained action.
No Tinker or OpenAI SDK is imported. Run only when the user executes this file.
"""
import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
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
from tool_schemas import tools_for
from action_compare import same_action
from observability.obs import Run, read_jsonl


MODEL_GEOMETRY_DECIMALS = 10


def model_view(value):
    """Clean JSON numeric presentation; never mutate simulator data or actions.

    Maximum absolute rounding error is 5e-11, well below the 2e-6 terminal
    coordinate tolerance. Integers, booleans, and nonnumeric values stay intact.
    """
    if isinstance(value, dict):
        return {k: model_view(v) for k, v in value.items()}
    if isinstance(value, list):
        return [model_view(v) for v in value]
    if type(value) is float and math.isfinite(value):
        rounded = round(value, MODEL_GEOMETRY_DECIMALS)
        return 0.0 if rounded == 0 else rounded
    return value


def action_schema(tools):
    variants = []
    for tool in tools:
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


def validate_action(response, tools):
    if not isinstance(response, dict) or set(response) != {"action"}:
        raise ValueError("Response must contain exactly action")
    action = response["action"]
    if not isinstance(action, dict) or set(action) != {"name", "arguments"}:
        raise ValueError("Action must contain name and arguments")
    function = next((t["function"] for t in tools if t["function"]["name"] == action["name"]), None)
    if function is None or not isinstance(action["arguments"], dict):
        raise ValueError("Unknown action or invalid arguments")
    arguments = {k: v for k, v in action["arguments"].items() if v is not None}
    params = function["parameters"]
    if set(arguments) - set(params["properties"]) or set(params["required"]) - set(arguments):
        raise ValueError("Extra or missing action arguments")
    for key, value in arguments.items():
        spec = params["properties"][key]
        valid = {"integer": type(value) is int, "number": type(value) in (int, float),
                 "boolean": type(value) is bool, "string": type(value) is str}[spec["type"]]
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
    row = list(range(len(reference) + 1))
    for i, a in enumerate(candidate, 1):
        nxt = [i]
        for j, b in enumerate(reference, 1):
            nxt.append(min(nxt[-1] + 1, row[j] + 1, row[j-1] + (not same_action(a, b))))
        row = nxt
    return {"action_edit_distance": row[-1], "candidate_steps": len(candidate),
            "reference_steps": len(reference),
            "step_count_ratio": len(candidate) / len(reference) if reference else None}


# Transient service conditions worth waiting out. Plan/quota exhaustion and
# auth failures are deliberately absent: those do not clear in seconds.
RETRY_SIGNALS = (
    (r"\b429\b", "http 429"),
    (r"rate[ _-]?limit", "rate limit"),
    (r"too many requests", "too many requests"),
    (r"(?:status|code|http|error)\W{0,12}5(?:00|02|03|29)\b", "server error"),
    (r"internal server error", "server error"),
    (r"overloaded|over capacity|at capacity|insufficient capacity|no capacity",
     "capacity"),
    (r"server_error|service unavailable|temporarily unavailable", "service unavailable"),
    (r"connection reset|connection refused|connection closed|stream (?:error|disconnected)",
     "connection error"),
)


def retry_reason(turn_dir):
    """Name the transient condition in this attempt's logs, or None."""
    text = ""
    for name in ("stderr.log", "events.jsonl"):
        path = turn_dir / name
        if path.is_file():
            text += path.read_text(encoding="utf-8", errors="replace")[-40000:]
    text = text.lower()
    for pattern, label in RETRY_SIGNALS:
        if re.search(pattern, text):
            return label
    return None


def archive_attempt(turn_dir, attempt):
    """Move one failed attempt's artifacts aside so the retry starts clean."""
    archive = turn_dir / f"failed-attempt-{attempt:02d}"
    archive.mkdir(exist_ok=True)
    for name in ("events.jsonl", "stderr.log", "process.json", "response.json"):
        source = turn_dir / name
        if source.exists():
            shutil.move(str(source), str(archive / name))
    return archive


def ask_codex(args, prompt, manifest, turn_dir, workdir, schema_path, run=None):
    command = [args.codex_bin, "-a", "never", "exec", "--sandbox", "read-only",
               "--skip-git-repo-check", "--ephemeral", "--json", "-C", str(workdir),
               "-c", 'forced_login_method="chatgpt"', "-c", 'model_provider="openai"',
               "-c", "features.shell_tool=false", "-c", "features.unified_exec=false",
               "-c", 'web_search="disabled"', "--output-schema", str(schema_path),
               "--output-last-message", str(turn_dir / "response.json")]
    if args.reasoning_effort:
        command += ["-c", f'model_reasoning_effort="{args.reasoning_effort}"']
    # Request exposed reasoning without claiming access to private model internals.
    command += ["-c", "hide_agent_reasoning=false",
                "-c", "show_raw_agent_reasoning=true",
                "-c", "model_supports_reasoning_summaries=true",
                "-c", 'model_reasoning_summary="detailed"']
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
    attempts_allowed = args.max_retries + 1
    history = []
    for attempt in range(1, attempts_allowed + 1):
        started = time.monotonic()
        with (turn_dir / "events.jsonl").open("w") as stdout, (turn_dir / "stderr.log").open("w") as stderr:
            try:
                result = subprocess.run(command, input=prompt, text=True, env=environment,
                                        stdout=stdout, stderr=stderr, timeout=args.timeout)
            except subprocess.TimeoutExpired:
                write_json(turn_dir / "process.json",
                           {"timeout": True, "attempt": attempt, "duration_s": time.monotonic()-started})
                raise RuntimeError(f"Codex timed out; see {turn_dir / 'stderr.log'}") from None
        duration = time.monotonic() - started
        write_json(turn_dir / "process.json",
                   {"returncode": result.returncode, "attempt": attempt, "duration_s": duration})
        if not result.returncode:
            if history:
                write_json(turn_dir / "retries.json", history)
            return json.loads((turn_dir / "response.json").read_text())
        reason = retry_reason(turn_dir)
        archive = archive_attempt(turn_dir, attempt)
        record = {"attempt": attempt, "returncode": result.returncode, "reason": reason,
                  "duration_s": duration, "artifacts": archive.name}
        history.append(record)
        write_json(turn_dir / "retries.json", history)
        if run is not None:
            run.event("codex_retry", turn_dir=str(turn_dir), **record)
        if reason is None:
            raise RuntimeError(f"Codex exited {result.returncode}; see {archive / 'stderr.log'}")
        if attempt >= attempts_allowed:
            raise RuntimeError(f"Codex exited {result.returncode} ({reason}) on all {attempts_allowed} "
                               f"attempts; see {archive / 'stderr.log'}")
        wait = min(args.retry_max_wait, args.retry_wait * (2 ** (attempt - 1)))
        print(f"{turn_dir.parent.name}/{turn_dir.name}: codex exited {result.returncode} ({reason}); "
              f"waiting {wait:g}s then attempt {attempt + 1}/{attempts_allowed}; log {archive / 'stderr.log'}",
              flush=True)
        time.sleep(wait)


def episode(args, sample_id, browser, run_dir, workdir, schema_path, run):
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
    historical_images = {}
    run.system_prompt("agent", args.prompt_text)
    history, seen = [], Counter()
    termination, sample_calls, tool_calls = "turn_budget", 0, 0
    for turn in range(1, args.max_turns + 1):
        turn_dir = out / f"turn-{turn:03d}"
        turn_dir.mkdir()
        manifest = ({**fixed_images, **historical_images} if args.image_history == "all" else
                    {**fixed_images, **{f"current-{k}": v for k, v in current_images.items()}})
        prompt = (args.prompt_text + "\n\nFind the next action. Geometry and history:\n" +
                  json.dumps(model_view({"cp": cp, "target": target, "current": browser.artifacts()["state"],
                              "history": history, "turn": turn, "max_turns": args.max_turns})) +
                  "\nAttached images, in order:\n" + "\n".join(manifest))
        write_json(turn_dir / "images.json", manifest)
        print(f"{sample_id}: Codex turn {turn}/{args.max_turns}", flush=True)
        sample_calls += 1
        run.event("codex_request", turn=turn, model=args.model, reasoning_effort=args.reasoning_effort,
                  prompt_artifact=str(turn_dir / "prompt.md"), image_artifacts=manifest)
        response = ask_codex(args, prompt, manifest, turn_dir, workdir, schema_path, run)
        cli_events = read_jsonl(turn_dir / "events.jsonl")
        completed = [e for e in cli_events if e.get("type") == "turn.completed"]
        cli_usage = completed[-1].get("usage", {}) if completed else {}
        usage = {"prompt_tokens": cli_usage.get("input_tokens"),
                 "completion_tokens": cli_usage.get("output_tokens"),
                 "cached_input_tokens": cli_usage.get("cached_input_tokens")}
        summaries = [e["item"].get("text", "") for e in cli_events
                     if e.get("type") == "item.completed" and e.get("item", {}).get("type") == "reasoning"]
        process = json.loads((turn_dir / "process.json").read_text())
        run.sample("agent", text=json.dumps(response), content=json.dumps(response),
                   tool_calls=[response["action"]] if isinstance(response, dict) and
                   isinstance(response.get("action"), dict) else [],
                   thinking="\n".join(summaries) or None, usage=usage, finish="completed",
                   duration_s=process["duration_s"], cli_usage=cli_usage,
                   prompt_artifact=str(turn_dir / "prompt.md"), image_artifacts=manifest,
                   reasoning_kind="CLI-exposed summary; private reasoning unavailable")
        try:
            action = validate_action(response, args.tool_specs)
        except ValueError as exc:
            feedback = {"ok": False, "error": str(exc), "instruction": "Return one valid action; nothing executed."}
            history.append({"response": response, "result": feedback})
            write_json(turn_dir / "tool.json", feedback)
            write_json(out / "history.json", history)
            run.event("invalid_tool_turn", turn=turn, response=response, result=feedback)
            continue
        signature = json.dumps({"action": action, "state": browser.artifacts()["state"]}, sort_keys=True)
        seen[signature] += 1
        if seen[signature] > 3:
            termination = "repetition_detected"
            run.event("repetition_detected", turn=turn, action=action)
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
            historical_images.update({f"turn-{turn:03d}-{k}": v for k, v in current_images.items()})
        write_json(turn_dir / "feedback-images.json", current_images if images else {})
        write_json(turn_dir / "model-feedback.json", model_view(result))
        run.tool_result(requestor="agent", name=action["name"], error=not result.get("ok"),
                        content=json.dumps(model_view(result)), raw_result_artifact=str(turn_dir / "tool.json"),
                        image_artifacts=current_images if images else {})
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
              "reasoning_effort": args.reasoning_effort, "image_history": args.image_history,
              "tools": args.tools,
              "termination": termination, "sample_calls": sample_calls, "tool_calls": tool_calls,
              **artifacts["evaluation"], **sequence_metrics(artifacts["sequence"]["folds"], reference)}
    result["solved"] = termination == "finished" and result["pilot_match"]
    write_json(out / "result.json", result)
    run.episode_done(reward=float(result["solved"]), **result)
    run.artifact(result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", nargs="+", default=DEFAULT_SAMPLES)
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--out", type=Path, default=HERE / "runs")
    parser.add_argument("--prompt", type=Path, default=HERE / "codex_fold_prompt.md")
    parser.add_argument("--codex-bin", default="codex")
    parser.add_argument("--tools", choices=["base", "legal-folds"], default="base",
                        help="base keeps the original action set; legal-folds adds list_legal_folds "
                             "and its prompt appendix, which is a different experimental condition")
    parser.add_argument("--prompt-appendix", type=Path, default=HERE / "codex_fold_prompt_legal_folds.md",
                        help="Appended to --prompt only when --tools legal-folds")
    parser.add_argument("--model", help="An explicit model available to your Codex account; otherwise CLI default")
    parser.add_argument("--reasoning-effort", choices=["low", "medium", "high", "xhigh", "max"])
    parser.add_argument("--image-history", choices=["latest", "all"], default="latest",
                        help="all reattaches every prior feedback image, matching Tinker's visual history")
    parser.add_argument("--max-turns", type=int, default=40)
    parser.add_argument("--timeout", type=float, default=300, help="Seconds per Codex invocation")
    parser.add_argument("--max-retries", type=int, default=5,
                        help="Retries per turn after a rate-limit/capacity/transient CLI failure")
    parser.add_argument("--retry-wait", type=float, default=10,
                        help="Seconds before the first retry; doubled on each further retry")
    parser.add_argument("--retry-max-wait", type=float, default=120,
                        help="Upper bound on the backoff wait")
    add_image_options(parser)
    args = parser.parse_args()
    if args.max_turns < 1 or not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error("Require max-turns > 0 and finite timeout > 0")
    if args.max_retries < 0 or args.retry_wait <= 0 or args.retry_max_wait < args.retry_wait:
        parser.error("Require max-retries >= 0, retry-wait > 0, and retry-max-wait >= retry-wait")
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
    args.tool_specs = tools_for(args.tools)
    # The baseline prompt stays byte-identical under --tools base, so base runs remain
    # comparable with every run recorded before the enumerator existed.
    args.prompt_text = args.prompt.read_text()
    if args.tools == "legal-folds":
        args.prompt_appendix = args.prompt_appendix.expanduser().resolve()
        args.prompt_text += "\n" + args.prompt_appendix.read_text()
    for sample_id in args.samples:
        load_task(sample_id, args.corpus)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_dir = args.out / f"codex-{stamp}"
    run_dir.mkdir(parents=True)
    # The resolved schemas and prompt are saved whole as tools.json and prompt.md; repeating
    # them inline would bury the settings the config file exists to show.
    config_view = {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()
                   if k not in ("tool_specs", "prompt_text")}
    write_json(run_dir / "config.json", config_view)
    (run_dir / "prompt.md").write_text(args.prompt_text)
    schema_path = run_dir / "action.schema.json"
    write_json(schema_path, action_schema(args.tool_specs))
    write_json(run_dir / "tools.json", args.tool_specs)
    # CWD is outside the repository so project instructions/reference files are not auto-loaded.
    # This is context separation, not a filesystem security boundary.
    results = []
    config = dict(config_view)
    config["model_geometry_decimals"] = MODEL_GEOMETRY_DECIMALS
    print(json.dumps(config, indent=2), flush=True)
    with closing(Run("fold-pilot", config=config, root=args.out, run_name=run_dir.name)) as run, \
            tempfile.TemporaryDirectory(prefix="codex-fold-") as temporary, BrowserSession() as browser:
        workdir = Path(temporary)
        for sample_id in args.samples:
            try:
                with run.session(task=sample_id, trial=0):
                    try:
                        results.append(episode(args, sample_id, browser, run_dir, workdir, schema_path, run))
                        write_json(run_dir / "results.json", results)
                    except Exception as exc:
                        run.event("episode_error", error=str(exc), traceback=traceback.format_exc())
                        run.episode_done(reward=None, termination="error", error=str(exc))
                        raise
            except Exception as exc:
                error = {"sample_id": sample_id, "termination": "error", "error": str(exc),
                         "traceback": traceback.format_exc()}
                folder = run_dir / sample_id
                folder.mkdir(exist_ok=True)
                write_json(folder / "error.json", error)
                results.append(error)
                write_json(run_dir / "results.json", results)
                print(f"{sample_id}: {exc}", flush=True)
                # Auth/quota/CLI errors should stop the batch rather than retry every sample.
                break
    write_json(run_dir / "results.json", results)
    print(f"Saved: {run_dir}", flush=True)
    if any(r["termination"] == "error" for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
