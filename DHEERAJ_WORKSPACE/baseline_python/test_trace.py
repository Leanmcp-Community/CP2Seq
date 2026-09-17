"""Regression checks for bounded recording and unchanged search outcomes."""
import unittest
from unittest.mock import patch

from model import Problem
from search import search
from search_trace import Trace, encoded_size, MAX_TRACE_BYTES
from test_baseline import half_sheet


class TraceTests(unittest.TestCase):
    def test_recording_preserves_solution(self):
        data = half_sheet()
        problem = Problem(data, data)
        for algorithm in ("bfs", "dfs"):
            plain = search(problem, algorithm)
            trace = Trace(problem, 100)
            recorded = search(problem, algorithm, observer=trace)
            self.assertEqual(plain.actions, recorded.actions)
            self.assertEqual(plain.queries, recorded.queries)
            exported = trace.export(recorded)
            self.assertEqual(exported["events"][-1]["status"], "SOLVED")
            self.assertLess(encoded_size(exported), MAX_TRACE_BYTES)

    def test_caps_keep_final_stop(self):
        data = half_sheet()
        for attribute, value in (("MAX_TRACE_STATES", 1),
                                 ("MAX_TRACE_BYTES", 66000),
                                 ("MAX_TRACE_EVENTS", 1)):
            with patch("search_trace." + attribute, value):
                problem = Problem(data, data)
                trace = Trace(problem, 100)
                result = search(problem, observer=trace)
                exported = trace.export(result)
                self.assertGreater(exported["omitted_events"], 0)
                self.assertIsNotNone(exported["cap_reason"])
                self.assertEqual(exported["events"][-1]["kind"], "stop")
                self.assertEqual(result.status, "SOLVED")


if __name__ == "__main__":
    unittest.main()
