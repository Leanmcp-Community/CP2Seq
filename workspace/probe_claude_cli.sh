#!/bin/sh
# Does headless Claude Code accept image content blocks?
#
# This is the one unknown blocking a claude_fold_loop.py design. `codex exec` takes --image;
# `claude -p` has no equivalent flag, so the only candidate path is --input-format stream-json
# with an image content block in the user message. If that works, the Claude arm can see the
# same PNGs the Codex arm does and the two are comparable. If it does not, the arm either runs
# blind or has to be given the Read tool, which changes the experiment.
#
#   sh workspace/probe_claude_cli.sh
#
# Costs one tiny request. Answers with the model describing the image, or an error naming why
# the block was rejected.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/.."

img=CODEX_HARNESS_TESTING/runs/codex-20260920T044923651520Z/easy-0001/initial/cp.png
[ -f "$img" ] || img=$(find CODEX_HARNESS_TESTING/runs -name 'cp.png' 2>/dev/null | head -1)
if [ -z "${img:-}" ] || [ ! -f "$img" ]; then
  printf '%s\n' "No saved cp.png found under CODEX_HARNESS_TESTING/runs" >&2
  exit 1
fi
printf 'probing with %s (%s bytes)\n\n' "$img" "$(wc -c < "$img" | tr -d ' ')"

tmp=$(mktemp -t claudeprobe)
trap 'rm -f "$tmp"' EXIT

# One stream-json line: a user message whose content carries text plus a base64 image block,
# the same shape the Messages API uses.
{
  printf '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Reply with exactly one short sentence naming the shapes and colours you see in this image. If you cannot see an image, reply NO IMAGE."},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"'
  base64 < "$img" | tr -d '\n'
  printf '"}}]}}\n'
} > "$tmp"

# stream-json input requires stream-json output; the CLI rejects the mismatched pair. Output
# is then JSONL, so the answer has to be pulled out of the event stream rather than read whole.
out=$(mktemp -t claudeprobeout)
trap 'rm -f "$tmp" "$out"' EXIT

echo "--- raw event stream (last lines) ---"
if ! claude -p --input-format stream-json --output-format stream-json --verbose \
     --model claude-opus-5 --permission-mode dontAsk --allowedTools "" < "$tmp" > "$out" 2>&1; then
  status=$?
  tail -5 "$out"
  echo
  echo "claude exited $status -- see the message above for why the image block was rejected." >&2
  exit $status
fi
tail -3 "$out"

echo
echo "--- verdict ---"
if grep -qi "NO IMAGE" "$out"; then
  echo "DROPPED: the model reported no image. Image blocks are not delivered on this path."
elif grep -qiE "triangle|square|rectangle|line|red|blue|black|crease|fold|diagram|shape" "$out"; then
  echo "WORKS: the model described the picture, so image blocks are delivered."
  echo "Wire the stream-json path into ask_claude and drop --output-format json for it."
else
  echo "UNCLEAR: read the stream above. Full output kept at: $(cp "$out" ./probe_claude_cli.out && echo ./probe_claude_cli.out)"
  trap 'rm -f "$tmp"' EXIT
fi
