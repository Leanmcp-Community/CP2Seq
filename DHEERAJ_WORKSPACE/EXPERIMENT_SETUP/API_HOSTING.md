# VLM models and where to access them

Checked **2026-09-17** against the linked provider documentation. These are published
availability findings; no inference calls or deployments have been tested.

| Model | Provider and access link | How you access it |
| --- | --- | --- |
| **Gemini 2.5 Flash** (`gemini-2.5-flash`) | [Google Gemini API](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash) · [Get API key](https://aistudio.google.com/apikey) | Managed API with image input. Proprietary; cannot self-host its weights. |
| **Qwen3.5-9B** (`Qwen/Qwen3.5-9B`) | [Together AI](https://www.together.ai/models/qwen3-5-9b) · [DeepInfra](https://deepinfra.com/Qwen/Qwen3.5-9B/api) | Managed vision APIs; no GPU deployment required. |
| **Qwen3.5-9B** | [Fireworks](https://fireworks.ai/models/fireworks/qwen3p5-9b) | Dedicated deployment with image support. Provision it first; the checked listing says serverless is unsupported. |
| **Qwen3.5-9B** | [Tinker](https://tinker-docs.thinkingmachines.ai/tinker/models/) | Supported vision model through native sampling. Image support on its compatible HTTP endpoint was not verified. |
| **Qwen3-VL-8B-Instruct** (`Qwen/Qwen3-VL-8B-Instruct`) | [Fireworks](https://fireworks.ai/models/fireworks/qwen3-vl-8b-instruct) | Dedicated deployment with image support; not serverless in the checked listing. |
| **Gemma 4 31B IT** (`google/gemma-4-31B-it`) | [DeepInfra](https://deepinfra.com/google/gemma-4-31B-it/api) | Managed multimodal API. |
| **Gemma 4 31B IT** | [Fireworks](https://fireworks.ai/models/fireworks/gemma-4-31b-it) | Dedicated deployment with image support; provision it first. |
| **Gemma 3 4B IT** (`google/gemma-3-4b-it`) | [DeepInfra](https://deepinfra.com/google/gemma-3-4b-it/api) | Managed multimodal API. Fireworks also lists it, but explicitly marks image input unsupported, so exclude that route for this task. |
| **InternVL3.5-8B** (`OpenGVLab/InternVL3_5-8B`) | [Hugging Face weights](https://huggingface.co/OpenGVLab/InternVL3_5-8B) → your GCP GPU VM or Modal deployment | No exact-model managed API confirmed in the checked Fireworks, Together, Tinker, or HF provider listings. Plan to self-host. |
| **Phi-4-multimodal-instruct** (`microsoft/Phi-4-multimodal-instruct`) | [Hugging Face weights](https://huggingface.co/microsoft/Phi-4-multimodal-instruct) → your GCP GPU VM or Modal deployment | No exact-model managed API confirmed in those listings. Plan to self-host. |
| **SmolVLM2-2.2B-Instruct** (`HuggingFaceTB/SmolVLM2-2.2B-Instruct`) | [Hugging Face weights](https://huggingface.co/HuggingFaceTB/SmolVLM2-2.2B-Instruct) → your GCP GPU VM or Modal deployment | No exact-model managed API confirmed in those listings. Plan to self-host. |

“Not confirmed” does not mean unavailable everywhere. A downloadable HF checkpoint is not
itself a hosted API, and another size or generation is not the same model.

## API connection details

| Provider | API base URL | Credential | Model identifier |
| --- | --- | --- | --- |
| Google | `https://generativelanguage.googleapis.com/v1beta/openai` | Gemini API key | `gemini-2.5-flash` |
| Together | `https://api.together.xyz/v1` | Together API key | `Qwen/Qwen3.5-9B` |
| DeepInfra | `https://api.deepinfra.com/v1/openai` | DeepInfra token | Exact Qwen/Gemma IDs above |
| Fireworks | `https://api.fireworks.ai/inference/v1` | Fireworks API key | Your `accounts/<account>/deployments/<id>` after provisioning |
| Tinker | `https://tinker.thinkingmachines.dev/services/tinker-prod/oai/api/v1` | Tinker API key | `tinker://.../sampler_weights/...`; image transport needs verification |
| Your GCP / Modal server | Your deployment URL ending in `/v1` | Your server's credentials | The model name configured in your server |

These compatible APIs use `/chat/completions` after the base URL. Sources:
[Google](https://ai.google.dev/gemini-api/docs/openai),
[Together](https://www.together.ai/serverless-inference),
[DeepInfra](https://deepinfra.com/Qwen/Qwen3.5-9B/api),
[Fireworks](https://docs.fireworks.ai/api-reference/post-chatcompletions),
[Tinker](https://tinker-docs.thinkingmachines.ai/tinker/compatible-apis/openai/).

## Where self-hosting happens

- **GCP:** deploy the HF model on an NVIDIA GPU VM in your own Google Cloud project. Run
  vLLM there and call its API from the experiment machine. [GCP setup guidance](https://cloud.google.com/blog/topics/developers-practitioners/vllm-performance-tuning-the-ultimate-guide-to-xpu-inference-configuration)
- **Modal:** deploy your own GPU container and expose its model server as an API. Modal
  supplies infrastructure; this is not an already-running shared model endpoint.
  [Modal serving example](https://modal.com/docs/examples/vllm_inference)
- **Serving software:** vLLM's current support table lists these open-model architecture
  families. Verify the exact checkpoint against the installed release. If necessary, use
  its official Transformers implementation behind an HTTP service.
  [vLLM supported models](https://docs.vllm.ai/en/latest/models/supported_models/)

You deploy an existing model implementation; you generally do not need to implement the
model yourself. The experiment loop and corpus can stay on your laptop while the GPU server
handles inference. Gemini is the exception: use Google's API rather than downloading weights.

## Practical starting set

1. **Gemini 2.5 Flash → Google API.**
2. **Qwen3.5-9B → Together or DeepInfra.**
3. **Gemma 4 31B → DeepInfra.**
4. **Qwen3-VL-8B → Fireworks dedicated deployment**, or your own GCP/Modal server.
5. **InternVL3.5, Phi-4 multimodal, SmolVLM2 → GCP/Modal self-hosting** if you want those exact checkpoints.

Tinker is an additional Qwen3.5 option, but its native vision sampling and checkpoint HTTP
interface are different integration paths. Do not assume a bare HF model ID works on its
compatible HTTP endpoint. Its current catalog marks the older Qwen3-VL 30B/235B models retired.
[Current and retired models](https://tinker-docs.thinkingmachines.ai/tinker/models/)

## Other listings requiring verification

HF reports a live Featherless mapping for Qwen3-VL-8B, but that metadata alone does not verify
image handling. Its Novita mapping reports an error. For Gemma 4, HF lists Novita and
Featherless as live, while Together's mapping reports an error; DeepInfra is the checked
multimodal API route above.
[Qwen3-VL provider mapping](https://huggingface.co/api/models/Qwen/Qwen3-VL-8B-Instruct?expand=inferenceProviderMapping),
[Gemma 4 provider mapping](https://huggingface.co/api/models/google/gemma-4-31B-it?expand=inferenceProviderMapping).

The checked HF provider mappings were empty for
[InternVL3.5-8B](https://huggingface.co/api/models/OpenGVLab/InternVL3_5-8B?expand=inferenceProviderMapping),
[Phi-4 multimodal](https://huggingface.co/api/models/microsoft/Phi-4-multimodal-instruct?expand=inferenceProviderMapping), and
[SmolVLM2](https://huggingface.co/api/models/HuggingFaceTB/SmolVLM2-2.2B-Instruct?expand=inferenceProviderMapping).

SAM 3 remains a separate segmentation tool, not a conversational fold-planning VLM.
Its availability and license are documented in [OPEN_SOURCE_VLMS.md](OPEN_SOURCE_VLMS.md).
