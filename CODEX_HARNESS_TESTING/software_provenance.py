"""Capture local Codex identity at run startup; no model or network requests."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess


# Verified official release tag, documented in PAPER_FINAL/iclr2026/SOFTWARE_PROVENANCE.md.
# This identifies release source, not a proven reproducible build of the local binary.
RELEASE_COMMITS = {
    "0.155.1": "be2951ea34f0d295ed0becf97079f92fa5f6950e",
}


def file_identity(path):
    path = Path(path).resolve(strict=True)
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return {"path": str(path), "sha256": digest.hexdigest(), "size_bytes": path.stat().st_size}


def codex_provenance(executable):
    selected = Path(executable).absolute()
    resolved = selected.resolve(strict=True)
    result = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "executable": str(selected), "launcher": file_identity(resolved),
        "version": None, "version_output": None, "native_binaries": [],
        "release_tag": None, "release_source_commit": None,
        "errors": [],
    }
    try:
        probe = subprocess.run([str(selected), "--version"], capture_output=True,
                               text=True, timeout=10, check=True)
        result["version_output"] = probe.stdout.strip()
        match = re.search(r"\bcodex(?:-cli)?\s+(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)",
                          probe.stdout)
        if match:
            result["version"] = match.group(1)
    except (OSError, subprocess.SubprocessError) as exc:
        result["errors"].append(f"Version probe: {exc}")

    # npm's entry point is a JS launcher. Hash the installed native payloads too,
    # including optional packages nested under its package root.
    package_root = resolved.parent.parent
    manifest = package_root / "package.json"
    if resolved.suffix == ".js" and manifest.is_file():
        try:
            package = json.loads(manifest.read_text())
            if package.get("name") == "@openai/codex":
                result["package_version"] = package.get("version")
                result["package_manifest"] = file_identity(manifest)
                candidates = set()
                roots = [package_root / "vendor"]
                # Follow Node's ancestor node_modules lookup, including hoisted deps.
                for ancestor in package_root.parents:
                    scoped = ancestor / "node_modules" / "@openai"
                    if scoped.is_dir():
                        roots.extend(p / "vendor" for p in scoped.glob("codex-*") if p.is_dir())
                scoped = package_root / "node_modules" / "@openai"
                if scoped.is_dir():
                    roots.extend(p / "vendor" for p in scoped.glob("codex-*") if p.is_dir())
                for root in roots:
                    for name in ("*/bin/codex", "*/bin/codex.exe", "*/codex/codex", "*/codex/codex.exe"):
                        candidates.update(p.resolve() for p in root.glob(name) if p.is_file())
                result["native_binaries"] = [file_identity(p) for p in sorted(candidates)]
                if not candidates:
                    result["errors"].append("Native payload not located; launcher hash recorded.")
        except (OSError, ValueError) as exc:
            result["errors"].append(f"Package inspection: {exc}")
    else:
        with resolved.open("rb") as stream:
            header = stream.read(4)
        if header.startswith(b"\x7fELF") or header[:2] == b"MZ" or header in (
                b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xcf",
                b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca"):
            result["native_binaries"] = [result["launcher"]]

    version = result["version"]
    if version:
        result["release_tag"] = f"rust-v{version}"
        result["release_source_commit"] = RELEASE_COMMITS.get(version)
        result["commit_evidence"] = (
            "Previously verified upstream release tag; local build equivalence not established."
            if version in RELEASE_COMMITS else "Release commit not verified; left null.")
    return result
