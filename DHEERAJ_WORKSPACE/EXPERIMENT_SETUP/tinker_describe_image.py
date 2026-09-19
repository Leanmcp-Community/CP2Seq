"""One image, one inference sample. Run from any directory; no training or loop.

The SDK also makes session/setup/polling HTTP requests: one sample is not one
literal HTTP transaction. No application-level retries or second sample.
"""
import argparse
import hashlib
import json
import os
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from image_assets import prepare_image, check_prompt_assets, DEFAULT_MAX_BYTES, DEFAULT_MAX_EDGE

MODEL = "Qwen/Qwen3.5-9B"
QUESTION = "What is this image? Describe it."
HERE = Path(__file__).resolve().parent
DEFAULT_IMAGE = HERE.parent.parent / "assets" / "VVVV.jpg"


@contextmanager
def progress(label):
    """Report a blocking stage without submitting any additional API requests."""
    started = time.monotonic()
    stopped = threading.Event()
    print(f"{label} ...", flush=True)

    def heartbeat():
        while not stopped.wait(10):
            print(f"  Still waiting: {label} ({time.monotonic() - started:.0f}s elapsed)", flush=True)

    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    try:
        yield
    except BaseException:
        print(f"  Stopped during: {label}", flush=True)
        raise
    else:
        print(f"  Done ({time.monotonic() - started:.1f}s)", flush=True)
    finally:
        stopped.set()
        thread.join(timeout=1)


def response_record(response):
    """Use public list properties: current Tinker responses are dataclasses."""
    return {
        "sequences": [
            {
                "tokens": list(sequence.tokens),
                "logprobs": sequence.logprobs,
                "stop_reason": sequence.stop_reason,
                "sequence_id": getattr(sequence, "sequence_id", None),
            }
            for sequence in response.sequences
        ],
        "prompt_logprobs": getattr(response, "prompt_logprobs", None),
        "prompt_cache_hit_tokens": getattr(response, "prompt_cache_hit_tokens", None),
    }


def main():
    parser = argparse.ArgumentParser(description="Describe one image with one Tinker inference sample.")
    parser.add_argument("--image", type=Path, default=DEFAULT_IMAGE,
                        help="Image path (relative to the current directory, or absolute)")
    parser.add_argument("--max-image-edge", type=int, default=DEFAULT_MAX_EDGE)
    parser.add_argument("--max-image-bytes", type=int, default=DEFAULT_MAX_BYTES)
    args = parser.parse_args()
    image_path = args.image.expanduser().resolve()
    if not os.environ.get("TINKER_API_KEY", "").strip():
        raise SystemExit("TINKER_API_KEY is not set in this terminal.")
    if not image_path.is_file():
        raise SystemExit(f"Image not found: {image_path}")

    with progress("1/7 Loading Tinker and image libraries"):
        import tinker
        from PIL import Image
        from tinker_cookbook import renderers
        from tinker_cookbook.image_processing_utils import get_image_processor
        from tinker_cookbook.tokenizer_utils import get_tokenizer

    # Decode locally for transmission only. Never display the image.
    with progress(f"2/7 Preparing {image_path.name}"):
        with Image.open(image_path) as source:
            picture, png, image_info = prepare_image(source, max_edge=args.max_image_edge,
                                                    max_bytes=args.max_image_bytes)
        image_hash = hashlib.sha256(image_path.read_bytes()).hexdigest()
        output = HERE / "runs" / ("tinker-image-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
        output.mkdir(parents=True, exist_ok=False)
        (output / "input.png").write_bytes(png)
        print(f"  Prepared {picture.width}×{picture.height}, {len(png):,} PNG bytes", flush=True)
    with progress("3/7 Loading tokenizer (Hugging Face download/cache)"):
        tokenizer = get_tokenizer(MODEL)
    with progress("4/7 Loading image processor and encoding image prompt"):
        renderer = renderers.get_renderer(
            name="qwen3_5_disable_thinking",
            tokenizer=tokenizer,
            image_processor=get_image_processor(MODEL),
        )
        prompt = renderer.build_generation_prompt([
            {"role": "user", "content": [
                {"type": "image", "image": picture},
                {"type": "text", "text": QUESTION},
            ]}
        ])
    # Fail before sampling if the vision renderer silently produced text only.
    chunk_types = [chunk.type for chunk in prompt.chunks]
    if not any("image" in kind for kind in chunk_types):
        raise SystemExit(f"No image chunk in rendered prompt: {chunk_types}")
    asset_sizes = check_prompt_assets(prompt, args.max_image_bytes)

    with progress(f"5/7 Connecting to Tinker and creating {MODEL} sampler"):
        service = tinker.ServiceClient()
        sampler = service.create_sampling_client(base_model=MODEL)
    with progress("6/7 Sending one image and waiting for one inference result"):
        response = sampler.sample(
            prompt=prompt,
            num_samples=1,
            sampling_params=tinker.types.SamplingParams(
                max_tokens=4096,
                temperature=0.0,
                stop=renderer.get_stop_sequences(),
            ),
        ).result()

    sequence = response.sequences[0]
    text = tokenizer.decode(sequence.tokens, skip_special_tokens=True).strip()
    # Display and save plain text before serializing optional response metadata.
    print("\n" + (text or "[No text returned.]"), flush=True)
    (output / "response.txt").write_text(text + "\n", encoding="utf-8")
    record = {
        "model": MODEL, "question": QUESTION, "image": str(image_path),
        "image_sha256": image_hash,
        "image_dimensions": list(picture.size), "prompt_chunk_types": chunk_types,
        "prepared_image": image_info, "uploaded_asset_bytes": asset_sizes,
        "sample_calls": 1, "response": response_record(response),
        "text": text,
    }
    with progress("7/7 Saving response metadata"):
        (output / "response.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(f"\nSaved: {output / 'response.json'}", flush=True)
    if getattr(sequence, "stop_reason", None) == "length":
        print("Response reached the token limit. No retry was made.")


if __name__ == "__main__":
    main()
