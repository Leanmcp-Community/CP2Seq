"""Resume one interrupted episode by replaying saved responses, then requesting new turns.

Run only after stopping the original worker. Original artifacts are never modified.
Uses the existing episode loop so revisions, counters and history are reconstructed.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

import codex_fold_loop as harness


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("episode", type=Path, help="Existing run/sample directory")
    options = parser.parse_args()
    source = options.episode.expanduser().resolve()
    if (source / "result.json").exists():
        parser.error("This episode already has a final result; it must not be resumed.")
    config = json.loads((source.parent / "config.json").read_text())
    if not (source / "cp.fold").exists():
        parser.error("No saved episode inputs found.")
    cp, target = harness.load_task(source.name, Path(config["corpus"]))
    for filename, actual in (("cp.fold", cp), ("target.fold", target)):
        if json.loads((source / filename).read_text()) != actual:
            parser.error(f"Dataset differs from saved {filename}; refusing resume.")
    saved_prompt = (source.parent / "prompt.md").read_text()
    saved_tools = json.loads((source.parent / "tools.json").read_text())
    turns = sorted(source.glob("turn-[0-9][0-9][0-9]"))
    cached = {}
    for number, folder in enumerate(turns, 1):
        if folder.name != f"turn-{number:03d}":
            parser.error("Saved turns are not contiguous.")
        process_file, response_file = folder / "process.json", folder / "response.json"
        if not process_file.exists() or not response_file.exists():
            break
        process = json.loads(process_file.read_text())
        if process.get("returncode") != 0:
            break
        cached[folder.name] = json.loads(response_file.read_text())
    if not cached:
        parser.error("No successful saved responses to resume from.")
    if any(int(t.name.split('-')[1]) > len(cached) + 1 for t in turns):
        parser.error("Incomplete artifacts precede later turns; refusing to discard history.")
    print(f"Replaying {len(cached)} saved responses without model calls. "
          f"First new request: turn {len(cached)+1}/{config['max_turns']}.", flush=True)
    original_ask = harness.ask_codex

    def ask(args, prompt, manifest, turn_dir, workdir, schema_path, run=None):
        if args.prompt_text != saved_prompt or args.tool_specs != saved_tools:
            raise RuntimeError("Prompt or tool schemas changed since the source run.")
        original_turn = source / turn_dir.name
        new_episode = turn_dir.parent
        # At each boundary check the preceding reconstructed tool result, including revisions.
        previous = int(turn_dir.name.split('-')[1]) - 1
        if previous:
            old_tool = source / f"turn-{previous:03d}" / "tool.json"
            new_tool = new_episode / f"turn-{previous:03d}" / "tool.json"
            if old_tool.exists() and json.loads(old_tool.read_text()) != json.loads(new_tool.read_text()):
                raise RuntimeError(f"Replay diverged from saved tool result at turn {previous}.")
        old_prompt = original_turn / "prompt.md"
        if old_prompt.exists():
            # Only the output directory changes; all model-visible text must otherwise agree.
            normalized = prompt.replace(str(new_episode), str(source))
            if normalized != old_prompt.read_text():
                raise RuntimeError(f"State/history prompt differs at {turn_dir.name}; refusing lossy resume.")
        old_manifest_file = original_turn / "images.json"
        if old_manifest_file.exists():
            old_manifest = json.loads(old_manifest_file.read_text())
            if list(old_manifest) != list(manifest):
                raise RuntimeError("Image history/order differs from saved run.")
            for name, item in manifest.items():
                original_image = Path(old_manifest[name]["path"])
                if not original_image.exists():
                    raise RuntimeError(f"Missing original observation: {original_image}")
                # Require exact pixels/encoding; a changed renderer must not silently alter inputs.
                digest = lambda p: hashlib.sha256(Path(p).read_bytes()).digest()
                if digest(original_image) != digest(item["path"]):
                    raise RuntimeError(f"Re-rendered observation differs: {name}")
        harness.write_json(new_episode.parent / "resume.json", {
            "source_episode": str(source), "replayed_responses": len(cached),
            "first_new_turn": len(cached)+1,
            "note": "Replayed turns reuse historical usage, not new billed model calls."})
        if turn_dir.name in cached:
            (turn_dir / "prompt.md").write_text(prompt)
            for filename in ("events.jsonl", "process.json", "response.json", "stderr.log", "command.json"):
                src = original_turn / filename
                if src.exists():
                    shutil.copy2(src, turn_dir / filename)
            harness.write_json(turn_dir / "replayed-from.json", {"source": str(original_turn)})
            print(f"{turn_dir.name}: using saved response (no model call)", flush=True)
            return cached[turn_dir.name]
        return original_ask(args, prompt, manifest, turn_dir, workdir, schema_path, run)

    # Restore the original settings. Do not extend budgets or change image/history conditions.
    flags = ["corpus", "out", "prompt", "codex_bin", "compare_tier", "action_space", "tools",
             "prompt_appendix", "model", "reasoning_effort", "image_history", "max_turns",
             "stuck_limit", "cycle_limit", "revisit_limit", "timeout", "max_retries",
             "retry_wait", "retry_max_wait", "render_size", "max_image_edge", "max_image_bytes"]
    # Older configs predate this option. Preserve their exact prompt order during replay.
    argv = [str(Path(harness.__file__)), "--samples", source.name,
            "--prompt-layout", config.get("prompt_layout", "legacy")]
    for name in flags:
        if name in config and config[name] is not None:
            argv += ["--" + name.replace("_", "-"), str(config[name])]
    if config.get("compare_auto"):
        argv.append("--compare-auto")
    harness.ask_codex = ask
    sys.argv = argv
    harness.main()


if __name__ == "__main__":
    main()
