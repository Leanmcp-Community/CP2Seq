#!/usr/bin/env python3
"""Build a curated, size-limited public supplement using only the standard library.

Does not execute project code, install dependencies, contact services, or change inputs.
Run from any directory: python3 scripts/package_supplement.py --dry-run
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import zipfile
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]


def anonymous_text(text):
    """Apply the same replacements to member names, source, records and docs."""
    # Project-local absolute paths become relative to the extracted package.
    text = text.replace(str(ROOT) + '/', './').replace(str(ROOT), '.')
    text = text.replace('DHEERAJ_WORKSPACE', 'AUTHOR_WORKSPACE')
    # Other historical home directories may refer to executables outside the repo.
    # Keep them visibly nonportable rather than inventing a working local path.
    text = re.sub('/' + '(?:Users|home)' + r'/[^/\s"\'\\]+', '/home/author', text)
    text = re.sub('dheeraj', 'author', text, flags=re.IGNORECASE)
    text = re.sub('ddod', 'author', text, flags=re.IGNORECASE)
    return text


def anonymous_bytes(data):
    # All allowlisted payloads are text. Refuse unexpected binary content rather
    # than shipping it without applying the replacements.
    return anonymous_text(data.decode('utf-8')).encode('utf-8')

CODE = {'.py', '.mjs', '.js', '.sh', '.html', '.css', '.json'}
DATA = {'.json', '.jsonl', '.fold', '.csv', '.md', '.tex'}
BLOCKED = {'.git', '.venv', 'venv', 'node_modules', '__pycache__',
           '.DS_Store', '.env', 'auth.json', 'credentials.json'}
RUN_FILES = {'config.json', 'results.json', 'tools.json', 'action.schema.json',
             'prompt.md', 'software_provenance.json'}
EPISODE_FILES = {'result.json', 'error.json', 'seq.json', 'cp.fold',
                 'target.fold', 'final.fold', 'search.json'}
TRACE_FILES = {'decision.json', 'tool.json', 'retries.json'}
SECRET = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|'
                    rb'\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}|'
                    rb'\bgh[pousr]_[A-Za-z0-9]{30,}')


def main(include_runs=False):
    ap = argparse.ArgumentParser(description=__doc__)
    mode = 'paper-runs' if include_runs else 'no-runs'
    ap.add_argument('--output', type=Path, default=ROOT / f'dist/foldorigami-{mode}',
                    help='Output basename without extension; creates .zip')
    ap.add_argument('--max-mb', type=float, default=99.0,
                    help='Decimal MB, maximum 100; final ZIP must be strictly smaller (default 99)')
    ap.add_argument('--dry-run', action='store_true', help='List selection and raw sizes; do not write files')
    ap.add_argument('--trace', action='append', default=[], metavar='RUN/SAMPLE',
                    help='Add decision/tool JSON for one saved episode; repeat for more episodes')
    overwrite = ap.add_mutually_exclusive_group()
    overwrite.add_argument('--force', dest='force', action='store_true',
                           help='Replace existing output after validation (default)')
    overwrite.add_argument('--no-force', dest='force', action='store_false',
                           help='Refuse to replace existing output')
    ap.set_defaults(force=True)
    args = ap.parse_args()
    if args.trace and not include_runs:
        ap.error('--trace is available only with package_with_paper_runs.py')
    if not 0 < args.max_mb <= 100:
        ap.error('--max-mb must be greater than 0 and at most 100')
    limit = int(args.max_mb * 1_000_000)
    selected = {}
    warnings = []

    def add(p, category):
        if p.is_symlink():
            raise ValueError(f'Symlink in selected artifacts: {p.relative_to(ROOT)}')
        if not p.is_file():
            raise ValueError(f'Missing required file: {p.relative_to(ROOT)}')
        rel = p.relative_to(ROOT)
        if any(part in BLOCKED or part.startswith('.env') for part in rel.parts):
            raise ValueError(f'Forbidden path: {rel}')
        # A symlinked parent is also forbidden, even when it resolves inside ROOT.
        if any(parent.is_symlink() for parent in p.parents if parent != ROOT):
            raise ValueError(f'Symlinked parent: {rel}')
        selected[rel.as_posix()] = (p, category, p.stat())

    def shallow(relative, category, extensions=CODE):
        directory = ROOT / relative
        if not directory.is_dir() or directory.is_symlink():
            raise ValueError(f'Missing or symlinked directory: {relative}')
        for p in sorted(directory.iterdir()):
            if p.suffix in extensions and (p.is_file() or p.is_symlink()):
                add(p, category)

    def tree(relative, category, extensions):
        directory = ROOT / relative
        if not directory.is_dir() or directory.is_symlink():
            raise ValueError(f'Missing or symlinked directory: {relative}')
        for base, dirs, files in os.walk(directory, followlinks=False):
            for name in dirs:
                if (Path(base) / name).is_symlink():
                    raise ValueError(f'Symlinked directory: {Path(base) / name}')
            dirs[:] = sorted(d for d in dirs if d not in BLOCKED and not d.startswith('.'))
            for name in sorted(files):
                p = Path(base) / name
                if p.suffix in extensions or name in {'LICENSE', 'LICENCE', 'NOTICE'}:
                    add(p, category)

    for relative in ('workspace', 'workspace/corpus', 'workspace/tools',
                     'workspace/figures', 'DHEERAJ_WORKSPACE/EXPERIMENT_SETUP',
                     'DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/observability',
                     'DHEERAJ_WORKSPACE/viewer', 'CODEX_HARNESS_TESTING',
                     'CODEX_HARNESS_TESTING/luna_groups',
                     'CODEX_HARNESS_TESTING/luna6groups',
                     'CODEX_HARNESS_TESTING/luna6high'):
        shallow(relative, 'code')
    tree('DHEERAJ_WORKSPACE/viewer/vendor', 'viewer dependencies', {'.js'})
    for p in (ROOT / 'CODEX_HARNESS_TESTING').glob('codex_fold_prompt*.md'):
        add(p, 'prompts')
    add(ROOT / 'DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/fold_prompt.md', 'prompts')
    add(ROOT / 'package.json', 'code')
    add(ROOT / 'pyproject.toml', 'environment')
    add(ROOT / '.python-version', 'environment')
    if (ROOT / 'uv.lock').is_file():
        add(ROOT / 'uv.lock', 'environment')
    else:
        warnings.append('uv.lock is missing. Run uv lock in the original repository and rebuild before publishing.')
    add(ROOT / 'scripts/verify_manifest.py', 'verification')
    add(ROOT / 'scripts/verify_supplement.sh', 'verification')
    add(ROOT / 'scripts/package_supplement.py', 'packaging')
    add(ROOT / 'scripts/package_without_runs.py', 'packaging')
    add(ROOT / 'scripts/package_with_paper_runs.py', 'packaging')
    add(ROOT / 'supplement/README.md', 'documentation')

    # Only the frozen release, never raw generation batches or failure snapshots.
    tree('workspace/corpus/out/release', 'released dataset', DATA)
    for batch in sorted((ROOT / 'workspace/corpus/out/release').iterdir()):
        samples = batch / 'samples'
        if samples.is_dir():
            for sample in sorted(samples.iterdir()):
                if sample.is_dir():
                    for name in ('cp.fold', 'seq.json', 'steps.fold', 'meta.json'):
                        add(sample / name, 'released dataset')
    for relative in ('workspace/RESULTS', 'workspace/depth_wall',
                     'workspace/depth_wall_all', 'workspace/enum_cost', 'workspace/some_layers'):
        tree(relative, 'saved analyses', DATA)

    # Resolve paper cohorts from saved snapshots, never from current directory dates.
    runs = ROOT / 'CODEX_HARNESS_TESTING/runs'
    paper_episodes = {}
    def select(run, sample, reason):
        if any(not x or Path(x).name != x or x in {'.', '..'} for x in (run, sample)):
            raise ValueError('Invalid run/sample path in paper snapshot')
        paper_episodes.setdefault((run, sample), set()).add(reason)

    if include_runs:
        report = json.loads((ROOT / 'workspace/RESULTS/run-inventory/report.json').read_text())
        # Earlier results and the supplementary exploratory model results.
        for row in report['attempts']:
            if row['complete'] and (not row['recent'] or row['model'] not in {'gpt-5.6-luna', 'gpt-6-luna'}):
                select(row['run'], row['sample'], 'earlier/exploratory inventory')
        # Exact first-completed selections, plus recorded errors for missing cases.
        for condition in report['ablations']:
            for group in condition['strata']:
                for row in group['selected_attempts']:
                    select(row['run'], row['sample'], 'paper ablation')
                for missing in group['missing']:
                    for error in missing['recorded_errors']:
                        select(error['run'], missing['sample'], 'ablation protocol error')
        # The paper also reports the pooled 1,422-attempt CP-distance snapshot.
        # It includes BFS and older model runs; these are evidence, not unused runs.
        distances = json.loads((ROOT / 'workspace/RESULTS/cp-distance/attempts.json').read_text())
        marker = 'CODEX_HARNESS_TESTING/runs/'
        for row in distances:
            source = row['attempt'].replace('\\', '/')
            if marker not in source:
                raise ValueError(f'CP-distance attempt outside expected runs root: {source}')
            parts = source.split(marker, 1)[1].split('/')
            if len(parts) != 2:
                raise ValueError('Unexpected CP-distance attempt path')
            select(*parts, 'paper CP-distance snapshot (includes BFS)')

    run_count = episode_count = 0
    wanted_runs = sorted({run for run, _ in paper_episodes})
    for run_name in wanted_runs:
        run = runs / run_name
        if not run.is_dir():
            raise ValueError(f'Paper-referenced run is missing: {run_name}')
        if run.is_symlink():
            raise ValueError(f'Symlinked run: {run.name}')
        run_count += 1
        for name in sorted(RUN_FILES):
            if (run / name).exists():
                add(run / name, 'run records')
        if not (run / 'config.json').exists():
            warnings.append(f'Run has no config.json: {run.name}')
        for episode in sorted(run.iterdir()):
            if not episode.is_dir() or (run.name, episode.name) not in paper_episodes:
                continue
            present = [episode / n for n in sorted(EPISODE_FILES) if (episode / n).exists()]
            if not present:
                continue
            episode_count += 1
            for p in present:
                add(p, 'episode records')
            # The CP-distance scorer falls back to the last saved sequence snapshot.
            if not (episode / 'seq.json').exists():
                for turn in sorted(episode.glob('turn-*'), reverse=True):
                    p = turn / 'tool.json'
                    if not p.is_file():
                        continue
                    obj = json.loads(p.read_text())
                    result = obj.get('result')
                    if isinstance(result, dict) and isinstance(result.get('sequence'), list):
                        add(p, 'score recovery')
                        break
    for (run, sample), reasons in paper_episodes.items():
        if not (runs / run / sample).is_dir():
            # Missing planned episodes can be represented solely in an aggregate.
            aggregate = runs / run / 'results.json'
            rows = json.loads(aggregate.read_text()) if aggregate.exists() else []
            if not isinstance(rows, list) or not any(r.get('sample_id') == sample for r in rows):
                raise ValueError(f'Paper-referenced episode has no directory or aggregate record: {run}/{sample}')
            warnings.append(f'Episode represented by aggregate only: {run}/{sample}')

    for trace in args.trace:
        parts = Path(trace).parts
        if len(parts) != 2 or any(part in {'.', '..'} for part in parts) or Path(trace).is_absolute():
            raise ValueError('--trace must be RUN/SAMPLE relative to CODEX_HARNESS_TESTING/runs')
        episode = runs / trace
        if tuple(parts) not in paper_episodes:
            raise ValueError(f'Trace is not selected by the paper snapshots: {trace}')
        if not episode.is_dir() or episode.is_symlink():
            raise ValueError(f'Missing or symlinked trace: {trace}')
        count = 0
        for turn in sorted(episode.glob('turn-*')):
            for name in sorted(TRACE_FILES):
                if (turn / name).is_file():
                    add(turn / name, 'selected traces')
                    count += 1
        if not count:
            raise ValueError(f'No decision/tool records found for trace: {trace}')

    licenses = [ROOT / name for name in ('LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE')
                if (ROOT / name).is_file()]
    for p in licenses:
        add(p, 'project licence')
    if not licenses:
        warnings.append('No root project licence found. The paper promises BSD 3-Clause; '
                        'add the agreed licence and copyright holder before public release.')
    warnings += [
        'Archive paths and text are anonymized by replacement; source files are unchanged.',
        'Historical absolute paths and executable paths may require local overrides when rerunning.',
        'Saved analyses may predate live runs. No paper numbers are regenerated or verified by packaging.',
        'Full model transcripts, per-turn renders and logs are excluded; this is not a complete trace archive.',
    ]
    sizes = Counter()
    for _, category, info in selected.values():
        sizes[category] += info.st_size
    print(f'Selected {len(selected)} files; {run_count} runs; {episode_count} episode directories')
    for category, size in sorted(sizes.items()):
        print(f'  {category:24s} {size / 1_000_000:9.3f} MB uncompressed')
    for warning in warnings:
        print(f'NOTE: {warning}')
    if args.dry_run:
        print('Dry run only. Compressed size is determined by the build, not estimated here.')
        return

    base_output = args.output.expanduser().absolute()
    if str(base_output).endswith(('.zip', '.tar.gz')):
        raise ValueError('--output is a basename; omit .zip/.tar.gz')
    outputs = {'.zip': Path(str(base_output) + '.zip')}
    if any(p.exists() for p in outputs.values()) and not args.force:
        raise ValueError('An output already exists; choose a new basename or use --force')
    base_output.parent.mkdir(parents=True, exist_ok=True)
    manifest = {'format': 1, 'archive_root': 'foldorigami-supplement',
                'size_limit_bytes_exclusive': limit, 'warnings': warnings,
                'mode': mode, 'anonymized': True,
                'runs': run_count, 'episodes': episode_count, 'traces': args.trace,
                'paper_episodes': [{'run': run, 'sample': sample, 'sources': sorted(reasons)}
                                   for (run, sample), reasons in sorted(paper_episodes.items())],
                'files': []}
    temporaries = {}
    for ext in outputs:
        fd, temp_name = tempfile.mkstemp(prefix='.supplement-', suffix=ext, dir=base_output.parent)
        os.close(fd)
        temporaries[ext] = Path(temp_name)

    def signature(info):
        return info.st_size, info.st_mtime_ns, info.st_ino

    def put(zf, relative, data, executable=False):
        info = zipfile.ZipInfo('foldorigami-supplement/' + relative, (2026, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
        zf.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    member_names = set()
    try:
        with zipfile.ZipFile(temporaries['.zip'], 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            for relative, (p, category, original) in sorted(selected.items()):
                data = p.read_bytes()
                if signature(p.stat()) != signature(original):
                    raise ValueError(f'Input changed while packaging: {relative}; stop writers and retry')
                if SECRET.search(data):
                    raise ValueError(f'Possible credential in {relative}; inspect locally (value not printed)')
                relative = anonymous_text(relative)
                data = anonymous_bytes(data)
                if relative in member_names:
                    raise ValueError(f'Anonymized archive path collision: {relative}')
                member_names.add(relative)
                put(zf, relative, data, bool(original.st_mode & 0o111))
                manifest['files'].append({'path': relative, 'category': category,
                                          'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
            # Recheck every selected file before publishing a snapshot.
            for relative, (p, _, original) in selected.items():
                if signature(p.stat()) != signature(original):
                    raise ValueError(f'Input changed while packaging: {relative}; stop writers and retry')
            manifest_data = anonymous_bytes((json.dumps(manifest, indent=2) + '\n').encode())
            readme_data = anonymous_bytes((ROOT / 'supplement/README.md').read_bytes())
            put(zf, 'MANIFEST.json', manifest_data)
            put(zf, 'README.md', readme_data)
        archive_sizes = {ext: p.stat().st_size for ext, p in temporaries.items()}
        ext = '.zip'
        temporary, output, size = temporaries[ext], outputs[ext], archive_sizes[ext]
        for kind, count in archive_sizes.items():
            print(f'{kind}: {count:,} bytes ({count / 1_000_000:.3f} MB)')
        if size >= limit:
            raise ValueError(f'ZIP is {size:,} bytes; must be strictly below {limit:,}. '
                             'Nothing was dropped; no output published.')
        expected = {'foldorigami-supplement/' + e['path']: e['sha256'] for e in manifest['files']}
        expected['foldorigami-supplement/MANIFEST.json'] = hashlib.sha256(manifest_data).hexdigest()
        expected['foldorigami-supplement/README.md'] = hashlib.sha256(readme_data).hexdigest()
        def verify(name, data):
            if name not in expected or hashlib.sha256(data).hexdigest() != expected.pop(name):
                raise ValueError(f'Unexpected member or hash mismatch: {name}')
        with zipfile.ZipFile(temporary) as zf:
            for name in zf.namelist():
                verify(name, zf.read(name))
        if expected:
            raise ValueError('Archive is missing expected members')
        if args.force:
            os.replace(temporary, output)
        else:
            # Atomic no-clobber publication on the same filesystem.
            os.link(temporary, output)
            temporary.unlink()
        if args.force:
            for other in outputs.values():
                if other != output:
                    other.unlink(missing_ok=True)
        print(f'Created {output}\nSize: {size:,} bytes ({size / 1_000_000:.3f} MB) < {limit:,} bytes')
        print('ZIP integrity and payload SHA-256 hashes verified.')
    finally:
        for temporary in temporaries.values():
            temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f'Packaging failed: {exc}', file=sys.stderr)
        sys.exit(1)
