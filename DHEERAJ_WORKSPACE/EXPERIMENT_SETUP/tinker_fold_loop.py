"""Two-example Qwen3.5-9B native-vision/tool pilot. No training or oracle actions."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import time
import traceback

from capture_fold import (HERE, CORPUS, DEFAULT_SAMPLES, BrowserSession, load_task,
                          save_images, write_json, add_image_options)
from image_assets import check_prompt_assets
from observability.obs import Run
from tinker_describe_image import MODEL, progress, response_record
from tool_schemas import TOOLS
from action_compare import same_action
from repetition_guard import detect_repetition, MAX_OCCURRENCES


def parsed_text(message):
    parts = message.get("content", [])
    if isinstance(parts, str):
        return "", parts
    thinking = "\n".join(p.get("thinking", p.get("text", "")) for p in parts if p.get("type") == "thinking")
    content = "\n".join(p.get("text", "") for p in parts if p.get("type") == "text")
    return thinking, content


def package_versions(parser):
    versions = {}
    for package in ("tinker", "tinker-cookbook", "playwright", "Pillow"):
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            instructions = (".venv/bin/python -m pip install playwright\n"
                            ".venv/bin/python -m playwright install chromium") if package == "playwright" else (
                                f".venv/bin/python -m pip install {package}")
            parser.error(f"Missing dependency: {package}. Run from the repository root:\n{instructions}")
    return versions


def archive(value):
    """Serialize conversations without replacing image artifacts with repr(PIL)."""
    if isinstance(value, dict):
        return {k: archive(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [archive(v) for v in value]
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "size") and hasattr(value, "info"):
        return {"image_path": value.info.get("artifact_path"), "dimensions": list(value.size)}
    return value


def image_parts(manifest):
    from PIL import Image
    parts = []
    for name, info in manifest.items():
        with Image.open(info["path"]) as source:
            picture = source.convert("RGB")
        picture.info["artifact_path"] = info["path"]
        parts.extend([{"type": "text", "text": name}, {"type": "image", "image": picture}])
    return parts


def record_prompt(prompt, directory, tokenizer):
    """Exact text tokens and exact encoded assets, preserving chunk boundaries."""
    chunks = []
    for chunk in prompt.chunks:
        if chunk.type == "image":
            digest = hashlib.sha256(chunk.data).hexdigest()
            path = directory / "wire-assets" / f"{digest}.{chunk.format}"
            path.parent.mkdir(exist_ok=True)
            if not path.exists():
                path.write_bytes(chunk.data)
            chunks.append({"type": "image", "path": str(path), "sha256": digest,
                           "bytes": len(chunk.data), "expected_tokens": chunk.expected_tokens})
        else:
            chunks.append({"type": chunk.type, "tokens": list(chunk.tokens),
                           "text": tokenizer.decode(chunk.tokens, skip_special_tokens=False)})
    return chunks


def sequence_metrics(candidate, reference):
    row = list(range(len(reference) + 1))
    for i, a in enumerate(candidate, 1):
        nxt = [i]
        for j, b in enumerate(reference, 1):
            nxt.append(min(nxt[-1] + 1, row[j] + 1, row[j - 1] + (not same_action(a, b))))
        row = nxt
    return {"action_edit_distance": row[-1], "reference_steps": len(reference),
            "candidate_steps": len(candidate),
            "step_count_ratio": len(candidate) / len(reference) if reference else None}


def save_candidate(out, artifacts, sample_id):
    write_json(out / "seq.json", artifacts["sequence"])
    write_json(out / "steps.fold", artifacts["steps"])
    final = artifacts["steps"]["file_frames"][-1]
    write_json(out / "final.fold", {"file_spec": 1.1, **{k: v for k, v in final.items()
                                                        if k not in ("frame_parent", "frame_inherit")}})
    write_json(out / "meta.json", {"id": sample_id, "stratum": "model-candidate", "metrics": {
        "steps": artifacts["sequence"]["steps"], "layers_final": len(final["faces_vertices"])}})


def episode(args, sample_id, browser, renderer, tokenizer, sampler, context_limit, run):
    import tinker
    out = run.dir / sample_id
    out.mkdir()
    cp, target = load_task(sample_id, args.corpus)
    initial = browser.init(cp, target, args.render_size)
    manifest = save_images(initial["images"], out / "initial", max_edge=args.max_image_edge,
                           max_bytes=args.max_image_bytes)
    write_json(out / "cp.fold", cp)
    write_json(out / "target.fold", target)
    save_candidate(out, browser.artifacts(), sample_id)
    policy = (HERE / "fold_prompt.md").read_text()
    messages = renderer.create_conversation_prefix_with_tools(TOOLS, system_prompt=policy)
    messages.append({"role": "user", "content": [
        {"type": "text", "text": "Find the fold sequence. Geometry:\n" + json.dumps(
            {"cp": cp, "target": target, "current": initial["state"]})}, *image_parts(manifest)]})
    run.system_prompt("agent", messages[0]["content"])
    usage = {"prompt_tokens": 0, "completion_tokens": 0, "estimated_uncached_usd": 0.0}
    termination = "turn_budget"
    tool_calls = 0
    token_budget = args.max_tokens
    sample_calls = 0
    repetition = None
    for turn in range(1, args.max_turns + 1):
        write_json(out / f"turn-{turn:03d}-messages.json", archive(messages))
        prompt = renderer.build_generation_prompt(messages)
        sizes = check_prompt_assets(prompt, args.max_image_bytes)
        n_prompt = prompt.length
        if n_prompt + token_budget > context_limit:
            termination = "context_budget"
            run.event("context_budget", prompt_tokens=n_prompt, max_tokens=token_budget, limit=context_limit)
            break
        write_json(out / f"turn-{turn:03d}-prompt.json", record_prompt(prompt, out, tokenizer))
        write_json(out / f"turn-{turn:03d}-request.json", {
            "model": MODEL, "renderer": "qwen3_5" if args.thinking else "qwen3_5_disable_thinking",
            "thinking_enabled": args.thinking, "max_tokens": token_budget,
            "temperature": args.temperature, "seed": args.seed + turn,
            "stop": renderer.get_stop_sequences(), "prompt_tokens": n_prompt,
            "image_bytes": sizes, "started_at": datetime.now(timezone.utc).isoformat()})
        with progress(f"{sample_id}: turn {turn}/{args.max_turns}, {n_prompt} prompt tokens, {len(sizes)} images"):
            started = time.monotonic()
            response = sampler.sample(prompt=prompt, num_samples=1,
                sampling_params=tinker.types.SamplingParams(max_tokens=token_budget,
                    temperature=args.temperature, seed=args.seed + turn, stop=renderer.get_stop_sequences())).result()
            elapsed = time.monotonic() - started
        sample_calls += 1
        sequence = response.sequences[0]
        raw = tokenizer.decode(sequence.tokens, skip_special_tokens=False)
        write_json(out / f"turn-{turn:03d}-response.json", {"raw_text": raw, **response_record(response)})
        repetition = detect_repetition(raw)
        cost = (n_prompt * .66 + len(sequence.tokens) * 1.995) / 1_000_000
        usage["prompt_tokens"] += n_prompt
        usage["completion_tokens"] += len(sequence.tokens)
        usage["estimated_uncached_usd"] += cost
        try:
            message, parsed_end = renderer.parse_response(sequence.tokens)
            parsed_clean = getattr(parsed_end, "is_clean", bool(parsed_end))
        except Exception as exc:
            message, parsed_clean = {"role": "assistant", "content": raw}, False
            run.event("parse_error", error=str(exc))
        calls = message.get("tool_calls", [])
        thinking, content = parsed_text(message)
        thinking_complete = not (args.thinking and str(sequence.stop_reason) == "length" and "</think>" not in raw)
        if not thinking_complete:
            # This renderer prefills <think>; a truncated completion may lack both tags.
            thinking, content = raw, ""
        write_json(out / f"turn-{turn:03d}-parsed.json", {
            "message": archive(message), "thinking": thinking, "content": content,
            "thinking_complete": thinking_complete,
            "repetition": repetition,
            "thinking_enabled": args.thinking, "parse_clean": parsed_clean,
            "stop_reason": str(sequence.stop_reason), "duration_s": elapsed,
            "prompt_tokens": n_prompt, "completion_tokens": len(sequence.tokens),
            "estimated_uncached_usd": cost})
        call_records = [c.model_dump(mode="json") for c in calls]
        normalized_calls = []
        for c in calls:
            try:
                arguments = json.loads(c.function.arguments)
            except (ValueError, TypeError):
                arguments = c.function.arguments
            normalized_calls.append({"id": c.id, "name": c.function.name, "arguments": arguments})
        previous_echo = run.echo_mode
        if repetition:
            run.echo_mode = "off"  # Save full traces without flooding the terminal.
        try:
            run.sample("agent", completion_tokens=sequence.tokens, text=raw,
                       thinking=thinking, content=content,
                       finish=str(sequence.stop_reason), tool_calls=normalized_calls,
                       usage={"prompt_tokens": n_prompt, "completion_tokens": len(sequence.tokens)},
                       cost=cost, duration_s=elapsed, prompt_artifact=str(out / f"turn-{turn:03d}-prompt.json"))
        finally:
            run.echo_mode = previous_echo
        if repetition:
            termination = "repetition_detected"
            write_json(out / f"turn-{turn:03d}-repetition.json", repetition)
            run.event("repetition_detected", turn=turn, **repetition)
            print(f"Stopped: the same {repetition['unit']} appeared more than {MAX_OCCURRENCES} times. "
                  "No tools executed from this response; full output saved.", flush=True)
            break
        if str(sequence.stop_reason) == "length":
            # Never execute a partial tool call. A retry consumes the next turn budget.
            if token_budget >= 8192:
                termination = "output_token_limit"
                run.event("output_token_limit", turn=turn, max_tokens=token_budget,
                          detail="Stopped after truncation at the maximum output budget; no partial tool executed")
                print("Output limit reached before a complete response; stopping this episode without repeating the same prompt.", flush=True)
                break
            run.event("truncation_retry", turn=turn, previous_max_tokens=token_budget)
            token_budget = min(token_budget * 2, 8192)
            continue
        if not parsed_clean or message.get("unparsed_tool_calls") or not calls:
            run.event("invalid_tool_turn", turn=turn, parsed=archive(message))
            messages.extend([{"role": "assistant", "content": tokenizer.decode(sequence.tokens, skip_special_tokens=True)},
                             {"role": "user", "content": "No tool was executed. Send exactly one complete tool call using the supplied schema."}])
            continue
        messages.append(message)
        if len(calls) != 1:
            rejected = []
            for call in calls:
                result = {"ok": False, "error": "ONE_TOOL_AT_A_TIME: no calls from this turn were executed"}
                messages.append({"role": "tool", "name": call.function.name, "tool_call_id": call.id or "",
                                 "content": json.dumps(result)})
                run.tool_result(requestor="agent", name=call.function.name, error=True, content=json.dumps(result))
                rejected.append(result)
            write_json(out / f"turn-{turn:03d}-tool.json", {"calls": call_records, "results": rejected})
            continue
        call = calls[0]
        tool_calls += 1
        try:
            arguments = json.loads(call.function.arguments)
            if not isinstance(arguments, dict):
                raise ValueError("Tool arguments must be an object")
            result = browser.call(call.function.name, arguments)
        except (ValueError, TypeError) as exc:
            result = {"ok": False, "error": str(exc)}
        images = result.pop("images", {})
        # Persist the tool result before image capture, so render errors cannot erase it.
        write_json(out / f"turn-{turn:03d}-tool.json", {"call": call_records[0], "result": result})
        # Mutations return fresh visual feedback automatically; get_images also works alone.
        if result.get("ok") and call.function.name in ("add_fold", "remove_fold", "go_to_step", "restore_revision"):
            images = browser.call("get_images")["images"]
        image_manifest = save_images(images, out / f"turn-{turn:03d}-images", max_edge=args.max_image_edge,
                                     max_bytes=args.max_image_bytes) if images else {}
        result["image_artifacts"] = image_manifest
        write_json(out / f"turn-{turn:03d}-tool.json", {"call": call_records[0], "result": result})
        run.tool_result(requestor="agent", name=call.function.name, tool_call_id=call.id,
                        error=not result.get("ok"), content=json.dumps(result))
        # Paths are for local traces only, not model-visible filenames.
        public_result = {k: v for k, v in result.items() if k != "image_artifacts"}
        messages.append({"role": "tool", "name": call.function.name, "tool_call_id": call.id or "",
                         "content": [{"type": "text", "text": json.dumps(public_result)}, *image_parts(image_manifest)]})
        artifacts = browser.artifacts()
        save_candidate(out, artifacts, sample_id)
        if result.get("finished"):
            termination = "finished"
            break
    artifacts = browser.artifacts()
    save_candidate(out, artifacts, sample_id)
    final_images = browser.call("get_images")["images"]
    save_images(final_images, out / "final", max_edge=args.max_image_edge, max_bytes=args.max_image_bytes)
    write_json(out / "messages.json", archive(messages))
    # Evaluation only, after the last model call. Never insert reference actions into context.
    reference = json.loads((args.corpus / sample_id / "seq.json").read_text())["folds"]
    result = {"sample_id": sample_id, "model": MODEL, "termination": termination,
              "sample_calls": sample_calls, "tool_calls": tool_calls, "repetition": repetition, **artifacts["evaluation"],
              **sequence_metrics(artifacts["sequence"]["folds"], reference), "usage": usage}
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
    parser.add_argument("--max-turns", type=int, default=40)
    parser.add_argument("--max-tokens", type=int, default=4096)
    parser.add_argument("--context-limit", type=int, default=65536)
    parser.add_argument("--temperature", type=float, default=0)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--thinking", action=argparse.BooleanOptionalAction, default=True,
                        help="Enable and record Qwen-emitted thinking (default); --no-thinking preserves the original mode")
    add_image_options(parser)
    args = parser.parse_args()
    args.out = args.out.expanduser().resolve()
    if not os.environ.get("TINKER_API_KEY", "").strip():
        parser.error("TINKER_API_KEY is not set")
    if args.max_turns < 1 or not 1 <= args.max_tokens <= 8192 or args.context_limit < args.max_tokens:
        parser.error("Require max-turns > 0, max-tokens in 1..8192, context-limit >= max-tokens")
    if len(args.samples) != len(set(args.samples)):
        parser.error("Sample IDs must be unique")
    for sample_id in args.samples:
        load_task(sample_id, args.corpus)
    config = {**{k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()},
              "model": MODEL, "renderer": "qwen3_5" if args.thinking else "qwen3_5_disable_thinking", "training": False,
              "terminal_metric": "strict fixed-coordinate pilot", "input_rate_per_million": .66,
              "output_rate_per_million": 1.995,
              "repetition_max_occurrences": MAX_OCCURRENCES,
              "packages": package_versions(parser)}
    print(json.dumps(config, indent=2), flush=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run = Run("fold-pilot", config=config, root=args.out, run_name=f"qwen-9b-{stamp}")
    (run.dir / "prompt.md").write_text((HERE / "fold_prompt.md").read_text())
    write_json(run.dir / "tools.json", TOOLS)
    results = []
    try:
        # Confirm rendering works before creating a paid sampler.
        with BrowserSession() as browser:
            browser.init(*load_task(args.samples[0], args.corpus), args.render_size)
            with progress("Loading Tinker, tokenizer and vision renderer"):
                import tinker
                from tinker_cookbook import renderers
                from tinker_cookbook.image_processing_utils import get_image_processor
                from tinker_cookbook.tokenizer_utils import get_tokenizer
                tokenizer = get_tokenizer(MODEL)
                renderer = renderers.get_renderer(config["renderer"], tokenizer=tokenizer,
                                                   image_processor=get_image_processor(MODEL))
                service = tinker.ServiceClient()
                capabilities = service.get_server_capabilities()
                supported = next((m for m in capabilities.supported_models if m.model_name == MODEL), None)
                if supported is None or supported.sampleable is False:
                    raise RuntimeError(f"{MODEL} is not available for sampling")
                served_limit = supported.max_context_length
                if not served_limit or args.context_limit > served_limit:
                    raise RuntimeError(f"Requested context {args.context_limit}; server reports {served_limit}")
                write_json(run.dir / "capabilities.json", capabilities.model_dump(mode="json"))
                sampler = service.create_sampling_client(base_model=MODEL)
            for sample_id in args.samples:
                with run.session(task=sample_id, trial=args.seed):
                    try:
                        results.append(episode(args, sample_id, browser, renderer, tokenizer,
                                               sampler, args.context_limit, run))
                    except Exception as exc:
                        error = {"sample_id": sample_id, "termination": "error", "error": str(exc),
                                 "traceback": traceback.format_exc()}
                        folder = run.dir / sample_id
                        folder.mkdir(exist_ok=True)
                        write_json(folder / "error.json", error)
                        run.event("episode_error", **error)
                        run.episode_done(reward=None, **error)
                        results.append(error)
                        print(f"{sample_id}: {exc}", flush=True)
            write_json(run.dir / "results.json", results)
    finally:
        run.close()
    print(f"Saved: {run.dir.resolve()}", flush=True)
    if any(r["termination"] == "error" for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
