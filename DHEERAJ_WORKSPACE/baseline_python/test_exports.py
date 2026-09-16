"""Solution artifacts must not depend on optional exploration recording."""
import argparse
import json
from pathlib import Path
import tempfile
import unittest

from run import default_output, solve_one


class ExportTests(unittest.TestCase):
    def test_solved_runs_save_sequence_without_trace(self):
        fixture = Path(__file__).parent / "fixtures" / "ladybug_step_04.fold"
        args = argparse.Namespace(algorithm="both", max_depth=2, max_queries=1000,
                                  max_states=200, seconds=30, tolerance=.004,
                                  convention="pureland", trace_events=0)
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "run"
            records = solve_one(fixture, fixture, args, output)
            self.assertTrue(all(r["status"] == "SOLVED" for r in records))
            for algorithm in ("bfs", "dfs"):
                run = output / algorithm
                sequence = json.loads((run / "sequence.fold").read_text())
                self.assertEqual(len(sequence["file_frames"]), 2)
                self.assertTrue((run / "frames" / "step_002.fold").is_file())
                self.assertTrue((run / "result.json").is_file())
                self.assertFalse((run / "trace.json").exists())

    def test_default_output_is_unique_and_in_experiments(self):
        args = argparse.Namespace(command="solve", target="seq/ladybug/step_13.fold")
        first, second = default_output(args), default_output(args)
        self.assertNotEqual(first, second)
        self.assertEqual(first.parent.parent.name, "experiments")
        self.assertIn("ladybug-step_13", first.parts)


if __name__ == "__main__":
    unittest.main()
