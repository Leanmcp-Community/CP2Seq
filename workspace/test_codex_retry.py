"""Check the retry classifier and backoff loop in codex_fold_loop.ask_codex.

Run from the repository root:
    .venv/bin/python workspace/test_codex_retry.py
"""
import sys, types, unittest
from argparse import Namespace
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "CODEX_HARNESS_TESTING"))
import codex_fold_loop as loop


def logs(text, events=""):
    directory = Path(TemporaryDirectory().name)
    directory.mkdir(parents=True)
    (directory / "stderr.log").write_text(text)
    (directory / "events.jsonl").write_text(events)
    return directory


class Classifier(unittest.TestCase):
    def test_retryable(self):
        cases = {
            "stream error: unexpected status 429 Too Many Requests": "http 429",
            "ERROR: rate_limit_exceeded for this model": "rate limit",
            "the model is currently overloaded, please try again": "capacity",
            "unexpected status 503 Service Unavailable": "server error",
            "error sending request: connection reset by peer": "connection error",
        }
        for text, label in cases.items():
            self.assertEqual(loop.retry_reason(logs(text)), label, text)

    def test_not_retryable(self):
        for text in ["not logged in; run codex login",
                     "invalid model: gpt-5.6-luna",
                     "usage: 5200 input tokens, 503 output tokens",
                     "no such file or directory"]:
            self.assertIsNone(loop.retry_reason(logs(text)), text)


class Backoff(unittest.TestCase):
    def setUp(self):
        self.slept, self.calls = [], []
        self.args = Namespace(codex_bin="codex", reasoning_effort=None, model=None,
                              timeout=30, max_retries=3, retry_wait=10, retry_max_wait=120)

    def run_ask(self, exits, stderr_text):
        """exits: returncode per attempt. Returns (result_or_error, waits)."""
        def fake_run(command, **kwargs):
            index = len(self.calls)
            self.calls.append(command)
            code = exits[index]
            kwargs["stderr"].write(stderr_text)
            if not code:
                Path(self.turn / "response.json").write_text('{"action": {"name": "done"}}')
            return types.SimpleNamespace(returncode=code)
        loop.subprocess.run = fake_run
        loop.time.sleep = self.slept.append
        with TemporaryDirectory() as tmp:
            self.turn = Path(tmp) / "turn-001"
            self.turn.mkdir()
            return loop.ask_codex(self.args, "prompt", {}, self.turn, Path(tmp), Path(tmp) / "s.json")

    def test_retries_then_succeeds(self):
        out = self.run_ask([1, 1, 0], "unexpected status 429 Too Many Requests")
        self.assertEqual(out, {"action": {"name": "done"}})
        self.assertEqual(self.slept, [10, 20])
        self.assertTrue((self.turn / "retries.json").is_file())
        self.assertTrue((self.turn / "failed-attempt-01" / "stderr.log").is_file())

    def test_gives_up_after_max_retries(self):
        with self.assertRaises(RuntimeError) as caught:
            self.run_ask([1, 1, 1, 1], "unexpected status 429")
        self.assertIn("all 4 attempts", str(caught.exception))
        self.assertEqual(self.slept, [10, 20, 40])

    def test_no_retry_on_other_failure(self):
        with self.assertRaises(RuntimeError):
            self.run_ask([1], "not logged in; run codex login")
        self.assertEqual(self.slept, [])
        self.assertEqual(len(self.calls), 1)

    def test_wait_is_capped(self):
        self.args.max_retries, self.args.retry_wait, self.args.retry_max_wait = 5, 30, 60
        with self.assertRaises(RuntimeError):
            self.run_ask([1] * 6, "the model is currently overloaded")
        self.assertEqual(self.slept, [30, 60, 60, 60, 60])


if __name__ == "__main__":
    unittest.main(verbosity=2)
