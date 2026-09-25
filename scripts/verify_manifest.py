#!/usr/bin/env python3
"""Verify an extracted supplement's original payload without changing it."""
import hashlib
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
manifest = root / 'MANIFEST.json'
if not manifest.is_file():
    sys.exit('MANIFEST.json not found. Run this check in an extracted supplement.')
record = json.loads(manifest.read_text())
failures = []
for entry in record['files']:
    file = (root / entry['path']).resolve()
    if not file.is_relative_to(root) or not file.is_file():
        failures.append(entry['path'] + ': missing or outside package')
        continue
    data = file.read_bytes()
    if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
        failures.append(entry['path'] + ': size/hash mismatch')
if failures:
    print('\n'.join(failures), file=sys.stderr)
    sys.exit(1)
print(f"Verified {len(record['files'])} original payload files; mode={record.get('mode', 'unknown')}")
print('Additional files are not covered by the original manifest.')
