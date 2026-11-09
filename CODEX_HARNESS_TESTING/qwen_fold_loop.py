"""Recover fold sequences with an open-weight model behind an OpenAI-compatible endpoint.

The Qwen arm of the generality experiment (H3: does fold-recovery skill scale with model size
within one family?). Like claude_fold_loop.py it reuses codex_fold_loop's episode loop, prompt,
action schema, validation and stop conditions verbatim and swaps only the backend, so a
difference between arms is a difference between models rather than between harnesses.

Transport: POST {base_url}/chat/completions, standard library only (no SDK). Any
OpenAI-compatible server works; the default is OpenRouter, and DashScope or a local vLLM server
are selected with --base-url / QWEN_BASE_URL:
  OpenRouter  https://openrouter.ai/api/v1                         key: OPENROUTER_API_KEY
  Fireworks   https://api.fireworks.ai/inference/v1                key: FIREWORKS_API_KEY
              model ids look like accounts/fireworks/models/qwen3-235b-a22b-thinking-2507
  DashScope   https://dashscope-intl.aliyuncs.com/compatible-mode/v1  key: DASHSCOPE_API_KEY
  vLLM        http://localhost:8000/v1                             key: none needed
The key is read from QWEN_API_KEY, then OPENROUTER_API_KEY, then DASHSCOPE_API_KEY. It is
never written to disk: request.json holds the body only, not the headers.

Each turn is one fresh request (system = the fold instructions, user = the per-turn prompt),
the same "fresh" conversation mode as the Codex and Claude arms. The reply is constrained to the
action schema with response_format json_schema where the server supports it (--json-mode
schema, the default); --json-mode object falls back to plain JSON mode for servers that reject
schemas. Either way codex_fold_loop validates the action exactly as for the other arms.
"""
import argparse
import base64
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import socket
import sys
import time
import urllib.error
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SETUP = ROOT / "DHEERAJ_WORKSPACE/EXPERIMENT_SETUP"
sys.path.insert(0, str(SETUP))
from capture_fold import CORPUS, DEFAULT_SAMPLES, load_task, write_json, add_image_options
from tool_schemas import tools_for
from codex_fold_loop import MODEL_GEOMETRY_DECIMALS, action_schema, archive_attempt, run_batch

KEY_VARS = ("QWEN_API_KEY", "FIREWORKS_API_KEY", "OPENROUTER_API_KEY", "DASHSCOPE_API_KEY")
RETRY_HTTP = {408, 409, 425, 429, 500, 502, 503, 504, 529}


class Transient(Exception):
    """A failure worth retrying: rate limit, server error, timeout, dropped connection,
    or a reply that was not a parseable JSON object."""


def api_key(base_url=""):
    """The key for this endpoint: a provider-specific variable first, so a .env holding several
    providers' keys never sends one provider's key to another."""
    specific = ("FIREWORKS_API_KEY" if "fireworks.ai" in base_url else
                "OPENROUTER_API_KEY" if "openrouter.ai" in base_url else
                "DASHSCOPE_API_KEY" if "dashscope" in base_url else None)
    if specific:
        return os.environ.get(specific) or os.environ.get("QWEN_API_KEY")
    for name in KEY_VARS:
        if os.environ.get(name):
            return os.environ[name]
    return None


def request_body(args, prompt, manifest, schema):
    if args.json_mode == "none":
        prompt += ("\n\nReturn the final action as one JSON object matching this schema:\n"
                   + json.dumps(schema))
    user = [{"type": "text", "text": prompt}]
    for info in manifest.values():
        path = Path(info["path"] if isinstance(info, dict) else info)
        data = base64.b64encode(path.read_bytes()).decode("ascii")
        user.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{data}"}})
    body = {"model": args.model,
            "messages": [{"role": "system", "content": args.prompt_text},
                         {"role": "user", "content": user if len(user) > 1 else prompt}],
            "max_tokens": args.max_output_tokens}
    if args.temperature is not None:
        body["temperature"] = args.temperature
    if args.json_mode == "schema":
        body["response_format"] = {"type": "json_schema", "json_schema": {
            "name": "fold_action", "strict": True, "schema": schema}}
    elif args.json_mode == "object":
        body["response_format"] = {"type": "json_object"}
    if args.openrouter:
        # Route only to providers that honour response_format, and report the billed cost.
        body["provider"] = {"require_parameters": True}
        body["usage"] = {"include": True}
        if args.reasoning_effort:
            body["reasoning"] = {"effort": args.reasoning_effort}
    elif args.reasoning_effort:
        body["reasoning_effort"] = args.reasoning_effort
    if args.disable_thinking:
        # Qwen3 hybrid models: vLLM/SGLang/DashScope read this switch from the request.
        body["chat_template_kwargs"] = {"enable_thinking": False}
        body["enable_thinking"] = False
    return body


