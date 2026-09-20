"""Recover fold sequences by driving the Claude Code CLI in headless mode.

The Claude arm of the same experiment. It reuses codex_fold_loop's episode loop, prompt,
action schema, validation and stop conditions verbatim and swaps only the backend, so a
difference between the two arms is a difference between the models rather than between two
harnesses that drifted apart.

No Anthropic SDK and no API key: this shells out to `claude -p`, the documented headless mode,
against whatever credentials the CLI already has.
"""
import argparse
import base64
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SETUP = ROOT / "DHEERAJ_WORKSPACE/EXPERIMENT_SETUP"
sys.path.insert(0, str(SETUP))
from capture_fold import CORPUS, DEFAULT_SAMPLES, load_task, write_json, add_image_options
from tool_schemas import tools_for
from codex_fold_loop import (MODEL_GEOMETRY_DECIMALS, action_schema, archive_attempt,
                             retry_reason, run_batch)

# Claude Code's own tools are not part of this experiment. The model returns one JSON action
# per turn and the controller executes it against the simulator, exactly as in the Codex arm,
# so every built-in capability is denied: no shell, no filesystem, no web, no computer use,
# no MCP. --allowedTools "" is the allowlist; this is the belt to its braces, and it names the
# tools explicitly so a newly added built-in does not quietly become available.
DENIED_TOOLS = ("Bash", "Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "Glob", "Grep",
                "WebSearch", "WebFetch", "Task", "Agent", "TodoWrite", "KillShell", "BashOutput",
                "Computer", "ComputerUse", "SlashCommand", "SendUserMessage")


def ask_claude(args, prompt, manifest, turn_dir, workdir, schema_path, run=None):
    """One turn: hand Claude the prompt, get one schema-valid action back.

    Mirrors ask_codex's contract exactly -- same arguments, same return value, same retry
    policy, same artifacts on disk -- so codex_fold_loop.episode cannot tell which backend it
    is driving.

    PROMPT CACHING. Claude Code caches server-side on its own; there is no flag to enable it.
    What a caller controls is prefix stability, and this is built for it:
      * --system-prompt replaces the default prompt entirely, so no per-machine section (cwd,
        git status, memory paths) can vary between turns. That also makes
        --exclude-dynamic-system-prompt-sections unnecessary; it is ignored with a custom
        system prompt anyway.
      * The fold instructions live in the system prompt, byte-identical every turn.
      * The per-turn payload arrives on stdin, and inside it the stable parts (cp, target)
        are serialised before the volatile parts (current state, history, turn number), so the
        longest possible prefix repeats.
      * --no-session-persistence keeps each turn a clean, comparable request.
    Whether it actually lands is not assumed: usage is read back out of the result and written
    to process.json, so cache_read_input_tokens can be checked rather than hoped for.
    """
    schema = json.loads(Path(schema_path).read_text())
    # There is no --image flag, so the PNGs ride in as content blocks on a stream-json user
    # message -- verified by workspace/probe_claude_cli.sh, which got back a description of the
    # crease pattern. stream-json input requires stream-json output, hence --verbose and the
    # event-stream parsing below.
    command = [args.claude_bin, "-p",
               "--input-format", "stream-json",
               "--output-format", "stream-json",
               "--verbose",
               "--json-schema", json.dumps(schema, separators=(",", ":")),
               "--system-prompt", args.prompt_text,
               "--model", args.model,
               "--permission-mode", "dontAsk",
               "--no-session-persistence",
               "--strict-mcp-config",
               "--allowedTools", "",
               "--disallowedTools", *DENIED_TOOLS]
    if args.reasoning_effort:
        command += ["--effort", args.reasoning_effort]
    payload_in = stream_json_message(prompt, manifest if args.attach_images else {})
    (turn_dir / "prompt.md").write_text(prompt, encoding="utf-8")
    write_json(turn_dir / "command.json", command)
    environment = os.environ.copy()
    attempts_allowed = args.max_retries + 1
    history = []
    for attempt in range(1, attempts_allowed + 1):
        started = time.monotonic()
        with (turn_dir / "events.jsonl").open("w") as stdout, (turn_dir / "stderr.log").open("w") as stderr:
            try:
                result = subprocess.run(command, input=payload_in, text=True, env=environment,
                                        cwd=str(workdir), stdout=stdout, stderr=stderr,
                                        timeout=args.timeout)
            except subprocess.TimeoutExpired:
                write_json(turn_dir / "process.json",
                           {"timeout": True, "attempt": attempt, "duration_s": time.monotonic()-started})
                raise RuntimeError(f"Claude timed out; see {turn_dir / 'stderr.log'}") from None
        duration = time.monotonic() - started
        if not result.returncode:
            payload = result_event((turn_dir / "events.jsonl").read_text())
            usage = payload.get("usage") or {}
            write_json(turn_dir / "process.json", {
                "returncode": 0, "attempt": attempt, "duration_s": duration,
                "usage": usage,
                # The number to watch: zero across turns means the prefix is being invalidated.
                "cache_read_input_tokens": usage.get("cache_read_input_tokens"),
                "cache_creation_input_tokens": usage.get("cache_creation_input_tokens"),
                "total_cost_usd": payload.get("total_cost_usd")})
            if history:
                write_json(turn_dir / "retries.json", history)
            write_json(turn_dir / "response.json", structured_result(payload))
            return structured_result(payload)
        write_json(turn_dir / "process.json",
                   {"returncode": result.returncode, "attempt": attempt, "duration_s": duration})
        reason = retry_reason(turn_dir)
        archive = archive_attempt(turn_dir, attempt)
        record = {"attempt": attempt, "returncode": result.returncode, "reason": reason,
                  "duration_s": duration, "artifacts": archive.name}
        history.append(record)
        write_json(turn_dir / "retries.json", history)
        if run is not None:
            run.event("claude_retry", turn_dir=str(turn_dir), **record)
        if reason is None:
            raise RuntimeError(f"Claude exited {result.returncode}; see {archive / 'stderr.log'}")
        if attempt >= attempts_allowed:
            raise RuntimeError(f"Claude exited {result.returncode} ({reason}) on all {attempts_allowed} "
                               f"attempts; see {archive / 'stderr.log'}")
        wait = min(args.retry_max_wait, args.retry_wait * (2 ** (attempt - 1)))
        print(f"{turn_dir.parent.name}/{turn_dir.name}: claude exited {result.returncode} ({reason}); "
              f"waiting {wait:g}s then attempt {attempt + 1}/{attempts_allowed}; log {archive / 'stderr.log'}",
              flush=True)
        time.sleep(wait)


