# Rebuttal runs, 2026-11-06 to 2026-11-07: results and conclusions

## Definitions

Tool conditions (what the model can call besides folding):

| label | name | what the model gets |
| --- | --- | --- |
| **B** | basic tools | `add_fold`, `remove_fold`, `go_to_step`, `restore_revision`, `get_state`, `get_images`, `finish`. A fold whose creases are not in the crease pattern (CP) is rejected with an explanation; nothing else helps. |
| **L** | legal-fold list | B plus `list_legal_folds`: enumerates every fold that is legal now and stays inside the CP, so the model can pick from a list instead of computing fold parameters. A rejected fold also returns this list. |
| **A** | automatic feedback | Every accepted fold returns `comparison_now`: tier-3 comparison of the current stack with the target (layer count difference, which layers differ, what each should be). Costs no turn. |
| **B+A** | basic + feedback | B with A, no legal list. New in this round. |
| **L+A** | legal list + feedback | L with A. **The paper's tables call this condition "A"**; here it is written L+A to make clear it includes the legal list. |

Input modality (how the geometry reaches the model):

| label | meaning |
| --- | --- |
| text only | JSON coordinates of the CP, target and current stack; no images (`image_history=none`). |
| images only | Rendered images only; no coordinates anywhere, only the stack bounding box (`--geometry images-only`). |
| text + images | Both (`image_history=all`, every earlier image re-attached). |

Instance groups: **easy / mid / hard** are 10 instances each from the all-layers corpus
(reference sequences of about 4-10, 11-13, and 15-19 whole-stack folds); **layers** is 10
instances from the some-layers corpus (5 folds, partial-stack folds allowed).

