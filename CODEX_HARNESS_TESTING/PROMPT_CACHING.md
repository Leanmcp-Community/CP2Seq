# Prompt layout

New Codex runs default to `--prompt-layout history-first`:

1. Fixed instructions, crease pattern, and target geometry.
2. Accumulated action/result history, in its existing order.
3. Current state, turn number, budget, and image manifest.

History grows at the end of its existing content. Moving current state after history
keeps more text identical from the start of consecutive prompts. No messages or images
are dropped. Image attachment handling and all stopping rules remain unchanged.

The layout is recorded in each run's `config.json`. It changes input ordering, so report
it when comparing with older experiments. `--prompt-layout legacy` restores the earlier
order. The episode resume helper restores the source layout automatically, treating
configs without this field as legacy. Existing running processes retain their loaded code.

This improves the opportunity for server-side cache reuse; it does not guarantee hits
or a particular credit saving, and does not reduce total prompt length. Per-turn
`events.jsonl` records `turn.completed.usage.input_tokens` and `cached_input_tokens`.
Compare their ratio on actual new runs before claiming a measured improvement.

Execution and runtime validation of this change are left to the user.
