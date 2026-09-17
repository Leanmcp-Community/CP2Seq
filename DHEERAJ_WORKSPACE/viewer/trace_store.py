"""Read saved model traces on demand, including partially completed runs."""
import json
from pathlib import Path
import re

MAX_FILE_BYTES = 64 * 1024 * 1024
ALLOWED_SUFFIXES = {".json", ".jsonl", ".png", ".jpeg", ".jpg", ".md", ".txt", ".fold"}


def confined(root, relative):
    if not relative or Path(relative).is_absolute():
        raise ValueError("Expected a relative artifact path")
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("Artifact is outside the trace folder")
    return path


def trace_run(root, run):
    directory = confined(root, run)
    if directory.parent != root.resolve() or not directory.is_dir():
        raise ValueError("Unknown trace run")
    return directory


def read_optional(path):
    if not path.is_file():
        return None
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("Trace file exceeds 64 MiB viewer limit")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        # Files can be observed while the experiment is writing them.
        return None


def list_traces(root):
    rows, errors = [], []
    if not root.is_dir():
        return {"runs": [], "errors": [], "root": str(root)}
    for directory in sorted(root.iterdir(), reverse=True):
        if not directory.is_dir() or directory.is_symlink():
            continue
        if not ((directory / "config.json").is_file() or (directory / "response.json").is_file()):
            continue
        try:
            config = read_optional(directory / "config.json") or read_optional(directory / "response.json") or {}
            # obs.Run stores config under its config key in some versions.
            config = config.get("config", config)
            rows.append({"id": directory.name, "model": config.get("model", "unknown"),
                         "thinking": config.get("thinking"),
                         "modified": directory.stat().st_mtime})
        except (OSError, ValueError) as exc:
            errors.append(f"{directory.name}: {exc}")
    rows.sort(key=lambda r: r["modified"], reverse=True)
    return {"runs": rows[:500], "truncated": len(rows) > 500, "errors": errors, "root": str(root)}


def trace_index(root, run):
    directory = trace_run(root, run)
    samples = []
    for sample in sorted(directory.iterdir()):
        if not sample.is_dir() or sample.is_symlink() or sample.name in ("episodes", "wire-assets"):
            continue
        turns = sorted({int(m.group(1)) for path in sample.glob("turn-*.json")
                        if (m := re.fullmatch(r"turn-(\d+)-[a-z]+\.json", path.name))})
        if not turns and not (sample / "error.json").exists() and not (sample / "meta.json").exists():
            continue
        samples.append({"id": sample.name, "turns": turns,
                        "modified": max((p.stat().st_mtime_ns for p in sample.iterdir() if p.is_file()), default=0),
                        "result": read_optional(sample / "result.json"),
                        "error": read_optional(sample / "error.json")})
    return {"id": run, "directory": str(directory), "samples": samples,
            "config": read_optional(directory / "config.json"),
            "legacy_image": read_optional(directory / "response.json"),
            "files": sorted(p.name for p in directory.iterdir() if p.is_file() and p.suffix in ALLOWED_SUFFIXES)}


def artifact_path(root, run, relative):
    directory = trace_run(root, run)
    path = confined(directory, relative)
    if not path.is_file() or path.suffix not in ALLOWED_SUFFIXES:
        raise FileNotFoundError("Trace artifact not found")
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("Trace file exceeds 64 MiB viewer limit")
    return path