Scoring: **E_id** = the final stack matches the target layer by layer including which part of
the sheet each layer is (identity-aware, up to the CP's symmetries); **E_plane** = the older
looser match on shape and parity only. **pass@k** = solved in at least one of k independent
runs of the same instance.

## Setup

All model runs are GPT-5.6 Luna, low reasoning effort, 80-turn budget, 300 s timeout, on the
40 ablation instances (easy/mid/hard-0001..0010 in the all-layers action space,
layers-0001..0010 from some-generated-d5 in the any action space), unless stated. Scores are
E_id (identity-aware terminal match) unless stated. Raw run directories are git-ignored
(`CODEX_HARNESS_TESTING/runs/`); the per-episode outcomes of the new runs are exported to
`workspace/RESULTS/new-conditions/episodes.json`.

## 1. New tool condition: B+A (basic tools + automatic tier-3 feedback, no legal list)

Runs `codex-20261106T235355009576Z` (easy/mid/hard) and `codex-20261107T060718355927Z`
(layers). Text + images (`image_history=all`).

E_id, one episode per instance, an instance with no completed episode (protocol failure)
counts as unsolved, so every total is out of 40.

Text + images (`image_history=all`), the modality B+A was run in. B, L, L+A rows are the
paper's image ablation (run inventory, identity flips applied):

| condition | easy | mid | hard | layers | total |
| --- | --- | --- | --- | --- | --- |
| B | 2/10 | 0/10 | 0/10 | 0/10 | 2/40 |
| **B+A** | **3/10** | **0/10** | **0/10** | **2/10** | **5/40** |
| L | 1/10 | 0/10 | 0/10 | 5/10 | 6/40 |
| L+A | 4/10 | 0/9 (+1 failure) | 0/10 | 6/10 | 10/40 |

Text only (`image_history=none`, local runs `codex-20260925T*`, first episode per
instance), for reference; these are the paper's text-only 3 / 5 / 11:

| condition | easy | mid | hard | layers | total |
| --- | --- | --- | --- | --- | --- |
| B | 3/10 | 0/10 | 0/9 (+1 failure) | 0/10 | 3/40 |
| L | 1/10 | 0/9 (+1 failure) | 0/10 | 4/10 | 5/40 |
| L+A | 5/10 | 0/9 (+1 failure) | 0/10 | 6/10 | 11/40 |

Correction to an earlier draft of this note: it listed L text-only as 7/39 (that was
E_plane; two easy solves fail E_id) and L+A easy as "9/20, two runs" (it mixed a
text-only and a text+images run).

**Conclusion.** Against B in the same modality (text + images, 2/40), automatic feedback
alone adds 3 solves (5/40: +1 easy, +2 layers); adding the legal list instead gives 6/40, and
both together 10/40. The gain comes from
constraining the action space (legal-fold list); feedback helps on top of it. Feedback and
action constraint are complementary; feedback without the constraint is not enough.

## 2. Input modality: text-only vs images-only vs text+images (basic tools B)

Images-only runs `codex-20261106T235442689294Z` + `codex-20261107T062854945223Z`
(`--geometry images-only`: no coordinates anywhere; images + stack bounding box only).
Text+images numbers are the paper's image ablation (run inventory, identity flips applied).

| input | easy | mid | hard | layers | total |
| --- | --- | --- | --- | --- | --- |
| text only | 3/10 | 0/10 | 0/10 | 0/10 | 3/40 |
| images only | 1/10 | 0/10 | 0/10 | 0/10 | 1/40 |
| text + images | 2/10 | 0/10 | 0/10 | 0/10 | 2/40 |

Other tool conditions (no images-only arm): L text-only 5/40 vs text+images 6/40;
A text-only 11/40 vs text+images 10/40.

**Conclusion.** Removing coordinates lowers easy from 3 to 1; adding images to coordinates
does not help (3 -> 2). All differences are small and not significant at n=40. Supported
claim: images do not substitute for coordinates, and the task measures geometric reasoning
over an exact symbolic state more than visual perception. Images-only was run for B only.

## 3. Matched blind-search baselines (no model)

`workspace/RESULTS/matched-baselines/report.md`. Random: 100 episodes x 80 uniformly random
legal folds per instance, oracle success check after every fold. BFS: identity-keyed, depth
cap reference+4, 600 s wall clock.

| group | random: instances with >=1 solve | random: mean per-episode solve rate | BFS <=80 | BFS <=1000 | BFS <=10000 | BFS <=100000 |
| --- | --- | --- | --- | --- | --- | --- |
| easy | 9/10 | 0.572 | 7 | 9 | 10 | 10 |
| mid | 3/10 | 0.005 | 0 | 0 | 3 | 5 |
| hard | 0/10 | 0.000 | 0 | 0 | 0 | 0 |
| layers | 10/10 | 0.959 | 9 | 10 | 10 | 10 |

**Conclusion (revises the "depth wall" framing).** Under the same 80-fold budget, random
legal folding solves 57% of easy episodes and 96% of layers episodes; the best model
condition solves about 45-60% of instances in those groups. Medium is solvable by search
(BFS 5/10). So the model is far less efficient than blind enumeration on easy, layers and
medium; only hard is 0 for every method, and that is the real wall.

## 4. Passed-through / oracle-stop audit (free)

`workspace/RESULTS/passed-through/report.md`. Replaying every visited accepted state: an
automatic stop on first match would raise solves from 25 to 27 of 143 saved episodes.
**Failures are not "reached the target but did not submit"; the model mostly never reaches
it.** The paid oracle-stop arm was therefore not run.

## 5. Exploration analysis (H2, free)

`workspace/RESULTS/exploration/report.md`, `workspace/exploration_analysis.mjs`. Distinct
folded states reached per episode (flat sheet excluded), model vs 20 random episodes x 80
folds on the same instance (median of per-instance ratios):

| condition | easy: model vs random | ratio | layers: model vs random | ratio |
| --- | --- | --- | --- | --- |
| B, images only | 4.3 vs 43.9 | 0.12 | 1.8 vs 31.1 | 0.07 |
| B, text only | 4.8 vs 43.7 | 0.11 | 3.3 vs 32.7 | 0.12 |
| B+A, text+images | 5.3 vs 43.9 | 0.12 | 3.5 vs 31.1 | 0.11 |
| L, text only | 8.0 vs 43.7 | 0.16 | 7.0 vs 32.7 | 0.24 |
| L+A, text only | 12.8 vs 43.7 | 0.25 | 7.6 vs 32.7 | 0.18 |

With basic tools 72-81% of proposals are rejected; with the legal list about 57-65% of
accepted moves revisit a state already reached. Solved episodes used fewer reasoning tokens
per turn (262) than unsolved ones (504).

**Conclusion.** The model explores 1/10 to 1/4 as many distinct states as random folding,
and the ordering matches solve rate (B < L < L+A). Caveat: part of the gap is that model
episodes end early (20-45 turns, cycling rule or finish) while random always uses 80 folds.

## 6. LLM-ranked hybrid search (Haiku), earlier

1/11 solved with Claude Haiku 5.5 ranking vs 1/11 with random ranking ($1.27). Floor effect:
the instances were too hard to separate rankers. A re-run on informative instances
(easy-0002/0003/0007, mid-0002/0004/0007) with expansions-to-solve as the metric is pending.

## 7. Cross-family pilot: Claude Sonnet 5.5 (PAUSED)

Run `claude-20261107T175727765597Z`, L+A, text only, low effort, through `claude -p`.
Finished: easy-0001 solved, easy-0002 unsolved, easy-0003 solved, easy-0004 solved (3/4);
easy-0005 interrupted at turn ~40. Luna L+A text-only on the same four
(`codex-20260925T075532843255Z`): 2/4 (easy-0002, easy-0004). easy-0003 (10 folds, random 0/100,
BFS 7077 expansions) was solved by Sonnet.

**Cost incident.** The claude.ai subscription quota ran out and billing switched to extra
usage: 226 turns cost $81.49 (CLI-reported), about $0.36/turn. Cause: the whole per-turn
prompt was one text block, so only the 11k-token system prompt was ever read from cache
and ~60k tokens were written to cache every turn. Fixed in
`CODEX_HARNESS_TESTING/claude_fold_loop.py` (`prompt_blocks`: head / one block per history
entry / tail, cache breakpoint on the last history block; same text). A second cause: the
Claude loop had no `--prompt-layout` flag and fell back to the legacy order (current state
before history), unlike the Codex arms (history-first); it now defaults to history-first.
**The four finished pilot episodes therefore used the legacy prompt order**; resumed
episodes will not, so either report that or rerun all ten. Verify offline with
`.venv/bin/python workspace/check_prompt_blocks.py` and on one paid instance before resuming
with `ARMS=sonnet10-rest` in `scripts/rebuttal/8_generality.sh`.

## 8. Running

Luna pass@5 (`ARMS=luna-pass5`, L+A text-only, easy+layers 20 instances x 5 repeats) started
2026-11-07; pass@1 reference is the earlier text-only L+A run (easy 5/10, layers 6/10).

## Open plan

1. Luna pass@5 (H2: is the bottleneck exploration?).
2. Sonnet 5.5 finish 10, then 20 instances; Haiku 5.5 for a within-family size contrast.
3. Qwen (needs an API backend; not written).
4. Correlate per-model efficiency with public spatial-reasoning scores (H3).
