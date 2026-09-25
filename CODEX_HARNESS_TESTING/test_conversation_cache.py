"""Offline checks; no Codex, browser, or API calls."""
import json
import unittest

from conversation_cache import incremental_input, thread_id, request_usage


class ConversationCacheTests(unittest.TestCase):
    def test_usage_is_per_request_not_inherited_total(self):
        usage = request_usage({"input_tokens": 80097, "cached_input_tokens": 0,
                               "output_tokens": 235},
                              {"input_tokens": 50880, "cached_input_tokens": 0,
                               "output_tokens": 181})
        self.assertEqual(usage["input_tokens"], 29217)
        self.assertEqual(usage["output_tokens"], 54)
        self.assertEqual(usage["cached_input_tokens"], 0)
        reset = request_usage({"input_tokens": 10}, {"input_tokens": 20})
        self.assertIsNone(reset["input_tokens"])

    def test_only_new_feedback_and_images_are_sent(self):
        old = {"cp": {"path": "cp.png"}, "turn-001-top": {"path": "one.png"}}
        manifest = {**old, "turn-002-top": {"path": "two.png"}}
        history = [{"action": "first", "result": {"ok": True}},
                   {"action": "backtrack", "result": {"ok": True, "revision": 3}}]
        state = {"revision": 3, "sequence": []}
        prompt, images = incremental_input(history, state, 3, 80, manifest, old)
        payload = json.loads(prompt.split("\n", 1)[1].split("\nNew attached", 1)[0])
        self.assertEqual(payload["previous_action_and_result"], history[-1])
        self.assertEqual(payload["current"], state)
        self.assertNotIn('"first"', prompt)
        self.assertEqual(list(images), ["turn-002-top"])
        self.assertEqual(len(history), 2)

    def test_rejection_without_new_images_still_sends_feedback(self):
        images = {"cp": {"path": "cp.png"}}
        history = [{"action": "add_fold", "result": {"ok": False, "error": "would-tear"}}]
        prompt, attached = incremental_input(history, {"revision": 0}, 2, 80, images, images)
        self.assertIn("would-tear", prompt)
        self.assertEqual(attached, {})

    def test_refuse_changed_or_reordered_history(self):
        old = {"cp": {"path": "cp.png"}, "target": {"path": "target.png"}}
        bad = [dict(reversed(list(old.items()))),
               {**old, "cp": {"path": "different.png"}},
               {"cp": old["cp"]}]
        for manifest in bad:
            with self.subTest(manifest=manifest), self.assertRaises(RuntimeError):
                incremental_input([{}], {}, 2, 80, manifest, old)
        with self.assertRaises(RuntimeError):
            incremental_input([], {}, 2, 80, old, old)

    def test_thread_id_required_for_checkpoint(self):
        ident = "12345678-1234-1234-1234-123456789abc"
        self.assertEqual(thread_id([{"type": "thread.started", "thread_id": ident}]), ident)
        for events in ([], [{"type": "thread.started", "thread_id": "--last"}]):
            with self.assertRaises(RuntimeError):
                thread_id(events)


if __name__ == "__main__":
    unittest.main()
