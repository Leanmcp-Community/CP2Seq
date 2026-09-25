"""Prepare incremental inputs without changing the simulator or saved full history."""
import json
import re


def request_usage(total, previous):
    """Codex 0.155.1 exec reports thread totals, including inherited usage."""
    result = {}
    for key in ("input_tokens", "cached_input_tokens", "cache_write_input_tokens",
                "output_tokens", "reasoning_output_tokens"):
        current, before = total.get(key), previous.get(key, 0)
        result[key] = (current - before if isinstance(current, int) and
                       isinstance(before, int) and current >= before else None)
    return result


def thread_id(events):
    ids = [event.get("thread_id") for event in events
           if event.get("type") == "thread.started"]
    if not ids or not isinstance(ids[-1], str) or not re.fullmatch(
            r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", ids[-1]):
        raise RuntimeError("Codex did not report a valid persisted thread ID.")
    return ids[-1]


def incremental_input(history, current, turn, max_turns, manifest, previous_manifest):
    """Append one result and current observation; older inputs live in the thread.

    Manifests must retain their original order and immutable image metadata. Never
    silently switch an all-images episode to a truncated observation history.
    """
    old_names = list(previous_manifest)
    if list(manifest)[:len(old_names)] != old_names:
        raise RuntimeError("Image history is not append-only.")
    if any(manifest[name] != previous_manifest[name] for name in old_names):
        raise RuntimeError("A historical image changed during the episode.")
    if len(history) != turn - 1:
        raise RuntimeError("Expected one saved action/result per preceding turn.")
    images = {name: value for name, value in manifest.items() if name not in previous_manifest}
    payload = {"previous_action_and_result": history[-1], "current": current,
               "turn": turn, "max_turns": max_turns}
    prompt = ("Find the next action. New feedback and current state:\n" +
              json.dumps(payload) + "\nNew attached images, in order:\n" + "\n".join(images))
    return prompt, images
