"""Schemas supplied to the native Qwen3.5 tool-aware vision renderer."""


def tool(name, description, properties=None, required=None):
    return {"type": "function", "function": {"name": name, "description": description,
            "parameters": {"type": "object", "properties": properties or {},
                           "required": required or [], "additionalProperties": False}}}


TOOLS = [
    tool("add_fold", "Append a 180-degree fold. Choose angle_index OR angle_degrees. Partial top/bottom runs must not tear connected paper.", {
        "angle_index": {"type": "integer", "enum": [0, 1, 2, 3]},
        "angle_degrees": {"type": "number", "description": "Line angle counterclockwise from +x; offset uses unit normal (-sin(theta), cos(theta))."},
        "selection_mode": {"type": "string", "enum": ["all", "top", "bottom"]},
        "layer_count": {"type": "integer", "minimum": 1, "description": "Required for top/bottom, omit for all."},
        "offset": {"type": "number"}, "move_positive": {"type": "boolean"},
        "over": {"type": "boolean"}}, ["offset", "move_positive", "over"]),
    tool("remove_fold", "Remove 1-based fold; replay the rest transactionally.",
         {"step": {"type": "integer", "minimum": 1}}, ["step"]),
    tool("go_to_step", "Keep the first N folds; zero clears the sequence.",
         {"step": {"type": "integer", "minimum": 0}}, ["step"]),
    tool("restore_revision", "Restore a returned revision, including abandoned branches.",
         {"revision": {"type": "integer", "minimum": 0}}, ["revision"]),
    tool("get_images", "Render top, two oblique, X-ray, and exploded-stack PNGs at a completed step.",
         {"step": {"type": "integer", "minimum": 0}}),
    tool("get_state", "Inspect the current sequence and bottom-to-top layer polygons."),
    tool("list_legal_folds", "List the folds that are legal in the current state and on-target for the CP. "
         "Read-only. Every listed action is accepted verbatim by add_fold while the state is unchanged.", {
        "max_results": {"type": "integer", "minimum": 1},
        "selection_filter": {"type": "string", "enum": ["any", "all", "top", "bottom"]},
        "include_rejected": {"type": "boolean"}}),
    tool("compare_to_target", "Compare the current stack with the target folded state. Read-only. "
         "Detail is fixed by the run's configured tier, not by you. Uses the target state only; "
         "the reference fold sequence is never consulted."),
    tool("finish", "End this episode and evaluate the current sequence."),
]

# The Codex loop exposes only a subset in its baseline condition; the enumerator changes
# what the benchmark measures, so it must be requested explicitly. See TODO.md.
ENUMERATION_TOOLS = ("list_legal_folds",)
COMPARE_TOOLS = ("compare_to_target",)


def tools_for(mode, compare_tier=0):
    """The action set for one experimental condition.

    compare_to_target appears only when a tier is configured, so the default arms are
    byte-identical to every run recorded before the comparison tool existed.
    """
    if mode == "base":
        chosen = [t for t in TOOLS if t["function"]["name"] not in ENUMERATION_TOOLS]
    elif mode == "legal-folds":
        chosen = list(TOOLS)
    else:
        raise ValueError(f"Unknown tool mode: {mode}")
    if not compare_tier:
        chosen = [t for t in chosen if t["function"]["name"] not in COMPARE_TOOLS]
    return chosen
