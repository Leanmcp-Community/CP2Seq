"""Run: python3 -m unittest discover -s DHEERAJ_WORKSPACE/viewer -p 'test_*.py' -v"""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from server import (catalog, catalog_roots, confined, corpus_catalog, load_run,
                    load_from_roots, load_sample)


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve() / "exports"
        self.root.mkdir()
        for algorithm in ("bfs", "dfs"):
            run = self.root / "ladybug" / "20260916-160821" / algorithm
            run.mkdir(parents=True)
            (run / "result.json").write_text(json.dumps({"algorithm": algorithm, "status": "SOLVED"}))
            (run / "trace.json").write_text('{"version":1,"nodes":[],"events":[]}')

    def test_lists_both_algorithms_and_loads_optional_files(self):
        listing = catalog(self.root)
        self.assertEqual({r["algorithm"] for r in listing["runs"]}, {"bfs", "dfs"})
        self.assertFalse(listing["truncated"])
        run = load_run(self.root, listing["runs"][0]["id"])
        self.assertEqual(run["trace"]["version"], 1)
        self.assertIsNone(run["seq"])

    def test_traversal_and_symlinks_are_confined(self):
        outside = self.root.parent / "outside"
        outside.mkdir()
        (self.root / "escape").symlink_to(outside, target_is_directory=True)
        for relative in ("../outside", "escape", str(outside)):
            with self.assertRaises(ValueError):
                confined(self.root, relative)

    def test_read_cap_and_listing_cap(self):
        run_id = catalog(self.root)["runs"][0]["id"]
        with patch("server.MAX_RUN_BYTES", 10):
            with self.assertRaises(ValueError):
                load_run(self.root, run_id)
        with patch("server.MAX_RUNS", 1):
            listing = catalog(self.root)
            self.assertEqual(len(listing["runs"]), 1)
            self.assertTrue(listing["truncated"])

    def test_bad_result_does_not_hide_other_runs(self):
        bad = self.root / "broken"
        bad.mkdir()
        (bad / "result.json").write_text('{')
        listing = catalog(self.root)
        self.assertEqual(len(listing["runs"]), 2)
        self.assertEqual(len(listing["errors"]), 1)

    def test_combined_library_routes_ids(self):
        roots = {"experiments": self.root, "exports": self.root.parent / "missing"}
        listing = catalog_roots(roots)
        self.assertEqual(len(listing["runs"]), 2)
        run_id = listing["runs"][0]["id"]
        self.assertTrue(run_id.startswith("experiments/"))
        self.assertEqual(load_from_roots(roots, run_id)["result"]["status"], "SOLVED")
        with self.assertRaises(ValueError):
            load_from_roots(roots, "unknown/run")


class CorpusTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve() / "release"
        self.sample = self.root / "all-layers" / "samples" / "easy-0001"
        self.sample.mkdir(parents=True)
        (self.sample / "meta.json").write_text(json.dumps(
            {"id": "easy-0001", "stratum": "easy", "metrics": {"steps": 4, "layers_final": 9}}))
        (self.sample / "cp.fold").write_text('{"vertices_coords":[[0,0]],"edges_vertices":[]}')
        (self.sample / "seq.json").write_text('{"id":"easy-0001","folds":[]}')
        (self.sample / "steps.fold").write_text('{"file_frames":[]}')

    def index(self, entries):
        (self.root / "index.json").write_text(json.dumps({"generated": "now", "samples": entries}))

    def test_index_drives_the_listing(self):
        self.index([{"id": "easy-0001", "dir": "all-layers/samples/easy-0001",
                     "tier": "all-layers", "band": "easy", "folds": 4, "layers": 9, "replay": "ok"}])
        listing = corpus_catalog(self.root)
        self.assertEqual(listing["source"], "index.json")
        self.assertEqual(listing["samples"][0]["dir"], "all-layers/samples/easy-0001")
        self.assertEqual(listing["samples"][0]["replay"], "ok")

    def test_scan_finds_samples_without_an_index(self):
        listing = corpus_catalog(self.root)
        self.assertEqual(listing["source"], "scan")
        self.assertEqual([row["id"] for row in listing["samples"]], ["easy-0001"])
        self.assertEqual(listing["samples"][0]["folds"], 4)

    def test_bad_index_entry_is_reported_not_fatal(self):
        self.index([{"id": "broken"}, {"id": "ok", "dir": "all-layers/samples/easy-0001"}])
        listing = corpus_catalog(self.root)
        self.assertEqual(len(listing["samples"]), 1)
        self.assertEqual(len(listing["errors"]), 1)

    def test_missing_folder_reports_instead_of_raising(self):
        listing = corpus_catalog(self.root.parent / "absent")
        self.assertEqual(listing["samples"], [])
        self.assertTrue(listing["errors"])

    def test_sample_loads_all_four_files(self):
        loaded = load_sample(self.root, "all-layers/samples/easy-0001")
        self.assertEqual(loaded["meta"]["id"], "easy-0001")
        self.assertEqual(loaded["seq"]["folds"], [])
        self.assertIn("file_frames", loaded["steps"])
        self.assertIn("vertices_coords", loaded["cp"])

    def test_sample_paths_are_confined_and_checked(self):
        with self.assertRaises(ValueError):
            load_sample(self.root, "../escape")
        with self.assertRaises(FileNotFoundError):
            load_sample(self.root, "all-layers/samples/missing")
        empty = self.root / "all-layers" / "samples" / "empty"
        empty.mkdir()
        with self.assertRaises(FileNotFoundError):
            load_sample(self.root, "all-layers/samples/empty")


if __name__ == "__main__":
    unittest.main()