def stream_json_message(prompt, manifest):
    """One stream-json user message: the prompt, then the feedback PNGs as image blocks.

    Text first so the cacheable prefix is as long as possible, and the images in manifest
    order, which puts the fixed initial views ahead of the per-turn ones.
    """
    content = [{"type": "text", "text": prompt}]
    for info in manifest.values():
        path = Path(info["path"] if isinstance(info, dict) else info)
        content.append({"type": "image", "source": {
            "type": "base64", "media_type": "image/png",
            "data": base64.b64encode(path.read_bytes()).decode("ascii")}})
    return json.dumps({"type": "user", "message": {"role": "user", "content": content}}) + "\n"


def result_event(raw):
    """Find the terminal result object in whatever shape the CLI emitted.

    Three shapes have been seen: stream-json writes one JSON object per line; --output-format
    json returns an ARRAY of events (which is what broke the first run -- a list has no .get);
    and a single object is possible too. Parse defensively and take the last result event
    rather than assuming any one of them.
    """
    text = raw.strip()
    if not text:
        raise ValueError("Claude CLI produced no output")
    events = []
    try:
        parsed = json.loads(text)
        events = parsed if isinstance(parsed, list) else [parsed]
    except json.JSONDecodeError:
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    for event in reversed(events):
        if isinstance(event, dict) and event.get("type") == "result":
            return event
    for event in reversed(events):
        if isinstance(event, dict) and ("result" in event or "usage" in event):
            return event
    raise ValueError(f"No result event in CLI output; saw {len(events)} event(s)")


