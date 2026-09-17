"""Local read-only origami run browser. Standard library only."""
import argparse
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

VIEWER = Path(__file__).resolve().parent
DEFAULT_EXPORTS = VIEWER.parent / "exports"
DEFAULT_EXPERIMENTS = VIEWER.parent / "experiments"
MAX_RUNS = 500
MAX_SCAN_ENTRIES = 10000
MAX_SCAN_DEPTH = 8
MAX_RUN_BYTES = 24 * 1024 * 1024
MAX_RESULT_BYTES = 1024 * 1024


def confined(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("Path is outside the configured folder")
    return path


def read_json(path, maximum):
    with path.open("rb") as handle:
        raw = handle.read(maximum + 1)
    if len(raw) > maximum:
        raise ValueError(f"{path.name} exceeds the viewer size limit")
    return json.loads(raw), len(raw)


def catalog(root):
    rows, errors, scanned = [], [], 0
    truncated = False
    if not root.is_dir():
        return {"root": str(root), "runs": [], "errors": [], "truncated": False}
    for directory, folders, files in os.walk(root, followlinks=False):
        scanned += 1 + len(files) + len(folders)
        if scanned > MAX_SCAN_ENTRIES or len(rows) >= MAX_RUNS:
            truncated = True
            break
        folders[:] = sorted(f for f in folders if not f.startswith(".") and f != "frames")
        relative = Path(directory).relative_to(root)
        if len(relative.parts) >= MAX_SCAN_DEPTH:
            truncated |= bool(folders)
            folders[:] = []
        if "result.json" not in files:
            continue
        try:
            result_path = confined(root, str(relative / "result.json"))
            result, _ = read_json(result_path, MAX_RESULT_BYTES)
            rows.append({"id": relative.as_posix(), "algorithm": result.get("algorithm", "?"),
                         "status": result.get("status", "UNKNOWN"), "steps": result.get("steps"),
                         "trace": "trace.json" in files, "sequence": "sequence.fold" in files,
                         "modified": result_path.stat().st_mtime})
        except (OSError, ValueError, AttributeError) as exc:
            if len(errors) < 20:
                errors.append(f"{relative}: {exc}")
    rows.sort(key=lambda row: (-row["modified"], row["id"]))
    return {"root": str(root), "runs": rows, "errors": errors, "truncated": truncated}


def catalog_roots(roots):
    combined = {"root": " + ".join(str(p) for p in roots.values()),
                "runs": [], "errors": [], "truncated": False}
    for label, root in roots.items():
        listing = catalog(root)
        for row in listing["runs"]:
            combined["runs"].append(row | {"id": label + "/" + row["id"]})
        combined["errors"].extend(listing["errors"])
        combined["truncated"] |= listing["truncated"]
    combined["runs"].sort(key=lambda row: (-row["modified"], row["id"]))
    combined["truncated"] |= len(combined["runs"]) > MAX_RUNS
    combined["runs"] = combined["runs"][:MAX_RUNS]
    return combined


def load_from_roots(roots, run_id):
    label, separator, relative = run_id.partition("/")
    if label not in roots or not separator or not relative:
        raise ValueError("Unknown run library")
    return load_run(roots[label], relative)


def load_run(root, run_id):
    directory = confined(root, run_id)
    if not directory.is_dir():
        raise FileNotFoundError("Run folder was not found")
    payload, remaining = {}, MAX_RUN_BYTES
    for key, filename in (("result", "result.json"), ("trace", "trace.json"), ("seq", "sequence.fold")):
        path = confined(root, str(directory.relative_to(root) / filename))
        if key != "result" and not path.exists():
            payload[key] = None
            continue
        payload[key], used = read_json(path, min(remaining, MAX_RESULT_BYTES) if key == "result" else remaining)
        remaining -= used
    return payload


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(VIEWER), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def json_response(self, status, data):
        raw = json.dumps(data, separators=(",", ":"), allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        request = urlsplit(self.path)
        try:
            if request.path == "/api/runs":
                return self.json_response(200, catalog_roots(self.server.roots))
            if request.path == "/api/run":
                run_id = parse_qs(request.query).get("id", [""])[0]
                if not run_id:
                    raise ValueError("Missing run id")
                return self.json_response(200, load_from_roots(self.server.roots, run_id))
            if request.path.startswith("/api/"):
                return self.json_response(404, {"error": "Unknown API endpoint"})
            path = confined(VIEWER, unquote(request.path).lstrip("/") or "index.html")
            if not path.is_file() or path.suffix not in (".html", ".js", ".css"):
                return self.send_error(404)
            return super().do_GET()
        except FileNotFoundError as exc:
            return self.json_response(404, {"error": str(exc)})
        except (OSError, ValueError, AttributeError) as exc:
            return self.json_response(400, {"error": str(exc)})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--exports", type=Path,
                        help="Browse just this folder instead of experiments and legacy exports")
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.roots = ({"custom": args.exports.resolve()} if args.exports else {
        "experiments": DEFAULT_EXPERIMENTS.resolve(), "exports": DEFAULT_EXPORTS.resolve()})
    print(f"Origami viewer: http://127.0.0.1:{args.port}/", flush=True)
    print(f"Browsing runs in: {', '.join(map(str, server.roots.values()))}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
