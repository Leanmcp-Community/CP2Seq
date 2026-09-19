"""Browser regressions. Run manually with the existing Playwright environment."""
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest

from server import Handler


class BrowserPlaybackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from playwright.sync_api import sync_playwright
        cls.temporary = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temporary.name)
        run = cls.root / "codex-ui-test"
        sample = run / "example"
        sample.mkdir(parents=True)

        def write(path, value):
            path.write_text(json.dumps(value))

        write(run / "config.json", {"model": "UI fixture"})
        square = [[0, 0], [1, 0], [1, 1], [0, 1]]
        write(sample / "cp.fold", {"vertices_coords": square, "edges_vertices": [[0, 1], [1, 2], [2, 3], [3, 0]], "edges_assignment": ["B"] * 4})
        write(sample / "target.fold", {"vertices_coords": square, "faces_vertices": [[0, 1, 2, 3]]})
        for number in (1, 2):
            turn = sample / f"turn-{number:03d}"
            turn.mkdir()
            action = {"name": "add_fold", "arguments": {"angle_index": 2, "offset": .5, "move_positive": True, "over": True}}
            result = {"ok": True, "state_id": 1, "layers_bottom_to_top": [{"polygon": [[0, 0], [.5, 0], [.5, 1], [0, 1]], "parity": 0}]} if number == 1 else {"ok": False, "error": "would-tear"}
            write(turn / "tool.json", {"action": action, "result": result})
            write(turn / "response.json", {"action": action})
            (turn / "prompt.md").write_text("Saved test conversation")
            (turn / "events.jsonl").write_text(json.dumps({"type": "item.completed", "item": {"type": "reasoning", "text": "Saved test reasoning"}}) + "\n")
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.server.traces = cls.root
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temporary.cleanup()

    def test_sequence_filters_rejection_and_scrubbing(self):
        from playwright.sync_api import expect
        page = self.browser.new_page()
        self.addCleanup(page.close)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(self.base + "/traces")
        page.locator("#runs-body button").first.click()
        page.locator("#examples-body button").first.click()
        expect(page.locator("#sequence-position")).to_have_text("Initial sheet")
        expect(page.locator(".sequence-picture")).to_have_count(2)
        page.locator("#turns-body button", has_text="Turn 2").click()
        expect(page.locator(".sequence-status")).to_contain_text("would-tear")
        expect(page.locator(".sequence-picture figcaption").first).to_contain_text("step 1")
        page.get_by_label("Thinking", exact=True).check()
        expect(page.locator('[data-category="thinking"]')).to_be_visible()
        page.get_by_label("Conversation", exact=True).check()
        expect(page.locator('[data-category="conversation"]').first).to_be_visible()
        page.get_by_role("button", name="↺ Restart").click()
        expect(page.locator("#sequence-position")).to_have_text("Initial sheet")
        page.locator('.sequence-options select').first.select_option('exploded')
        expect(page.locator(".sequence-image canvas")).to_have_count(2)
        page.locator("#sequence-play").click()
        expect(page.locator("#sequence-play")).to_have_attribute("aria-pressed", "true")
        page.locator("#sequence-play").click()
        self.assertEqual(errors, [])

    def test_verification_workspace_uses_actual_tools(self):
        from playwright.sync_api import expect
        page = self.browser.new_page()
        self.addCleanup(page.close)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(self.base + "/verification")
        page.locator("#check-all").click()
        expect(page.locator("#suite-status")).to_have_text("9/9 cases match their expected outcomes.")
        page.locator("#case-finish").click()
        expect(page.locator("#case-status")).to_contain_text("would-tear")
        expect(page.locator("#current-caption")).to_contain_text("2 accepted folds")
        page.locator("#cases button", has_text="Different sequences").click()
        page.locator("#case-finish").click()
        self.assertTrue(json.loads(page.locator("#case-evaluation").text_content())["pilot_match"])
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
