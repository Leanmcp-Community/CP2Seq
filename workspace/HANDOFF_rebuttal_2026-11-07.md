# Handoff: CP2Seq rebuttal work (state at 2026-11-07 14:05 PST)

Repo `/Users/luxian/FoldOriganmi`, branch `lu/preprint` (pushed to origin, last commit c8bb97d0).
Talk to the user in Chinese. Full results + definitions: `workspace/RESULTS/REBUTTAL_RUNS_2026-11-07.md`
(read it first; B = basic tools, L = legal-fold list, A = automatic tier-3 feedback, L+A = paper's "A";
E_id scoring; easy/mid/hard/layers groups).

## Hard rules
- NEVER run python / eval / training / model runs yourself. Write a `.sh` (or give the exact command);
  the user runs it. Node offline analysis (no model calls) has been run by the assistant.
- `.env` holds ANTHROPIC_API_KEY: never print/commit it.
- Claude arm goes through `claude -p` on the claude.ai login; when quota runs out it bills
  "extra usage" (~$12 increments). Check cost before scaling any Claude run.

## Experiments in flight (scripts/rebuttal/8_generality.sh)
All: L+A, text only (`IMAGE_HISTORY=none`), low effort, 80 turns; easy-0001..0010 (all-layers
action space) + layers-0001..0010 (some-generated-d5, any). Runs in `CODEX_HARNESS_TESTING/runs/` (git-ignored).

1. **Luna pass@5** (`ARMS=luna-pass5`, Codex CLI, ChatGPT subscription, no API cost). Running.
   - repeat 1: easy `codex-20261107T175431422982Z` 2/10 (easy-0006, 0010);
     layers `codex-20261107T183433007248Z` 5/10 (0002, 0004, 0005, 0008, 0009).
   - repeat 2 started: `codex-20261107T192735624427Z` (easy, at easy-0002).
   - pass@1 reference (earlier text-only L+A, `codex-20260925T*`): easy 5/10, layers 6/10.
   - A codex call hung ~2h at 10:37 (300 s timeout did not fire) but recovered; watch for hangs
     (`ps -o pid,etime,command -ax | grep "codex -a never"`).
   - When all 5 repeats finish: pass@1 per repeat and pass@5 (solved in >=1 of 5), easy/layers separately.

2. **Sonnet 5.5 pilot (10 instances)**, STOPPED by quota.
   - `claude-20261107T175727765597Z` (legacy prompt order, before caching fix, cost $82.32):
     easy-0001 Y, 0002 N, 0003 Y, 0004 Y.
   - `claude-20261107T183345423404Z` (fixed): easy-0005 N (cost $3.87).
   - `claude-20261107T190225893933Z`: layers-0001 errored at turn 15: "You've hit your 5-hour
     limit · resets 2pm" (429 x6). layers-0001..0005 still to do. Cost so far $0.86.
   - Resume when quota is back: edit the `sonnet10-rest` arm (or add one) to run only
     `layers-0001..0005`, then
     `caffeinate -i env EXECUTE=1 ARMS=<arm> bash scripts/rebuttal/8_generality.sh`.
   - Cost after the caching fix: ~$0.05-0.06/turn (~$2-5 per episode). Verify with
     `turn-*/process.json` (`cache_read_input_tokens` rising, `total_cost_usd`).
   - Note in the paper: the 4 earliest Sonnet episodes used the legacy prompt order.

## Fixes made today (committed)
- `claude_fold_loop.py`: `--action-space`, `--oracle-stop`, `--image-history none`,
  `--prompt-layout` (default history-first), `prompt_blocks()` = head / one block per history
  entry (separator before entry) / tail, cache breakpoint ttl 1h on last history block.
  Offline check `workspace/check_prompt_blocks.py` passes (229 turns).
- `codex_fold_loop.py`: `--image-history none`, `--oracle-stop`.
- Analyses: `workspace/exploration_analysis.mjs` (H2), `workspace/audit_passed_through.mjs`.

## Key conclusions so far (details in the results note)
- Same-modality (text+images): B 2/40, B+A 5/40, L 5/40, L+A 9/40 (E_id; L 6 and L+A 10 were E_plane). Text only: B 3, L 5, L+A 11.
- Modality (B): text 3/40, images-only 1/40, text+images 2/40: images don't replace coordinates.
- Blind search: random legal folding solves 57% (easy) / 96% (layers) of 80-fold episodes; BFS
  solves mid 5/10. "Depth wall" framing must change: only hard is 0 for every method.
- Oracle-stop audit: 25 -> 27 of 143; failures = never reaching the target.
- Exploration: model reaches 1/10-1/4 the distinct states random does (H2 supported).
- Sonnet so far 3/5 easy vs Luna 2/5 on the same instances (small n).

## Open TODO (in order)
1. Monitor Luna pass@5 to the end; compute pass@1/pass@5 tables; add to the results note; commit+push.
2. Resume Sonnet layers-0001..0005 after quota resets; then decide sonnet20 / haiku20.
3. Qwen backend (not written) for a size contrast; correlate with spatial-reasoning benchmarks (H3).
4. Paper edits (uncommitted .tex changes exist in PAPER_FINAL/iclr2026/sections/): add the
   modality table, B+A, matched-baseline table, revised depth-wall text, passed-through paragraph,
   exploration result; fill `\pending{Images-only ...}` in 09-results.tex. Rename paper's "A" to L+A.
5. Optional: Haiku-ranked hybrid search re-run on informative instances (easy-0002/0003/0007,
   mid-0002/0004/0007), metric expansions-to-solve.
