"""Bound local PNGs and check actual renderer image bytes before paid inference."""
import hashlib
from io import BytesIO

ASSET_LIMIT = 2_097_152  # Limit reported by the Tinker endpoint, 2026-09-17.
DEFAULT_MAX_BYTES = 1_800_000
DEFAULT_MAX_EDGE = 1024


def prepare_image(source, *, max_edge=DEFAULT_MAX_EDGE, max_bytes=DEFAULT_MAX_BYTES):
    from PIL import Image, ImageOps
    if not 64 <= max_edge <= 4096:
        raise ValueError("max_edge must be between 64 and 4096")
    if not 1024 <= max_bytes < ASSET_LIMIT:
        raise ValueError(f"max_bytes must be between 1024 and {ASSET_LIMIT - 1}")
    image = ImageOps.exif_transpose(source).convert("RGB")
    original = list(image.size)
    image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    while True:
        buffer = BytesIO()
        # Keep a lossless artifact and bound the cookbook's default JPEG encoding too.
        image.save(buffer, format="PNG")
        data = buffer.getvalue()
        jpeg = BytesIO()
        image.save(jpeg, format="JPEG")
        if max(len(data), len(jpeg.getvalue())) <= max_bytes:
            return image, data, {"original_dimensions": original, "dimensions": list(image.size),
                                 "png_bytes": len(data), "renderer_jpeg_bytes": len(jpeg.getvalue()),
                                 "sha256": hashlib.sha256(data).hexdigest()}
        w, h = image.size
        if max(w, h) <= 64:
            raise ValueError("Image cannot fit the requested byte limit")
        image = image.resize((max(1, int(w * .8)), max(1, int(h * .8))), Image.Resampling.LANCZOS)


def check_prompt_assets(prompt, max_bytes=DEFAULT_MAX_BYTES):
    """Inspect the bytes actually sent, after renderer processing/re-encoding."""
    sizes = [len(chunk.data) for chunk in prompt.chunks if chunk.type == "image"]
    if not sizes:
        raise ValueError("Vision prompt has no inline image chunks")
    if any(size > max_bytes or size >= ASSET_LIMIT for size in sizes):
        raise ValueError(f"Rendered image asset exceeds limit: {sizes}; lower --max-image-edge")
    return sizes
