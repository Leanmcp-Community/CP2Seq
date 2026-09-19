"""Trace discovery and artifact API regressions; no Tinker/browser dependencies."""
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

from server import Handler
from trace_store import artifact_path, list_traces, trace_index


class TraceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "runs"
        self.run = self.root / "qwen-9b-test"
        self.sample = self.run / "easy-0001"
        self.sample.mkdir(parents=True)
        (self.run / "config.json").write_text(json.dumps({"config": {"model": "Qwen/Qwen3.5-9B", "thinking": True}}))
        (self.sample / "turn-001-messages.json").write_text('[{"role":"user","content":"fold"}]')

    def test_live_turn_appears_before_response(self):
        listing = list_traces(self.root)
        self.assertTrue(listing["runs"][0]["thinking"])
        self.assertEqual(listing["runs"][0]["model"], "Qwen/Qwen3.5-9B")
        before = trace_index(self.root, self.run.name)
        self.assertEqual(before["samples"][0]["turns"], [1])
        self.assertIsNone(before["samples"][0]["result"])
        (self.sample / "turn-001-response.json").write_text('{"raw_text":"saved output"}')
        after = trace_index(self.root, self.run.name)
        self.assertEqual(after["samples"][0]["turns"], [1])
        self.assertGreaterEqual(after["samples"][0]["modified"], before["samples"][0]["modified"])

    def test_legacy_single_image_is_listed(self):
        old = self.root / "tinker-image-old"
        old.mkdir()
        (old / "response.json").write_text('{"model":"Qwen/Qwen3.5-9B","text":"volcano"}')
        self.assertEqual(len(list_traces(self.root)["runs"]), 2)
        self.assertEqual(trace_index(self.root, old.name)["legacy_image"]["text"], "volcano")

    def test_codex_turn_directories_and_log_artifacts(self):
        codex = self.root / "codex-test"
        turn = codex / "easy-0002" / "turn-001"
        turn.mkdir(parents=True)
        (codex / "config.json").write_text('{"model":"gpt-5.6-sol","reasoning_effort":"low"}')
        (turn / "prompt.md").write_text("Full geometry and history")
        (turn / "stderr.log").write_text("A saved CLI diagnostic")
        sample = trace_index(self.root, codex.name)["samples"][0]
        self.assertEqual(sample["id"], "easy-0002")
        self.assertEqual(sample["turns"], [1])
        self.assertEqual(sample["layout"], "codex")
        self.assertEqual(sample["modified"], max(p.stat().st_mtime_ns for p in turn.iterdir()))
        self.assertEqual(artifact_path(self.root, codex.name, "easy-0002/turn-001/stderr.log"), turn / "stderr.log")

    def test_artifact_traversal_and_symlink_escape_rejected(self):
        secret = self.root.parent / "outside.json"
        secret.write_text('{}')
        (self.run / "escape.json").symlink_to(secret)
        for path in ("../../outside.json", str(secret), "escape.json"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                artifact_path(self.root, self.run.name, path)
        with self.assertRaises(ValueError):
            trace_index(self.root, "../")

    def test_api_delivers_raw_artifact_and_trace_page(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        server.traces = self.root
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{server.server_port}"
            with urlopen(base + '/traces') as response:
                self.assertIn(b'Model traces', response.read())
            with urlopen(base + '/verification') as response:
                self.assertIn(b'Verification workspace', response.read())
            with urlopen(base + '/source/DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs') as response:
                self.assertIn('javascript', response.headers['Content-Type'])
                self.assertIn(b'foldLayers', response.read())
            with self.assertRaises(HTTPError):
                urlopen(base + '/source/DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/profiles.json')
            with urlopen(base + '/api/trace?' + urlencode({'run': self.run.name})) as response:
                self.assertEqual(json.load(response)['samples'][0]['turns'], [1])
            query = urlencode({'run': self.run.name, 'path': 'easy-0001/turn-001-messages.json'})
            with urlopen(base + '/api/trace-file?' + query) as response:
                self.assertEqual(json.load(response)[0]['content'], 'fold')
            with self.assertRaises(HTTPError) as raised:
                urlopen(base + '/api/trace-file?' + urlencode({'run': self.run.name, 'path': '../outside.json'}))
            self.assertEqual(raised.exception.code, 400)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == '__main__':
    unittest.main()
