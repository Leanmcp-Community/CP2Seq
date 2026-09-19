"""Schemas supplied to the native Qwen3.5 tool-aware vision renderer."""


def tool(name, description, properties=None, required=None):
    return {"type": "function", "function": {"name": name, "description": description,
            "parameters": {"type": "object", "properties": properties or {},
                           "required": required or [], "additionalProperties": False}}}


TOOLS = [
    tool("add_fold", "Append one all-layers 180-degree fold in current coordinates.", {
        "angle_index": {"type": "integer", "enum": [0, 1, 2, 3]},
        "offset": {"type": "number"}, "move_positive": {"type": "boolean"},
        "over": {"type": "boolean"}}, ["angle_index", "offset", "move_positive", "over"]),
    tool("remove_fold", "Remove 1-based fold; replay the rest transactionally.",
         {"step": {"type": "integer", "minimum": 1}}, ["step"]),
    tool("go_to_step", "Keep the first N folds; zero clears the sequence.",
         {"step": {"type": "integer", "minimum": 0}}, ["step"]),
    tool("restore_revision", "Restore a returned revision, including abandoned branches.",
         {"revision": {"type": "integer", "minimum": 0}}, ["revision"]),
    tool("get_images", "Render top, two oblique, and darker-overlap X-ray PNGs at a completed step.",
         {"step": {"type": "integer", "minimum": 0}}),
    tool("get_state", "Inspect the current sequence and bottom-to-top layer polygons."),
    tool("finish", "End this episode and evaluate the current sequence."),
]
