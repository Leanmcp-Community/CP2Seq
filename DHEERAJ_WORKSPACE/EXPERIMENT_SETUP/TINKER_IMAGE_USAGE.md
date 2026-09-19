# One-image Tinker inference

Verified against official online documentation on 2026-09-17.

The script uses `Qwen/Qwen3.5-9B`, its image processor, and the
`qwen3_5_disable_thinking` renderer. It passes a PIL image and the question as
separate image/text message parts, checks that the rendered prompt contains an
image chunk, and requests one sample. This follows the official
[VLM image example](https://github.com/thinking-machines-lab/tinker-cookbook/blob/main/tinker_cookbook/recipes/vlm_classifier/eval.py)
and [rendering/sampling guide](https://tinker-docs.thinkingmachines.ai/tutorials/core-concepts/rendering/).

From the repository root, with `TINKER_API_KEY` already exported:

```bash
.venv/bin/python DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/tinker_describe_image.py --image assets/2222.jpg
```

For the previous image, substitute `--image assets/VVVV.jpg`. Each invocation
sends only the selected image and asks: “What is this image? Describe it.”

Images are resized before encoding: longest edge at most 1,024 pixels, then
further reduced until both PNG and renderer JPEG fit within 1,800,000 bytes.
These defaults leave room below the endpoint's reported 2,097,152-byte asset
limit. Set `--max-image-edge` and `--max-image-bytes` to override. The source file
is unchanged; the prepared image is saved as `input.png` beside the response.
The actual renderer image bytes are checked before sampling.

For the two-example folding agent, see [TINKER_FOLD_USAGE.md](TINKER_FOLD_USAGE.md).
The answer is printed and saved under `EXPERIMENT_SETUP/runs/tinker-image-*/response.json`.

Requires `tinker`, `tinker-cookbook`, and Pillow in your Python environment.
There is one inference sample per invocation; SDK setup/polling can involve
additional HTTP requests. No automatic second sample is requested.

The agent has not viewed either image or executed this script. Online verification
confirms the documented usage pattern, not a successful inference in your environment.
