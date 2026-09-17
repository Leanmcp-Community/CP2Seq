# Tinker image-inference pricing snapshot

Checked 2026-09-17 against the live model catalogue. Scope:
`tinker_describe_image.py` and `tinker_fold_loop.py`; inference only, no training.

| Model | Input / 1M tokens | Cached input / 1M | Output / 1M |
| --- | ---: | ---: | ---: |
| Qwen/Qwen3.5-9B | $0.66 | $0.132 | $1.995 |

At the 4,096-output-token cap, output alone is at most approximately $0.00818 at
this listed rate. Input/image tokens are additional; this is not a total-cost cap.

[Full current model and operation price catalog](https://tinker-docs.thinkingmachines.ai/tinker/models/).
Prices can change. The script uses the native vision renderer and makes one sample
request; the SDK also performs session setup and polling. Tokenizer/image processor
assets may download from Hugging Face; model weights remain hosted on Tinker.

The folding pilot defaults to two examples × at most 40 sampling turns, starting
with 4,096 output tokens per turn. Truncation retries count against those turns
and may raise the cap to 8,192. Tool errors and image inspection also consume
turns. Input cost grows with the retained history, including image tokens.
The script verifies its 65,536-token context limit against server capabilities.

At 80 calls × 8,192 output tokens, the output-only ceiling at these rates is
about $1.31; input is additional. `usage.estimated_uncached_usd` applies the input
and output rates above to recorded token counts, without assuming cache savings.
It is an estimate, not an invoice or a spending cap. Every exact prompt and
completion is recorded; failed requests and SDK retries may affect actual billing.

Before launching, inspect the prepared PNGs, run the local replay/protocol checks,
confirm sample/turn counts and the live rates, and set `TINKER_API_KEY` locally.
