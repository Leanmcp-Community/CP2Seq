#!/usr/bin/env bash
# Upload the released dataset using the existing Hugging Face CLI login.
# Usage: bash scripts/upload_huggingface.sh [--dry-run]
# Requires the hf CLI and write access to the leanmcp organization.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="leanmcp/cp2seq"
DATA="$ROOT/workspace/corpus/out/release"
CARD="$ROOT/scripts/huggingface/README.md"
DRY_RUN=0
case "${1:-}" in
  '') ;;
  --dry-run) DRY_RUN=1 ;;
  *) echo "Usage: $0 [--dry-run]" >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { echo "Too many arguments" >&2; exit 2; }
for required in "$DATA/manifest.json" "$DATA/index.json" "$CARD"; do
  [[ -f "$required" ]] || { echo "Missing file: $required" >&2; exit 1; }
done

run() {
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '%q ' "$@"
    printf '\n'
  else
    "$@"
  fi
}

echo "Destination: https://huggingface.co/datasets/$REPO"
echo "Source: $DATA (entire release dataset)"
echo "Creates a public dataset if absent; updates matching files if present."
echo "Does not delete remote files or change an existing repository's visibility."
if [[ "$DRY_RUN" == 0 ]]; then
  command -v hf >/dev/null 2>&1 || {
    echo "hf CLI not found. Install it, then rerun this script." >&2
    echo "Installation: https://huggingface.co/docs/huggingface_hub/guides/cli" >&2
    exit 1
  }
fi
run hf auth whoami
run hf upload "$REPO" "$DATA" data --repo-type dataset \
  --exclude '.cache/*' \
  --commit-message "Upload CP2Seq release corpus"
run hf upload "$REPO" "$CARD" README.md --repo-type dataset \
  --commit-message "Add CP2Seq dataset card"
if [[ "$DRY_RUN" == 0 ]]; then
  echo "Upload complete: https://huggingface.co/datasets/$REPO"
fi
