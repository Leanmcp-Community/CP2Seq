#!/usr/bin/env bash
# Build cp2seq_arxiv.pdf separately from the anonymous ICLR PDF.
# Usage: bash PAPER_FINAL/iclr2026/genpdf_arxiv.sh [--open]
set -euo pipefail
for arg in "$@"; do
  case "$arg" in
    --open) ;;
    *) echo "Usage: $0 [--open]" >&2; exit 2 ;;
  esac
done
exec bash "$(dirname "$0")/genpdf.sh" cp2seq_arxiv "$@"