def post(args, body, key):
    request = urllib.request.Request(
        args.base_url.rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json",
                 **({"Authorization": f"Bearer {key}"} if key else {})})
    try:
        with urllib.request.urlopen(request, timeout=args.timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:4000]
        if exc.code in RETRY_HTTP:
            raise Transient(f"http {exc.code}: {detail}") from None
        raise RuntimeError(f"HTTP {exc.code} from {args.base_url}: {detail}") from None
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError) as exc:
        raise Transient(f"connection error: {exc}") from None


def parse_action(reply):
    """The schema-constrained object from the first choice. Reasoning models sometimes wrap
    the JSON in a code fence or put prose around it, so take the outermost {...}."""
    choices = reply.get("choices") or []
    if not choices:
        raise Transient(f"no choices in reply: {str(reply)[:500]}")
    text = (choices[0].get("message") or {}).get("content") or ""
    # Thinking models served without a separate reasoning field (e.g. some Fireworks routes)
    # put the chain of thought inline as <think>...</think>; it may contain braces.
    if "</think>" in text:
        text = text.rsplit("</think>", 1)[1]
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise Transient(f"reply is not a JSON object: {text[:500]!r}")
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError as exc:
        raise Transient(f"invalid JSON in reply ({exc}): {text[:500]!r}") from None


