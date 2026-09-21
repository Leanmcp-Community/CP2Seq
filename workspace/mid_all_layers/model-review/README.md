# What the model did, turn by turn

The five mid samples run with `--action-space all-layers`, against the recorded
wide-action-space baseline in `CODEX_HARNESS_TESTING/runs/codex-20260921T085459155281Z`.
Result: 0/5 either way, and mid-0004 went backwards. See FINDINGS_search_cost.md section 5d.

## What is here, and what is not

One directory per sample, and inside it one per turn holding `tool.json`: the action the
model chose and what the simulator answered, which is the part worth reading. Plus each
run's `seq.json`, `final.fold`, `config.json` and `results.json`.

The full episode artifacts are 63 MB and are not in git. Almost none of that is the
decisions: 18.7 MB is the per-turn prompt, which repeats the whole geometry every turn,
14.7 MB is the CLI's own event stream, and 5.7 MB is rendered PNGs, which replaying
`seq.json` regenerates. What is left, and kept here, is 2.7 MB.

To see the images for any of these, replay the sequence:

    node workspace/rescore_runs.mjs <run-dir>

To regenerate the whole thing including prompts and events, rerun it -- the command and
every setting are in `config.json`:

    SKIP_SEARCH=1 MODEL=1 bash workspace/mid_all_layers_experiment.sh
