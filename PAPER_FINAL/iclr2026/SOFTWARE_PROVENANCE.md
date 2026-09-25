# Software provenance

Inspected 25 September 2026 without executing Codex or Python/Node commands.

## OpenAI Codex CLI

- Installed package: `@openai/codex`, version `0.155.1`.
- Platform package: `0.155.1-darwin-arm64`; manifest target `aarch64-apple-darwin`.
- Executable selected by the shell: `/Users/ddod/.nvm/versions/node/v24.11.1/bin/codex`.
- Package metadata: `/Users/ddod/.nvm/versions/node/v24.11.1/lib/node_modules/@openai/codex/package.json`.
- Upstream: https://github.com/openai/codex
- Release tag: `rust-v0.155.1`.
- Annotated tag object: `4e21628f9ec9ee656650cd2b62ef92225725b5ac`.
- Source commit (the tag's target): `be2951ea34f0d295ed0becf97079f92fa5f6950e`.
- Installed native executable SHA-256: `8eaf1ad12fe6bf89b1710330f58900014322c7c5af677e43be116d8ac5fc0a9e`.

The tag was resolved using the official repository API:

- https://api.github.com/repos/openai/codex/git/ref/tags/rust-v0.155.1
- https://api.github.com/repos/openai/codex/git/tags/4e21628f9ec9ee656650cd2b62ef92225725b5ac

The SHA above identifies the release source, not model weights. The binary checksum
identifies the inspected installed executable; no reproducible-build equivalence
between that executable and upstream source was tested.

## Historical run evidence

For example, `CODEX_HARNESS_TESTING/runs/codex-20260924T044914878970Z/config.json`
records the same executable path. The harness runs `codex exec --ephemeral --json`.
The saved configurations contain model and effort settings but do not capture CLI
version or binary hash. Searches of saved run JSON/JSONL/log artifacts did not find
`cli_version`, `codex_version`, or an `OpenAI Codex v` header. Thus the current
installation is verified; uniform historical version use is not established.

Do not retroactively fill historical run records with the currently installed version.
Future runs should capture package version and executable checksum before launching.

## Other software

The Flat-Folder wrapper (`workspace/tools/flatfolder-check.mjs`) loads an external
checkout via `--ff`, `FLATFOLDER`, or `~/Downloads/flat-folder-main`. That default
directory is absent on the inspected machine, and no `flatfolder-check.json` report
was found under `workspace`. Its historical commit cannot be recovered from this
checkout. The original external checkout or a saved version record is needed.
Do not substitute today's upstream HEAD for the experimental version.

Creasy remains a planned baseline; no experimental version should be claimed.
FOLD is cited as a format specification; this does not assert use of its JavaScript
library in the experiments.