def structured_result(payload):
    """Pull the schema-constrained object out of the result event.

    --json-schema constrains the final answer; where it lands in the envelope has varied, so
    check the documented places and fall back to parsing the text field.
    """
    for key in ("structured_output", "structured_result", "parsed", "result_json"):
        if isinstance(payload.get(key), dict):
            return payload[key]
    text = payload.get("result")
    if isinstance(text, dict):
        return text
    if isinstance(text, str):
        stripped = text.strip()
        if stripped.startswith("```"):
            stripped = stripped.split("\n", 1)[-1].rsplit("```", 1)[0]
        return json.loads(stripped)
    raise ValueError(f"No structured output in CLI response; keys were {sorted(payload)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", nargs="+", default=DEFAULT_SAMPLES)
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--out", type=Path, default=HERE / "runs")
    parser.add_argument("--prompt", type=Path, default=HERE / "codex_fold_prompt.md")
    parser.add_argument("--claude-bin", default="claude")
    # The Claude arm exists to be compared with the Codex enumerator arm, so it defaults to the
    # same condition. base is accepted for a matching baseline, not as the default.
    parser.add_argument("--tools", choices=["legal-folds", "base"], default="legal-folds")
    parser.add_argument("--prompt-appendix", type=Path,
                        default=HERE / "codex_fold_prompt_legal_folds.md")
    parser.add_argument("--model", default="claude-opus-5",
                        help="Pinned model id. Aliases like opus/sonnet follow whatever is "
                             "newest, which would silently change what a benchmark measures.")
    parser.add_argument("--reasoning-effort", choices=["low", "medium", "high", "xhigh", "max"])
    parser.add_argument("--image-history", choices=["latest", "all"], default="latest")
    # On by default: an arm without the PNGs is not comparable to a Codex run using
    # --image-history all. Verified working over stream-json by workspace/probe_claude_cli.sh.
    parser.add_argument("--no-attach-images", dest="attach_images", action="store_false",
                        help="Run on geometry alone. Not comparable to an image-fed Codex arm.")
    parser.add_argument("--max-turns", type=int, default=40)
    parser.add_argument("--stuck-limit", type=int, default=5)
    parser.add_argument("--cycle-limit", type=int, default=3)
    parser.add_argument("--revisit-limit", type=int, default=15)
    parser.add_argument("--timeout", type=float, default=300)
    parser.add_argument("--max-retries", type=int, default=5)
    parser.add_argument("--retry-wait", type=float, default=10)
    parser.add_argument("--retry-max-wait", type=float, default=120)
    add_image_options(parser)
    args = parser.parse_args()
    if args.max_turns < 1 or not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error("Require max-turns > 0 and finite timeout > 0")
    if args.stuck_limit < 0 or args.cycle_limit < 0 or args.revisit_limit < 0:
        parser.error("Require stuck-limit, cycle-limit and revisit-limit >= 0")
    if args.max_retries < 0 or args.retry_wait <= 0 or args.retry_max_wait < args.retry_wait:
        parser.error("Require max-retries >= 0, retry-wait > 0, and retry-max-wait >= retry-wait")
    if len(args.samples) != len(set(args.samples)):
        parser.error("Sample IDs must be unique")
    executable = shutil.which(args.claude_bin)
    if not executable:
        parser.error("Claude Code CLI not found. Install it and run `claude` once to sign in.")
    args.claude_bin = executable
    args.ask = ask_claude
    args.out = args.out.expanduser().resolve()
    args.corpus = args.corpus.expanduser().resolve()
    args.prompt = args.prompt.expanduser().resolve()
    args.tool_specs = tools_for(args.tools)
    args.prompt_text = args.prompt.read_text()
    if args.tools == "legal-folds":
        args.prompt_text += "\n" + args.prompt_appendix.expanduser().resolve().read_text()
    for sample_id in args.samples:
        load_task(sample_id, args.corpus)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_dir = args.out / f"claude-{stamp}"
    run_dir.mkdir(parents=True)
    # Saved for the record and for the viewer; the same bytes go to --system-prompt on every
    # turn, which is what the prompt cache keys on.
    (run_dir / "prompt.md").write_text(args.prompt_text)
    schema_path = run_dir / "action.schema.json"
    write_json(schema_path, action_schema(args.tool_specs))
    write_json(run_dir / "tools.json", args.tool_specs)
    config_view = {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()
                   if k not in ("tool_specs", "prompt_text", "ask")}
    config_view["backend"] = "claude-code-cli"
    write_json(run_dir / "config.json", config_view)
    config = dict(config_view)
    config["model_geometry_decimals"] = MODEL_GEOMETRY_DECIMALS
    print(json.dumps(config, indent=2), flush=True)
    run_batch(args, config, run_dir, schema_path, [])


if __name__ == "__main__":
    main()