def ask_qwen(args, prompt, manifest, turn_dir, workdir, schema_path, run=None):
    """One turn: same contract as ask_codex / ask_claude (arguments, return value, retry
    policy, artifacts on disk), so codex_fold_loop.episode cannot tell which backend it drives.

    events.jsonl gets one synthetic {"type": "turn.completed", "usage": ...} line in the Codex
    CLI's shape, which is where the episode loop reads token counts from.
    """
    schema = json.loads(Path(schema_path).read_text())
    body = request_body(args, prompt, manifest if args.attach_images else {}, schema)
    (turn_dir / "prompt.md").write_text(prompt, encoding="utf-8")
    logged = dict(body)
    logged["messages"] = [{"role": "system", "content": "<run_dir/prompt.md>"},
                          {"role": "user", "content": "<turn_dir/prompt.md>"
                           + (f" + {len(manifest)} image(s)" if args.attach_images and manifest else "")}]
    write_json(turn_dir / "command.json", {"endpoint": args.base_url, "body": logged})
    key = api_key(args.base_url)
    attempts_allowed = args.max_retries + 1
    history = []
    for attempt in range(1, attempts_allowed + 1):
        started = time.monotonic()
        reply = None
        try:
            reply = post(args, body, key)
            (turn_dir / "stderr.log").write_text("")
            action = parse_action(reply)
        except Transient as exc:
            duration = time.monotonic() - started
            (turn_dir / "stderr.log").write_text(str(exc))
            if reply is not None:
                write_json(turn_dir / "response.json", reply)
            write_json(turn_dir / "process.json",
                       {"returncode": 1, "attempt": attempt, "duration_s": duration})
            archive = archive_attempt(turn_dir, attempt)
            record = {"attempt": attempt, "returncode": 1, "reason": str(exc)[:200],
                      "duration_s": duration, "artifacts": archive.name}
            history.append(record)
            write_json(turn_dir / "retries.json", history)
            if run is not None:
                run.event("qwen_retry", turn_dir=str(turn_dir), **record)
            if attempt >= attempts_allowed:
                raise RuntimeError(f"Qwen failed on all {attempts_allowed} attempts; "
                                   f"last: {str(exc)[:300]}") from None
            wait = min(args.retry_max_wait, args.retry_wait * (2 ** (attempt - 1)))
            print(f"{turn_dir.parent.name}/{turn_dir.name}: {str(exc)[:120]}; waiting {wait:g}s "
                  f"then attempt {attempt + 1}/{attempts_allowed}", flush=True)
            time.sleep(wait)
            continue
        duration = time.monotonic() - started
        usage = reply.get("usage") or {}
        cached = (usage.get("prompt_tokens_details") or {}).get("cached_tokens")
        write_json(turn_dir / "response.json", reply)
        with (turn_dir / "events.jsonl").open("w") as events:
            events.write(json.dumps({"type": "turn.completed", "usage": {
                "input_tokens": usage.get("prompt_tokens"),
                "output_tokens": usage.get("completion_tokens"),
                "cached_input_tokens": cached}}) + "\n")
        write_json(turn_dir / "process.json", {
            "returncode": 0, "attempt": attempt, "duration_s": duration,
            "model_served": reply.get("model"), "provider": reply.get("provider"),
            "usage": usage, "total_cost_usd": usage.get("cost")})
        if history:
            write_json(turn_dir / "retries.json", history)
        return action


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", nargs="+", default=DEFAULT_SAMPLES)
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--out", type=Path, default=HERE / "runs")
    parser.add_argument("--prompt", type=Path, default=HERE / "codex_fold_prompt.md")
    parser.add_argument("--base-url", default=os.environ.get("QWEN_BASE_URL", "https://openrouter.ai/api/v1"))
    parser.add_argument("--model", required=True,
                        help="Exact model id on the endpoint, e.g. qwen/qwen3-32b on OpenRouter. "
                             "Pin it; do not rely on a 'latest' alias.")
    parser.add_argument("--tools", choices=["legal-folds", "base"], default="legal-folds")
    parser.add_argument("--prompt-appendix", type=Path,
                        default=HERE / "codex_fold_prompt_legal_folds.md")
    parser.add_argument("--reasoning-effort", choices=["low", "medium", "high"])
    parser.add_argument("--disable-thinking", action="store_true",
                        help="Turn Qwen3 thinking mode off (non-OpenRouter servers).")
    parser.add_argument("--temperature", type=float)
    parser.add_argument("--max-output-tokens", type=int, default=16384)
    parser.add_argument("--json-mode", choices=["schema", "object", "none"], default="schema")
    parser.add_argument("--image-history", choices=["latest", "all", "none"], default="none")
    parser.add_argument("--action-space", choices=["any", "all-layers"], default="any")
    parser.add_argument("--oracle-stop", action="store_true")
    parser.add_argument("--prompt-layout", choices=["legacy", "history-first"], default="history-first")
    parser.add_argument("--compare-tier", type=int, choices=[0, 1, 2, 3], default=0)
    parser.add_argument("--compare-auto", action="store_true")
    parser.add_argument("--max-turns", type=int, default=80)
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
    if args.max_retries < 0 or args.retry_wait <= 0 or args.retry_max_wait < args.retry_wait:
        parser.error("Require max-retries >= 0, retry-wait > 0, and retry-max-wait >= retry-wait")
    if len(args.samples) != len(set(args.samples)):
        parser.error("Sample IDs must be unique")
    args.openrouter = "openrouter.ai" in args.base_url
    if not api_key(args.base_url) and not args.base_url.startswith(("http://localhost", "http://127.0.0.1")):
        parser.error(f"No API key: set one of {', '.join(KEY_VARS)} (e.g. in .env).")
    args.attach_images = args.image_history != "none"
    args.ask = ask_qwen
    args.out = args.out.expanduser().resolve()
    args.corpus = args.corpus.expanduser().resolve()
    args.prompt = args.prompt.expanduser().resolve()
    args.tool_specs = tools_for(args.tools, args.compare_tier, args.action_space)
    args.prompt_text = args.prompt.read_text()
    if args.tools == "legal-folds":
        args.prompt_text += "\n" + args.prompt_appendix.expanduser().resolve().read_text()
    if args.action_space == "all-layers":
        args.prompt_text += "\n" + (HERE / "codex_fold_prompt_all_layers.md").read_text()
    if args.compare_tier:
        args.prompt_text += "\n" + (HERE / "codex_fold_prompt_compare.md").read_text()
    if args.compare_auto:
        args.prompt_text += "\n" + (HERE / "codex_fold_prompt_compare_auto.md").read_text()
    for sample_id in args.samples:
        load_task(sample_id, args.corpus)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_dir = args.out / f"qwen-{stamp}"
    run_dir.mkdir(parents=True)
    (run_dir / "prompt.md").write_text(args.prompt_text)
    schema_path = run_dir / "action.schema.json"
    write_json(schema_path, action_schema(args.tool_specs))
    write_json(run_dir / "tools.json", args.tool_specs)
    config_view = {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()
                   if k not in ("tool_specs", "prompt_text", "ask")}
    config_view["backend"] = "openai-compatible"
    write_json(run_dir / "config.json", config_view)
    config = dict(config_view)
    config["model_geometry_decimals"] = MODEL_GEOMETRY_DECIMALS
    print(json.dumps(config, indent=2), flush=True)
    run_batch(args, config, run_dir, schema_path, [])


if __name__ == "__main__":
    main()
