# Open-source and open-weight VLM candidates

Checked 2026-09-17 against the primary sources linked below. This is a practical shortlist,
not an exhaustive catalog or a claim that any model already works on origami.
The [pilot plan](PLAN.md) owns evaluation and viewer requirements.

“Permissively licensed” below means the checkpoint is published under Apache-2.0 or MIT.
That does not establish that every training dataset or the entire training process is open.
Custom-license open weights are listed separately. Image support does not establish reliable
fold planning, native function calling, endpoint compatibility, or access to reasoning text.
**All repository integration and origami results are currently untested.**

## Permissively licensed shortlist

| Exact checkpoint | License reported by official card | Why test it here (our assessment) | Integration check |
| --- | --- | --- | --- |
| [Qwen/Qwen3-VL-8B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct) | Apache-2.0 | First candidate: dedicated image/text instruction model at a manageable initial scale | Verify image detail, action JSON, and multi-turn feedback; do not require a reasoning stream |
| [Qwen/Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B) | Apache-2.0 | Another current image/text candidate to compare with Qwen3-VL | Pin vision-capable serving support and chat template; record reasoning mode and any returned reasoning |
| [OpenGVLab/InternVL3_5-8B](https://huggingface.co/OpenGVLab/InternVL3_5-8B) | Apache-2.0 | Compare a different multimodal model family at a similar scale | Verify image preprocessing and conversation template; structured JSON may need an adapter |
| [google/gemma-4-31B-it](https://huggingface.co/google/gemma-4-31B-it) | Apache-2.0 | Larger image/text comparator when suitable compute is available | Check memory and serving support for this exact checkpoint before scheduling |
| [microsoft/Phi-4-multimodal-instruct](https://huggingface.co/microsoft/Phi-4-multimodal-instruct) | MIT | Smaller multimodal alternative for a cost/quality comparison | Use the vision input path and validate action formatting; audio is unnecessary here |
| [HuggingFaceTB/SmolVLM2-2.2B-Instruct](https://huggingface.co/HuggingFaceTB/SmolVLM2-2.2B-Instruct) | Apache-2.0 | Lightweight image/multi-image baseline for testing the harness | Fine crease geometry and action reliability need measurement; small size is not proof of suitability |

Suggested initial order: Qwen3-VL-8B-Instruct, Qwen3.5-9B, then InternVL3.5-8B.
This is an integration priority, not an observed accuracy ranking. Add the remaining candidates
on the same 10 examples as compute permits. Hardware/backend availability has not been checked;
no model has been downloaded, installed, or called for this plan.

Choose and record the exact checkpoint revision and quantization before running. Weight size
alone is not a GPU memory requirement: image tokens, context, cache, and runtime overhead add
memory. Hosting an open model does not imply that a hosted API is free or supports its vision
and tool features. Test the actual endpoint using the pilot's inputs.

## Custom-license open-weight alternative

[google/gemma-3-4b-it](https://huggingface.co/google/gemma-3-4b-it) accepts image/text input
and is available under Google's Gemma terms with an access agreement. It is an optional
older, smaller comparator, listed separately from the permissive-license group. Do not carry
Gemma 3's license classification over to Gemma 4 or assume all sizes in a family have vision.

## SAM 3: available, but a different role

**Yes: public code and downloadable model checkpoints are available.** Meta provides
inference examples for image/video segmentation, and its README requires requesting checkpoint
access and authenticating after approval. See the [official repository](https://github.com/facebookresearch/sam3)
and [checkpoint page](https://huggingface.co/facebook/sam3).

The project uses the custom [SAM License](https://github.com/facebookresearch/sam3/blob/main/LICENSE),
which grants use and modification rights subject to its terms. Describe it as publicly available
code and open weights under a custom license, not as Apache/MIT software or unconditionally
OSI-approved open source. Usability here depends on checkpoint access and compatible hardware.

SAM 3 detects, segments, and tracks objects using text or visual prompts; it does not replace
the conversational VLM that chooses a fold. The official setup lists Python 3.12+, PyTorch 2.7+,
and a CUDA GPU with CUDA 12.6+. The repository also announces SAM 3.1 checkpoints; pin the
chosen release explicitly if this is explored later. These are documented prerequisites,
not a verified installation on this machine. [Source](https://github.com/facebookresearch/sam3)

Our assessment: a later optional tool could return paper/flap masks, boxes, and scores for
photographs or video. It cannot establish crease topology, hidden layer order, or fold legality.
For synthetic renderings we already control the geometry and face IDs, so start without SAM;
there is no need to infer masks before testing the core VLM loop. If later added, record its
prompts and mask outputs in the same viewer timeline. No SAM integration is part of this pilot.
