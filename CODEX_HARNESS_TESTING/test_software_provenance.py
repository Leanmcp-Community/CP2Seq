"""Offline tests using temporary files and a mocked version probe."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from software_provenance import codex_provenance


class ProvenanceTests(unittest.TestCase):
    def test_npm_launcher_and_payload_have_separate_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "node_modules/@openai/codex"
            launcher = root / "bin/codex.js"
            launcher.parent.mkdir(parents=True)
            launcher.write_text("#!/usr/bin/env node\n")
            (root / "package.json").write_text(json.dumps({"name": "@openai/codex", "version": "0.155.1"}))
            native = root / "node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex"
            native.parent.mkdir(parents=True)
            native.write_bytes(b"test native payload")
            with patch("software_provenance.subprocess.run", return_value=
                       subprocess.CompletedProcess([], 0, "codex-cli 0.155.1\n", "")):
                result = codex_provenance(launcher)
            self.assertEqual(result["version"], "0.155.1")
            self.assertEqual(result["native_binaries"][0]["sha256"],
                             hashlib.sha256(b"test native payload").hexdigest())
            self.assertNotEqual(result["launcher"]["sha256"], result["native_binaries"][0]["sha256"])
            self.assertEqual(result["release_source_commit"], "be2951ea34f0d295ed0becf97079f92fa5f6950e")

    def test_unknown_release_does_not_invent_commit(self):
        with tempfile.TemporaryDirectory() as directory:
            native = Path(directory) / "codex"
            native.write_bytes(b"\x7fELFtest")
            with patch("software_provenance.subprocess.run", return_value=
                       subprocess.CompletedProcess([], 0, "codex-cli 9.99.0\n", "")):
                result = codex_provenance(native)
            self.assertIsNone(result["release_source_commit"])
            self.assertEqual(result["release_tag"], "rust-v9.99.0")
            self.assertEqual(len(result["native_binaries"]), 1)

    def test_failed_probe_keeps_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            launcher = Path(directory) / "codex"
            launcher.write_text("#!/bin/sh\n")
            with patch("software_provenance.subprocess.run", side_effect=OSError("unavailable")):
                result = codex_provenance(launcher)
            self.assertIsNone(result["version"])
            self.assertIsNone(result["release_source_commit"])
            self.assertTrue(result["errors"])
            self.assertEqual(len(result["launcher"]["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
