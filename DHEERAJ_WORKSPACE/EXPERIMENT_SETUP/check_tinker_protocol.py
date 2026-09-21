"""Check native Qwen tool parsing and multimodal history locally; no API samples.

Tokenizer/image processor may download from Hugging Face on first use.
"""
from PIL import Image
from tinker_cookbook import renderers
from tinker_cookbook.image_processing_utils import get_image_processor
from tinker_cookbook.tokenizer_utils import get_tokenizer
from image_assets import check_prompt_assets
from tinker_describe_image import MODEL
from tool_schemas import tools_for

# The Tinker condition keeps the original action set; the enumerator is a Codex-side
# experiment for now, so it stays out until the Tinker loop grows the same flag. See TODO.md.
TOOLS = tools_for("base")


def main():
    tokenizer = get_tokenizer(MODEL)
    renderer = renderers.get_renderer("qwen3_5_disable_thinking", tokenizer,
                                      image_processor=get_image_processor(MODEL))
    xml = ('<tool_call>\n<function=add_fold>\n'
           '<parameter=angle_index>0</parameter>\n<parameter=offset>0.5</parameter>\n'
           '<parameter=move_positive>true</parameter>\n<parameter=over>true</parameter>\n'
           '</function>\n</tool_call><|im_end|>')
    message, termination = renderer.parse_response(tokenizer.encode(xml, add_special_tokens=False))
    assert termination.is_clean, termination
    assert len(message.get("tool_calls", [])) == 1, message
    call = message["tool_calls"][0]
    assert call.function.name == "add_fold"
    import json
    assert json.loads(call.function.arguments) == {"angle_index": 0, "offset": .5, "move_positive": True, "over": True}
    messages = renderer.create_conversation_prefix_with_tools(TOOLS, system_prompt="Fold one step at a time.")
    messages.extend([{"role": "user", "content": "Start."}, message,
                     {"role": "tool", "name": "add_fold", "tool_call_id": call.id or "",
                      "content": [{"type": "text", "text": '{"ok":true}'},
                                  {"type": "image", "image": Image.new("RGB", (512, 512), "white")}]}])
    prompt = renderer.build_generation_prompt(messages)
    print("Native XML tool call and multimodal tool-result round trip passed.")
    print(f"Prompt tokens: {prompt.length}; actual image bytes: {check_prompt_assets(prompt)}")


if __name__ == "__main__":
    main()
