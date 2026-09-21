"""PNG rendering and a persistent fold-tool session using the viewer's JS engine.

Run directly for image preparation only, or import BrowserSession in the agent.
Playwright drives Chromium; no Node application or duplicated Python simulator.
"""
import argparse
import base64
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
from pathlib import Path
import threading
from urllib.parse import unquote, urlsplit

from image_assets import prepare_image, DEFAULT_MAX_BYTES, DEFAULT_MAX_EDGE

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CORPUS = ROOT / "workspace/corpus/out/release/all-layers/samples"
DEFAULT_SAMPLES = ["easy-0001", "easy-0002"]


def write_json(path, value):
    # Atomic replacement allows the trace UI to poll without reading partial JSON.
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def load_task(sample_id, corpus=CORPUS):
    directory = (corpus / sample_id).resolve()
    if directory.parent != corpus.resolve():
        raise ValueError("Sample ID must name a direct child of the corpus samples folder")
    raw_cp = json.loads((directory / "cp.fold").read_text())
    steps = json.loads((directory / "steps.fold").read_text())
    final = steps["file_frames"][-1]
    # Whitelist geometry, stripping names, seeds, metadata and all intermediate frames.
    cp = {"file_spec": 1.1, "frame_classes": ["creasePattern"],
          **{k: raw_cp[k] for k in ("vertices_coords", "edges_vertices", "edges_assignment")}}
    target = {"file_spec": 1.1, "frame_classes": ["foldedForm"],
              **{k: final[k] for k in ("vertices_coords", "faces_vertices", "fo:faces_layer", "fo:faces_parity")}}
    return cp, target


class ModuleHandler(SimpleHTTPRequestHandler):
    extensions_map = SimpleHTTPRequestHandler.extensions_map | {".mjs": "text/javascript", ".js": "text/javascript"}

    def do_GET(self):
        relative = unquote(urlsplit(self.path).path).lstrip("/")
        path = (ROOT / relative).resolve()
        allowed = [HERE, ROOT / "DHEERAJ_WORKSPACE/viewer", ROOT / "workspace/corpus"]
        if not any(path.is_relative_to(d) for d in allowed) or path.suffix not in (".js", ".mjs", ".html"):
            self.send_error(404)
            return
        # Never serve corpus data or reference sequences to the browser/model.
        if (ROOT / "workspace/corpus/out") in path.parents:
            self.send_error(404)
            return
        super().do_GET()

    def log_message(self, *args):
        pass


class BrowserSession:
    def __enter__(self):
        from playwright.sync_api import sync_playwright
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(ModuleHandler, directory=str(ROOT)))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.pw = self.browser = None
        try:
            self.pw = sync_playwright().start()
            self.browser = self.pw.chromium.launch(headless=True)
            self.page = self.browser.new_page()
            self.page.goto(f"http://127.0.0.1:{self.server.server_port}/DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/capture.html")
            self.page.wait_for_function("window.foldTools !== undefined")
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *_):
        try:
            if self.browser:
                self.browser.close()
            if self.pw:
                self.pw.stop()
        finally:
            self.server.shutdown()
            self.server.server_close()
            self.thread.join(timeout=2)

    def init(self, cp, target, size=512, compare_tier=0, action_space="any"):
        # Both extras default to the pre-existing behaviour so every existing caller, the
        # Tinker loop included, is unaffected: at tier 0 the comparison tool is absent from
        # the session entirely, and at "any" the action space is the one it has always been.
        return self.page.evaluate(
            "([cp, target, size, tier, space]) => window.foldTools.init(cp, target, size, tier, space)",
            [cp, target, size, compare_tier, action_space])

    def call(self, name, args=None):
        return self.page.evaluate("([name, args]) => window.foldTools.call(name, args)", [name, args or {}])

    def artifacts(self):
        return self.page.evaluate("window.foldTools.artifacts()")


def save_images(images, directory, *, max_edge=DEFAULT_MAX_EDGE, max_bytes=DEFAULT_MAX_BYTES):
    from PIL import Image
    directory.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, url in images.items():
        raw = base64.b64decode(url.split(",", 1)[1], validate=True)
        with Image.open(BytesIO(raw)) as source:
            _, data, info = prepare_image(source, max_edge=max_edge, max_bytes=max_bytes)
        path = directory / f"{name}.png"
        path.write_bytes(data)
        manifest[name] = {"path": str(path.resolve()), **info}
    write_json(directory / "images.json", manifest)
    return manifest


def add_image_options(parser):
    parser.add_argument("--render-size", type=int, default=512, help="Square PNG generation size, 256..2048")
    parser.add_argument("--max-image-edge", type=int, default=DEFAULT_MAX_EDGE)
    parser.add_argument("--max-image-bytes", type=int, default=DEFAULT_MAX_BYTES)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", nargs="+", default=DEFAULT_SAMPLES)
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--out", type=Path, default=HERE / "runs/prepared")
    parser.add_argument("--sequence", type=Path, help="Optional candidate seq.json to replay (one sample only)")
    parser.add_argument("--step", type=int, help="Render this candidate sequence step (default: last)")
    add_image_options(parser)
    args = parser.parse_args()
    if args.sequence and len(args.samples) != 1:
        parser.error("--sequence requires exactly one sample")
    if args.step is not None and not args.sequence:
        parser.error("--step requires --sequence")
    with BrowserSession() as browser:
        for sample_id in args.samples:
            cp, target = load_task(sample_id, args.corpus)
            initial = browser.init(cp, target, args.render_size)
            out = args.out / sample_id
            images = initial["images"]
            if args.sequence:
                seq = json.loads(args.sequence.read_text())
                for fold in seq["folds"]:
                    action = {k: fold[k] for k in ("angle_index", "angle_degrees", "offset",
                              "move_positive", "over", "selection_mode", "layer_count") if k in fold}
                    if "selection_mode" not in action and fold.get("selection"):
                        action["selection_mode"] = fold["selection"]["mode"]
                        if action["selection_mode"] != "all":
                            action["layer_count"] = fold["selection"]["k"]
                    result = browser.call("add_fold", action)
                    if not result["ok"]:
                        raise ValueError(result)
                result = browser.call("get_images", {} if args.step is None else {"step": args.step})
                if not result["ok"]:
                    raise ValueError(result)
                images.update({f"candidate-{k}": v for k, v in result["images"].items()})
            save_images(images, out, max_edge=args.max_image_edge, max_bytes=args.max_image_bytes)
            write_json(out / "cp.fold", cp)
            write_json(out / "target.fold", target)
            print(out.resolve(), flush=True)


if __name__ == "__main__":
    main()
