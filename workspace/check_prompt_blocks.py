"""Offline check for claude_fold_loop.prompt_blocks (no model call, no cost).

For every saved turn prompt of the paused Sonnet pilot:
  1. the blocks concatenate to exactly the original prompt (the model sees the same text);
  2. turn N+1's blocks start with turn N's blocks up to N's cache breakpoint, byte-identical
     (so the prefix N wrote to the cache is a prefix of what N+1 sends).

    .venv/bin/python workspace/check_prompt_blocks.py [run_dir]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "CODEX_HARNESS_TESTING"))
from claude_fold_loop import prompt_blocks  # noqa: E402

run = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "CODEX_HARNESS_TESTING/runs/claude-20261107T175727765597Z"
bad_concat = bad_prefix = fallback = checked = 0
for ep in sorted(p for p in run.iterdir() if p.is_dir() and (p / "turn-001").exists()):
    prev = None
    for turn in sorted(ep.glob("turn-*")):
        f = turn / "prompt.md"
        if not f.exists():
            continue
        prompt = f.read_text(encoding="utf-8")
        # Saved prompts of the paused pilot use the legacy layout (current before history).
        # New runs use history-first; rebuild that order so the check tests what will be sent.
        mark, tail_mark = "Geometry and history:\n", "\nAttached images, in order:\n"
        a = prompt.find(mark) + len(mark)
        b = prompt.find(tail_mark, a)
        p = json.loads(prompt[a:b])
        order = ["cp", "target", "history", "current", "turn", "max_turns"]
        p = {k: p[k] for k in order if k in p} | {k: v for k, v in p.items() if k not in order}
        prompt = prompt[:a] + json.dumps(p) + prompt[b:]
        blocks = prompt_blocks(prompt)
        checked += 1
        if len(blocks) == 1:
            fallback += 1
        if "".join(b["text"] for b in blocks) != prompt:
            bad_concat += 1
            print("CONCAT MISMATCH", turn)
        if prev is not None:
            cut = next(i for i, b in enumerate(prev) if "cache_control" in b) + 1
            if [b["text"] for b in blocks[:cut]] != [b["text"] for b in prev[:cut]]:
                bad_prefix += 1
                print("PREFIX BROKEN", turn)
        prev = blocks
print(f"turns checked {checked}; single-block fallbacks {fallback}; "
      f"concat mismatches {bad_concat}; broken prefixes {bad_prefix}")
print("OK" if checked and not (bad_concat or bad_prefix or fallback) else "CHECK FAILED")
