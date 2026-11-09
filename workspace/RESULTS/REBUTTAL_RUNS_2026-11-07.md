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
| L | 0/10 | 0/10 | 0/10 | 5/10 | 5/40 |
| L+A | 3/10 | 0/9 (+1 failure) | 0/10 | 6/10 | 9/40 |

Correction (2026-11-07 14:40): an earlier version of this table gave L 6/40 and L+A 10/40 (easy 1 and 4). Those were the E_plane counts; the paper (Table 1, cells marked §) withdraws one easy solve from each under E_id. All five B+A solves were re-checked on replay with `workspace/audit_identity.mjs --part A` and pass E_id.

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
alone adds 3 solves (5/40: +1 easy, +2 layers); adding the legal list instead also gives 5/40, and
both together 9/40. Each addition alone gives the same +3; together +7, so their effects
roughly add. None of the differences is significant at n=40.

## 2. Input modality: text-only vs images-only vs text+images (basic tools B)

Images-only runs `codex-20261106T235442689294Z` + `codex-20261107T062854945223Z`
(`--geometry images-only`: no coordinates anywhere; images + stack bounding box only).
Text+images numbers are the paper's image ablation (run inventory, identity flips applied).

| input | easy | mid | hard | layers | total |
| --- | --- | --- | --- | --- | --- |
| text only | 3/10 | 0/10 | 0/10 | 0/10 | 3/40 |
| images only | 1/10 | 0/10 | 0/10 | 0/10 | 1/40 |
| text + images | 2/10 | 0/10 | 0/10 | 0/10 | 2/40 |

Other tool conditions (no images-only arm): L text-only 5/40 vs text+images 5/40;
L+A text-only 11/40 vs text+images 9/40 (E_id).

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

## 9. Backtracking behaviour (free, 2026-11-07)

`workspace/backtrack_analysis.mjs` -> `workspace/RESULTS/backtracking/report.md` (+ events.json).
Backtrack = accepted go_to_step / restore_revision / remove_fold that shortens the sequence.
Local repair = target reachable (CP + E_id) from the sequence minus its last 1-3 folds, DFS depth
limit reference+2-prefix, node cap 4000. Easy + layers only.

| condition | episodes | backtracks | to step 0 | mean jump | repair within 3 existed | to step 0 although repair existed | re-made discarded folds (jump>=2) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Luna B text-only | 20 | 24 | 11 (46%) | 1.4 | 23/24 | 11/23 | 4/6 |
| Luna B+A text+images | 23 | 35 | 15 (43%) | 1.5 | 34/35 | 15/34 | 11/14 |
| Luna L text-only | 20 | 39 | 7 (18%) | 2.7 | 24/39 | 4/24 | 12/32 |
| Luna L+A text-only | 68 | 230 | 55 (24%) | 2.6 | 128/230 | 36/128 | 42/176 |
| Sonnet L+A text-only | 10 | 32 | 9 (28%) | 3.3 | 16/32 | 4/16 | 0/24 |

Findings: (1) For Luna L+A, 36 of 55 returns to the flat sheet discarded a repair <=3 folds away.
(2) "Near target" by tier-3 feedback is not "recoverable": layers-0003 (8/9 layers, 6/8 matching)
and easy-0002 (24/24 layers, wrong order) are trap states hit by both Luna and Sonnet; 5 of 6 and
4 of 4 restarts there had no repair within 3 folds. So the earlier note "Sonnet restarts instead
of repairing locally" (easy-0005 t40, layers-0003 t10) is corrected: in both cases no repair within
3 folds existed. (3) With basic tools, after long backtracks the model mostly re-makes the same
folds (B 4/6, B+A 11/14). With B, "to step 0" from depth 1 is a 1-fold undo.

## 10. Sonnet pilot complete

`claude-20261107T232254743781Z`: layers-0001..0005 all solved ($5.27). Pilot total 8/10 (E_plane;
easy 3/5 legacy prompt order for 0001-0004, layers 5/5). Luna L+A text-only on the same 10:
6/10 (0925), 3/10 (pass@5 rep 1), 6/10 (rep 2). Sonnet solved easy-0001/0003, never solved by
Luna in 4 runs; Luna solved easy-0002/0005, Sonnet did not.

## 11. Luna pass@5 完成与 E_id 核验（2026-11-08）

五次重复、每次 easy 10 题和 layers 10 题，共 100 个 episode，全部完成，无错误中断。
使用 `workspace/score_luna_pass5.mjs` 离线回放全部最终序列，不调用模型、不覆盖原始运行结果。
判分要求：序列合法、episode 以 finished 结束、CP 匹配，且层叠满足 E_id（允许 CP 对称性）。
参考层叠由原 corpus 的参考序列回放取得，与既有 identity audit 一致。
脚本检查五轮题目、CP、目标和主要实验条件一致；100 个最终序列均合法回放。
完整运行清单、100 条核验记录与逐题五轮矩阵见 [eid-report.json](luna-pass5/eid-report.json)。

| 重复 | easy（E_id） | layers（E_id） | 合计 |
|---|---|---|---|
| 1 | 2/10 | 5/10 | 7/20 |
| 2 | 3/10 | 7/10 | 10/20 |
| 3 | 1/10 | 5/10 | 6/20 |
| 4 | 3/10 | 7/10 | 10/20 |
| 5 | 3/10 | 6/10 | 9/20 |
| 五轮平均单次成功率 | 12/50 = 24% | 30/50 = 60% | 42/100 = 42% |
| pass@5（逐题至少一次成功） | **5/10 = 50%** | **9/10 = 90%** | **14/20 = 70%** |

撤回 5 次旧 E_plane 成功：easy-0004 的第 2、3、4、5 次重复，以及 easy-0003 的第 5 次重复。
它们均 CP 和 E_plane 匹配，但不满足 E_id。layers 的原始成功数均保留。

- easy 至少一次成功：0002、0005、0006、0009、0010。
- easy 五次均未成功：0001、0003、0004、0007、0008。
- layers 至少一次成功：除 0006 外的全部 9 题。
- layers 五次均成功：0004、0005、0008、0009。

这五次重复内，平均单次成功率为 42%，五次机会的题目覆盖率为 70%，增加 28 个百分点。
这说明重复尝试可以覆盖单次未成功的部分题目，但使用了最多五倍的 episode 预算；不能由此声称搜索效率提升。
20 题中仍有 6 题五次均未成功，也不能据此证明这些题对模型不可解。
本结果不混入之前的单次 L+A 实验，也不与其 40 题分母直接比较。
所有最终状态中，没有发现满足 CP+E_id 却未 finished 的 episode；本核验不检查中途访问过的状态。

## 12. Sonnet 与 Luna 同题比较修订（2026-11-08）

离线核验脚本：`workspace/score_sonnet_comparison.mjs`；完整来源和逐题结果：
[sonnet-comparison.json](luna-pass5/sonnet-comparison.json)。
Sonnet 当前仅有 easy-0001..0010 和 layers-0001..0005 的 15 题完整结果，
未发现 layers-0006..0010 的运行结果，不能称为已完成 20 题。
easy-0010 从第 66 轮恢复，原 80 轮预算内于第 73 轮提交，但未通过 E_plane 或 E_id。
Sonnet 旧判分的 easy-0003、easy-0007 成功均被 E_id 撤回。

| 同题范围 | Sonnet 一次完整 episode | Luna 五轮平均单次成功率 | Luna pass@5 |
|---|---|---|---|
| easy 10 题 | 4/10 = 40% | 12/50 = 24% | 5/10 = 50% |
| layers 前 5 题 | 5/5 = 100% | 16/25 = 64% | 5/5 = 100% |
| 共 15 题 | 9/15 = 60% | 28/75 = 37.3% | 10/15 = 66.7% |

Sonnet 成功的 easy 为 0001、0004、0006、0009；Luna 五轮成功并集为
0002、0005、0006、0009、0010。Sonnet 独有 0001、0004；Luna 独有 0002、0005、0010。
因此两者不是成功集合的包含关系；在已比较的 easy 上，两者并集覆盖 7/10，
均未解出 0003、0007、0008。这只是事后并集，不是已评测的组合策略。
第 10 节“Sonnet 解出 easy-0003”及由旧分数形成的判断由本节取代。

证据支持 Sonnet 在这 15 题的单次观察成功率较高，但不支持显著性、参数规模因果结论，
也不能把 Sonnet 单次与 Luna 五次视为同预算比较。Sonnet 前四道 easy 使用 legacy
prompt 排列，其余为 history-first；部分题经历额度中断后重新开始。完整运行计数不应
掩盖这些协议差异和额外消耗，easy-0010 的回放续跑则保留了原始 episode 的预算。
此前第 9 节局部修补搜索已经纠正“重启就说明不会局部回溯”的解释，本轮成功率数据
不推翻该纠正。重复尝试提高覆盖率，但随机性并非唯一瓶颈，失败原因还需轨迹分析区分。

## 13. Sonnet 20 题全部完成（2026-11-08，取代第 12 节的未完成状态）

layers-0006 在 `claude-resume-20261108T174909432099Z` 从第 31 轮恢复，
第 66 轮提交，未通过终态判分。layers-0007..0010 在
`claude-20261108T175644588326Z` 分别于第 28、10、11、21 轮提交，四题均通过离线 E_id 回放核验。
重新执行 `workspace/score_sonnet_comparison.mjs`，完整 20 题结果保存在
[sonnet-comparison.json](luna-pass5/sonnet-comparison.json)。原始运行结果未覆盖。

| 同题范围 | Sonnet 一次完整 episode | Luna 五轮平均单次成功率 | Luna pass@5 |
|---|---|---|---|
| easy 10 题 | 4/10 = 40% | 12/50 = 24% | 5/10 = 50% |
| layers 10 题 | 9/10 = 90% | 30/50 = 60% | 9/10 = 90% |
| 共 20 题 | **13/20 = 65%** | **42/100 = 42%** | **14/20 = 70%** |

新增四题旧判分与 E_id 一致，没有新增撤回。Sonnet 的 layers 成功集合与 Luna pass@5
完全相同，均仅 layers-0006 未成功。easy 的互补关系保持第 12 节所列结果。
观察到 Sonnet 单次成功率比 Luna 五轮平均单次高 23 个百分点；layers 单次达到 Luna
五次成功并集的覆盖率。这不是运行时间、token 或费用相等的比较，也不能视为显著性
或模型规模效应证明。前述提示排列差异、历史中断重开及 Sonnet 缺乏重复实验的限制仍然存在。

## 14. Luna pass@5 逐题轨迹审计（2026-11-08）

本节基于全部 100 个 episode 的保存历史，回放每个已接受序列并逐状态检查 CP+E_id。没有调用模型，也没有新建搜索轨迹。
完整机器可读证据：[trajectory-analysis.json](luna-pass5/trajectory-analysis.json)。复现脚本：`workspace/analyze_pass5_paths.mjs`。

实际共 2542 轮；42 次成功，53 次循环提前停止，5 次 finished 但身份判分失败。循环失败发生在第 16–71 轮，均未用满 80 轮。
未发现失败 episode 在保存的已接受状态中曾达到 CP+E_id；因此这里的失败不是已经到达正确目标却没提交。
20 题分成：4 题五次都成功、10 题时成时败、6 题五次都失败。10 道时成时败的题，其五次首次有效折叠状态均相同，差异发生在后续路径选择。

按运行时间顺序取并集：7、12、12、13、14 题；此曲线依赖顺序。对五次运行所有大小为 k 的子集取平均，pass@1..5 为 42%、54.5%、62%、67%、70%。
上述子集平均是当前五个样本给出的估计，不是额外实验，不能用统一单题成功概率 p 直接套所有题的 1-(1-p)^5。

状态数按原坐标系的有序层多边形、正反面、来源多边形生成键（舍入 1e-10）；未合并整体刚体变换或顶点循环重排，故这些是表示相关的状态覆盖数。
“成功路线中未尝试的边”是已观察成功最终序列的一条边，不代表唯一解，也不证明模型的内部认知原因。

### easy-0001：0/5 成功

五次都因循环停止。存在大量回溯（每次 7–10 次），五次合计覆盖 46 个表示层面的非初始状态仍未命中目标；不是完全不探索，也不是仅重复一个开局。Sonnet 已解出本题，因此不能解释为题目不可解。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 否 | state_cycling | 50 | 19 | 7 | 5 | 2 | — |
| 2 | 否 | state_cycling | 53 | 21 | 7 | 4 | 6 | — |
| 3 | 否 | state_cycling | 64 | 25 | 10 | 3 | 3 | — |
| 4 | 否 | state_cycling | 71 | 26 | 10 | 10 | 7 | — |
| 5 | 否 | state_cycling | 46 | 15 | 7 | 5 | 3 | — |

### easy-0002：1/5 成功

五次最初的有效折叠相同。成功的第 5 次与失败的第 1 次前六个有效折叠相同；成功运行重启后第 13 轮改从 angle_index=3、offset=0.5 开局，失败运行第 14/23 轮重复另一开局。这里跨运行收益来自后续重启分支的差异。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 否 | state_cycling | 37 | 15 | 5 | 2 | 1 | — |
| 2 | 否 | state_cycling | 23 | 9 | 3 | 3 | 0 | — |
| 3 | 否 | state_cycling | 34 | 11 | 6 | 0 | 1 | — |
| 4 | 否 | state_cycling | 30 | 9 | 6 | 3 | 4 | — |
| 5 | 是 | finished | 30 | 16 | 2 | 1 | 3 | 29 |

代表性配对：成功重复 5 vs 失败重复 1。前 6 个有效折叠到达相同状态；按成功最终路线排序，第 1 折对应的边未在失败运行中执行，失败运行曾访问该边的起点。

- 成功证据：[重复 5 第 13 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261108T044203106784Z/easy-0002/turn-013/tool.json)：`{"name":"add_fold","arguments":{"angle_index":3,"offset":0.5,"move_positive":true,"over":true}}`
- 失败出边：[重复 1 第 2 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T175431422982Z/easy-0002/turn-002/tool.json)：`{"name":"add_fold","arguments":{"angle_index":2,"offset":0.5,"move_positive":true,"over":true}}`
- 失败出边：[重复 1 第 14 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T175431422982Z/easy-0002/turn-014/tool.json)：`{"name":"add_fold","arguments":{"angle_index":1,"offset":-0.5,"move_positive":true,"over":false}}`
- 失败出边：[重复 1 第 23 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T175431422982Z/easy-0002/turn-023/tool.json)：`{"name":"add_fold","arguments":{"angle_index":1,"offset":-0.5,"move_positive":true,"over":false}}`

### easy-0003：0/5 成功

前四次循环失败，第五次提交但 E_id 不通过。五次从同一初始折叠开始，均没有回到深度 0；第五次通过 E_plane 仍不能满足来源身份。增加一次提交并未带来真正成功。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 否 | state_cycling | 45 | 16 | 5 | 0 | 2 | — |
| 2 | 否 | state_cycling | 36 | 12 | 6 | 0 | 1 | — |
| 3 | 否 | state_cycling | 17 | 6 | 2 | 0 | 1 | — |
| 4 | 否 | state_cycling | 23 | 8 | 2 | 0 | 3 | — |
| 5 | 否 | finished | 24 | 11 | 1 | 0 | 5 | — |

### easy-0004：0/5 成功

第 1 次循环失败，第 2–5 次均提交外观正确但身份错误的解。是四次重复出现的 E_plane 假阳性，不能归类为“只差更多探索预算”；Sonnet 的 E_id 成功说明存在可找到的正确身份排列。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 否 | state_cycling | 31 | 9 | 5 | 5 | 3 | — |
| 2 | 否 | finished | 28 | 13 | 3 | 1 | 0 | — |
| 3 | 否 | finished | 15 | 7 | 0 | 0 | 1 | — |
| 4 | 否 | finished | 31 | 13 | 3 | 2 | 0 | — |
| 5 | 否 | finished | 28 | 11 | 4 | 1 | 1 | — |

### easy-0005：2/5 成功

成功的第 2/4 次各只回溯 2 次，且没有退回初始状态；失败的第 1/3/5 次回溯 9/7/8 次，并重启 3/2/3 次。第 2 次在深度 2 处选择了已验证成功路线的第三折，失败的第 1 次到过该状态却选择另一折线。成功并不依赖从头重启。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 否 | state_cycling | 56 | 19 | 9 | 3 | 1 | — |
| 2 | 是 | finished | 18 | 7 | 2 | 0 | 1 | 17 |
| 3 | 否 | state_cycling | 42 | 15 | 7 | 2 | 2 | — |
| 4 | 是 | finished | 20 | 9 | 2 | 0 | 3 | 19 |
| 5 | 否 | state_cycling | 43 | 14 | 8 | 3 | 3 | — |

代表性配对：成功重复 2 vs 失败重复 1。前 4 个有效折叠到达相同状态；按成功最终路线排序，第 3 折对应的边未在失败运行中执行，失败运行曾访问该边的起点。

- 成功证据：[重复 2 第 13 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T192735624427Z/easy-0005/turn-013/tool.json)：`{"name":"add_fold","arguments":{"angle_index":3,"offset":-0.25,"move_positive":true,"over":false}}`
- 失败出边：[重复 1 第 6 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T175431422982Z/easy-0005/turn-006/tool.json)：`{"name":"add_fold","arguments":{"angle_index":1,"offset":-0.25,"move_positive":true,"over":false}}`

### easy-0006：4/5 成功

四次成功均 16 轮，唯一失败 19 轮。第 3 次到过成功路线深度 2 的状态，却在第 10 轮 restore_revision(0) 放弃；成功的第 1 次在同状态第 11 轮继续合法第三折。失败运行四次回初始状态，成功运行各一次，说明部分重启会放弃有成功后继的分支。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 是 | finished | 16 | 7 | 1 | 1 | 0 | 15 |
| 2 | 是 | finished | 16 | 7 | 1 | 1 | 0 | 15 |
| 3 | 否 | state_cycling | 19 | 7 | 4 | 4 | 0 | — |
| 4 | 是 | finished | 16 | 7 | 1 | 1 | 0 | 15 |
| 5 | 是 | finished | 16 | 7 | 1 | 1 | 1 | 15 |

代表性配对：成功重复 1 vs 失败重复 3。前 4 个有效折叠到达相同状态；按成功最终路线排序，第 3 折对应的边未在失败运行中执行，失败运行曾访问该边的起点。

- 成功证据：[重复 1 第 11 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T175431422982Z/easy-0006/turn-011/tool.json)：`{"name":"add_fold","arguments":{"angle_index":3,"offset":1.25,"move_positive":true,"over":false}}`
- 失败出边：[重复 3 第 10 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T230335798303Z/easy-0006/turn-010/tool.json)：`{"name":"restore_revision","arguments":{"revision":0}}`

### easy-0007：0/5 成功

五次均循环停止，只有一次回到初始状态，其余主要是局部回溯。五次合计 29 个状态仍未命中；不能用“总是推倒重来”解释。Sonnet 的旧成功也被 E_id 撤回，当前缺少模型成功轨迹可作配对。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 否 | state_cycling | 35 | 12 | 5 | 0 | 4 | — |
| 2 | 否 | state_cycling | 52 | 20 | 7 | 1 | 4 | — |
| 3 | 否 | state_cycling | 21 | 8 | 3 | 0 | 3 | — |
| 4 | 否 | state_cycling | 20 | 8 | 3 | 0 | 2 | — |
| 5 | 否 | state_cycling | 32 | 12 | 4 | 0 | 1 | — |

### easy-0008：0/5 成功

五次均循环停止，每次 5–9 次回溯，合计 22 个状态；大部分回溯不是回初始状态。折叠拒绝每次仅 0–2 次，日志更直接体现合法分支中的循环，而非大量非法几何动作。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 否 | state_cycling | 25 | 8 | 5 | 1 | 0 | — |
| 2 | 否 | state_cycling | 30 | 10 | 6 | 0 | 1 | — |
| 3 | 否 | state_cycling | 34 | 11 | 7 | 0 | 2 | — |
| 4 | 否 | state_cycling | 45 | 18 | 9 | 2 | 1 | — |
| 5 | 否 | state_cycling | 25 | 8 | 5 | 0 | 0 | — |

### easy-0009：3/5 成功

第 2–4 次成功，五次均未回初始状态。成功与失败第 1 次前八个有效折叠相同；成功第 2 次后来从深度 3 改选 angle_index=0、offset=-0.25，失败运行到过同状态但未走这条成功边。是局部换分支成功的明确例子。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 否 | state_cycling | 17 | 7 | 3 | 0 | 0 | — |
| 2 | 是 | finished | 23 | 10 | 3 | 0 | 2 | 22 |
| 3 | 是 | finished | 23 | 10 | 3 | 0 | 2 | 22 |
| 4 | 是 | finished | 23 | 10 | 4 | 0 | 1 | 22 |
| 5 | 否 | state_cycling | 22 | 8 | 4 | 0 | 1 | — |

代表性配对：成功重复 2 vs 失败重复 1。前 8 个有效折叠到达相同状态；按成功最终路线排序，第 4 折对应的边未在失败运行中执行，失败运行曾访问该边的起点。

- 成功证据：[重复 2 第 20 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T192735624427Z/easy-0009/turn-020/tool.json)：`{"name":"add_fold","arguments":{"angle_index":0,"offset":-0.25,"move_positive":true,"over":true}}`
- 失败出边：[重复 1 第 8 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T175431422982Z/easy-0009/turn-008/tool.json)：`{"name":"add_fold","arguments":{"angle_index":1,"offset":-0.25,"move_positive":true,"over":true}}`

### easy-0010：2/5 成功

五次首折相同，但第 1 次成功与第 2 次失败从第二个有效折叠分叉（第 4 轮 offset=0.25 对 0.75）。第 5 次成功仅 12 轮且无回溯，第 1 次成功 19 轮、一次回溯；三次失败都有多次局部回溯。说明直接路径选择和后续修正都可能影响结果。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 是 | finished | 19 | 10 | 1 | 0 | 0 | 18 |
| 2 | 否 | state_cycling | 25 | 9 | 3 | 0 | 2 | — |
| 3 | 否 | state_cycling | 39 | 16 | 5 | 0 | 2 | — |
| 4 | 否 | state_cycling | 34 | 13 | 5 | 0 | 2 | — |
| 5 | 是 | finished | 12 | 6 | 0 | 0 | 0 | 11 |

代表性配对：成功重复 1 vs 失败重复 2。前 1 个有效折叠到达相同状态；按成功最终路线排序，第 4 折对应的边未在失败运行中执行，失败运行曾访问该边的起点。

- 成功证据：[重复 1 第 15 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T175431422982Z/easy-0010/turn-015/tool.json)：`{"name":"add_fold","arguments":{"angle_index":3,"offset":0.75,"move_positive":true,"over":false}}`
- 失败出边：[重复 2 第 7 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T192735624427Z/easy-0010/turn-007/tool.json)：`{"name":"add_fold","arguments":{"angle_index":0,"offset":0.25,"move_positive":true,"over":false}}`

### layers-0001：1/5 成功

仅第 2 次成功。失败的第 1 次确实到过成功路线深度 2 的状态，但第 24/26 轮分别退回较早状态和初始状态；成功第 2 次第 13 轮从此处继续折叠并最终解出。不能将“当前位置无解”作为这两次离开的解释。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 否 | state_cycling | 28 | 8 | 6 | 1 | 0 | — |
| 2 | 是 | finished | 18 | 8 | 1 | 0 | 0 | 17 |
| 3 | 否 | state_cycling | 23 | 7 | 5 | 3 | 0 | — |
| 4 | 否 | state_cycling | 38 | 11 | 6 | 2 | 2 | — |
| 5 | 否 | state_cycling | 22 | 6 | 6 | 2 | 0 | — |

代表性配对：成功重复 2 vs 失败重复 1。前 4 个有效折叠到达相同状态；按成功最终路线排序，第 3 折对应的边未在失败运行中执行，失败运行曾访问该边的起点。

- 成功证据：[重复 2 第 13 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T224002250939Z/layers-0001/turn-013/tool.json)：`{"name":"add_fold","arguments":{"angle_index":3,"selection_mode":"all","offset":-0.5546875,"move_positive":true,"over":false}}`
- 失败出边：[重复 1 第 24 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T183433007248Z/layers-0001/turn-024/tool.json)：`{"name":"restore_revision","arguments":{"revision":14}}`
- 失败出边：[重复 1 第 26 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T183433007248Z/layers-0001/turn-026/tool.json)：`{"name":"restore_revision","arguments":{"revision":0}}`

### layers-0002：1/5 成功

仅第 1 次成功。与失败第 2 次的前八个有效折叠相同，后来成功运行在深度 2 改用 offset=0.09375 的折线；失败运行尝试过该状态的其他出边，但未走这条成功边。不是首步差异。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 是 | finished | 22 | 9 | 2 | 0 | 2 | 21 |
| 2 | 否 | state_cycling | 21 | 6 | 3 | 0 | 1 | — |
| 3 | 否 | state_cycling | 26 | 8 | 4 | 1 | 4 | — |
| 4 | 否 | state_cycling | 20 | 6 | 3 | 0 | 1 | — |
| 5 | 否 | state_cycling | 43 | 15 | 5 | 4 | 1 | — |

代表性配对：成功重复 1 vs 失败重复 2。前 8 个有效折叠到达相同状态；按成功最终路线排序，第 3 折对应的边未在失败运行中执行，失败运行曾访问该边的起点。

- 成功证据：[重复 1 第 18 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T183433007248Z/layers-0002/turn-018/tool.json)：`{"name":"add_fold","arguments":{"angle_index":2,"selection_mode":"all","offset":0.09375,"move_positive":true,"over":true}}`
- 失败出边：[重复 2 第 6 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T224002250939Z/layers-0002/turn-006/tool.json)：`{"name":"add_fold","arguments":{"angle_index":2,"selection_mode":"all","offset":0.17578125,"move_positive":true,"over":true}}`
- 失败出边：[重复 2 第 13 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T224002250939Z/layers-0002/turn-013/tool.json)：`{"name":"add_fold","arguments":{"angle_index":3,"selection_mode":"all","offset":1.53125,"move_positive":true,"over":false}}`

### layers-0003：4/5 成功

第 2–5 次成功，第 1 次循环失败，所有成功运行都有回到初始状态。第 2 次第 20 轮重启后改用 offset=0.21875 的开局并成功；失败第 1 次也重启过但未试这个开局。因此应区分有效换分支与无效重启。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 否 | state_cycling | 21 | 6 | 2 | 1 | 0 | — |
| 2 | 是 | finished | 29 | 11 | 3 | 2 | 0 | 28 |
| 3 | 是 | finished | 28 | 12 | 2 | 2 | 0 | 27 |
| 4 | 是 | finished | 20 | 9 | 1 | 1 | 0 | 19 |
| 5 | 是 | finished | 36 | 11 | 6 | 3 | 1 | 35 |

代表性配对：成功重复 2 vs 失败重复 1。前 4 个有效折叠到达相同状态；按成功最终路线排序，第 1 折对应的边未在失败运行中执行，失败运行曾访问该边的起点。

- 成功证据：[重复 2 第 20 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T224002250939Z/layers-0003/turn-020/tool.json)：`{"name":"add_fold","arguments":{"angle_index":3,"selection_mode":"all","offset":0.21875,"move_positive":true,"over":false}}`
- 失败出边：[重复 1 第 2 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T183433007248Z/layers-0003/turn-002/tool.json)：`{"name":"add_fold","arguments":{"angle_index":0,"selection_mode":"all","offset":0.5,"move_positive":true,"over":false}}`
- 失败出边：[重复 1 第 16 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T183433007248Z/layers-0003/turn-016/tool.json)：`{"name":"add_fold","arguments":{"angle_index":3,"selection_mode":"all","offset":1.75,"move_positive":true,"over":true}}`

### layers-0004：5/5 成功

五次均成功，均 11 轮、无回溯，每次 5 个非初始状态。存在一次非法折叠但不妨碍成功；重复尝试没有提高本题覆盖率。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 是 | finished | 11 | 5 | 0 | 0 | 0 | 10 |
| 2 | 是 | finished | 11 | 5 | 0 | 0 | 0 | 10 |
| 3 | 是 | finished | 11 | 5 | 0 | 0 | 1 | 10 |
| 4 | 是 | finished | 11 | 5 | 0 | 0 | 0 | 10 |
| 5 | 是 | finished | 11 | 5 | 0 | 0 | 0 | 10 |

### layers-0005：5/5 成功

五次均成功，9–10 轮，无回溯、无被拒折叠，每次 5 个非初始状态。属于稳定直接完成，pass@5 没有额外收益。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 是 | finished | 9 | 5 | 0 | 0 | 0 | 8 |
| 2 | 是 | finished | 9 | 5 | 0 | 0 | 0 | 8 |
| 3 | 是 | finished | 10 | 5 | 0 | 0 | 0 | 9 |
| 4 | 是 | finished | 10 | 5 | 0 | 0 | 0 | 9 |
| 5 | 是 | finished | 9 | 5 | 0 | 0 | 0 | 8 |

### layers-0006：0/5 成功

五次均循环失败，28–51 轮、3–7 次回溯；合计 27 个状态，没有 E_id 命中。Sonnet 也未成功。只能说当前策略下持续失败，不能据此认定不可解或确定某个唯一原因。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 否 | state_cycling | 51 | 16 | 7 | 1 | 2 | — |
| 2 | 否 | state_cycling | 45 | 15 | 6 | 1 | 5 | — |
| 3 | 否 | state_cycling | 37 | 15 | 5 | 2 | 2 | — |
| 4 | 否 | state_cycling | 28 | 8 | 4 | 0 | 2 | — |
| 5 | 否 | state_cycling | 34 | 12 | 3 | 1 | 5 | — |

### layers-0007：2/5 成功

第 2/4 次成功。第 2 次第 12 轮在深度 3 选择 top 4 层并移动负侧；第 1 次在同状态多次选择同一折线的 all 层、正侧动作（第 13/15/22 轮），最终循环停止。这里能直接定位到同状态下层选择/移动侧的差异，而不是推理强度变化。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 否 | state_cycling | 22 | 8 | 7 | 0 | 1 | — |
| 2 | 是 | finished | 15 | 7 | 1 | 0 | 0 | 14 |
| 3 | 否 | state_cycling | 16 | 6 | 3 | 0 | 0 | — |
| 4 | 是 | finished | 19 | 7 | 2 | 0 | 3 | 18 |
| 5 | 否 | state_cycling | 28 | 9 | 7 | 0 | 3 | — |

代表性配对：成功重复 2 vs 失败重复 1。前 5 个有效折叠到达相同状态；按成功最终路线排序，第 4 折对应的边未在失败运行中执行，失败运行曾访问该边的起点。

- 成功证据：[重复 2 第 12 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T224002250939Z/layers-0007/turn-012/tool.json)：`{"name":"add_fold","arguments":{"angle_index":1,"selection_mode":"top","layer_count":4,"offset":-1.296875,"move_positive":false,"over":true}}`
- 失败出边：[重复 1 第 8 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T183433007248Z/layers-0007/turn-008/tool.json)：`{"name":"add_fold","arguments":{"angle_index":0,"selection_mode":"top","layer_count":4,"offset":0.15625,"move_positive":false,"over":true}}`
- 失败出边：[重复 1 第 13 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T183433007248Z/layers-0007/turn-013/tool.json)：`{"name":"add_fold","arguments":{"angle_index":1,"selection_mode":"all","offset":-1.296875,"move_positive":true,"over":true}}`
- 失败出边：[重复 1 第 15 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T183433007248Z/layers-0007/turn-015/tool.json)：`{"name":"add_fold","arguments":{"angle_index":1,"selection_mode":"all","offset":-1.296875,"move_positive":true,"over":true}}`
- 失败出边：[重复 1 第 19 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T183433007248Z/layers-0007/turn-019/tool.json)：`{"name":"restore_revision","arguments":{"revision":2}}`
- 失败出边：[重复 1 第 22 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T183433007248Z/layers-0007/turn-022/tool.json)：`{"name":"add_fold","arguments":{"angle_index":1,"selection_mode":"all","offset":-1.296875,"move_positive":true,"over":true}}`

### layers-0008：5/5 成功

五次均成功，10–11 轮、无回溯，虽有两种首折和少量拒绝仍都完成。不同轨迹并不必然导致成功率差异。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 是 | finished | 11 | 5 | 0 | 0 | 0 | 10 |
| 2 | 是 | finished | 10 | 5 | 0 | 0 | 0 | 9 |
| 3 | 是 | finished | 11 | 5 | 0 | 0 | 2 | 10 |
| 4 | 是 | finished | 10 | 5 | 0 | 0 | 0 | 9 |
| 5 | 是 | finished | 10 | 5 | 0 | 0 | 1 | 9 |

### layers-0009：5/5 成功

五次均成功，均 11 轮、无回溯；五次状态并集仅 5 个非初始状态，基本重复同一有效路径。无需靠多次尝试获得覆盖。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 是 | finished | 11 | 5 | 0 | 0 | 1 | 10 |
| 2 | 是 | finished | 11 | 5 | 0 | 0 | 0 | 10 |
| 3 | 是 | finished | 11 | 5 | 0 | 0 | 0 | 10 |
| 4 | 是 | finished | 11 | 5 | 0 | 0 | 1 | 10 |
| 5 | 是 | finished | 11 | 5 | 0 | 0 | 0 | 10 |

### layers-0010：2/5 成功

第 4/5 次成功，第 1–3 次循环失败。第 4 次在深度 3、第 24 轮换到 offset=-1.671875 的合法折线；失败第 1 次到过同状态，却在第 14/18 轮重复另一折线。两次成功耗时 27 与 13 轮，不是单纯运行更久才成功。

| 重复 | E_id 成功 | 终止 | 轮数 | 不同状态 | 回溯 | 回初始状态 | 拒绝折叠 | 首次 E_id 命中轮 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 否 | state_cycling | 24 | 7 | 4 | 0 | 1 | — |
| 2 | 否 | state_cycling | 20 | 8 | 4 | 0 | 0 | — |
| 3 | 否 | state_cycling | 25 | 9 | 4 | 0 | 1 | — |
| 4 | 是 | finished | 27 | 11 | 4 | 0 | 1 | 26 |
| 5 | 是 | finished | 13 | 6 | 1 | 0 | 0 | 12 |

代表性配对：成功重复 4 vs 失败重复 1。前 5 个有效折叠到达相同状态；按成功最终路线排序，第 4 折对应的边未在失败运行中执行，失败运行曾访问该边的起点。

- 成功证据：[重复 4 第 24 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261108T041710532854Z/layers-0010/turn-024/tool.json)：`{"name":"add_fold","arguments":{"angle_index":1,"selection_mode":"all","offset":-1.671875,"move_positive":true,"over":false}}`
- 失败出边：[重复 1 第 14 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T183433007248Z/layers-0010/turn-014/tool.json)：`{"name":"add_fold","arguments":{"angle_index":2,"selection_mode":"all","offset":0.84375,"move_positive":true,"over":false}}`
- 失败出边：[重复 1 第 18 轮](../../CODEX_HARNESS_TESTING/runs/codex-20261107T183433007248Z/layers-0010/turn-018/tool.json)：`{"name":"add_fold","arguments":{"angle_index":2,"selection_mode":"all","offset":0.84375,"move_positive":true,"over":false}}`

### 等预算补充实验：已准备，尚未运行

`scripts/rebuttal/10_luna_restart_budget.sh` 准备两臂：5×80 次独立重开 vs 1×400 次连续 episode。均为 low、纯文字、L+A、同一批 easy/layers 20 题。
两臂都关闭循环、重复动作、反复到达、死路四类提前停止，避免 400 轮臂仍在 20 轮左右被旧循环规则终止；原脚本默认规则保持不变。
这与历史 pass@5 协议不同，必须两臂重跑，不能只补 400 轮后与旧结果直接对比。模型主动 finish、上下文溢出和基础设施错误仍可能使实际预算不同。
每臂每题调用上限都是 400，20 题最多 8000 轮；两臂合计最多 16000 轮。需要同时报告实际调用数、输入/输出 token、推理 token、墙钟时间与 E_id，不宣称等 token 或等费用。
400 轮长历史可能超出模型/服务上下文上限，必须先检查完整输入容量；若发生应单列为协议失败，不能静默截断。命令脚本尚未实际验证模型运行，按用户规则不代为启动。

## 12. E_plane-only 撤回的来源（2026-11-08）

7 个只满足 E_plane 的撤回 episode（Luna pass@5 5 个：easy-0004 第 2 到 5 次、easy-0003 第 5 次；
Sonnet 2 个：easy-0003、easy-0007）逐个查看了 finish 前最后一次 `comparison_now`：全部是
`diagnosis: "matches"`，所有层一致（32/32、48/48、64/64）。原因是 `compare_target.mjs` 只比较
多边形和 parity，不比较 sheet_polygon。所以这 7 次是模型按环境反馈正确提交，不是模型错误。

决定：论文主口径仍为 E_id，同时报 E_plane 对照数，并说明上述来源。
- Luna pass@5，E_plane：每轮 7/11/7/11/11，共 47/100；pass@5 16/20（easy 7/10，layers 9/10）。
- Sonnet，E_plane：easy 6/10，layers 5/5（E_id 为 4/10、5/5）。
已写入 sections/10-limitations.tex（one episode per instance 段）和 sections/09-results.tex（Backtracking 段末）。
后续新实验的运行时比对应改为 E_id。

## 15. 同状态受控干预：已准备材料，尚未运行（2026-11-08）

研究定位调整：pass@5 作为稳定性与重复尝试覆盖率分析；失败分析的下一项主实验是固定决策节点的配对干预。旧的 5×80 vs 1×400 预算实验暂不优先启动。

目标是检验“提供哪一种支持会改变选择并改善后续结果”，不能把干预效果直接命名为模型内部的记忆缺陷或动作理解缺陷。原始轨迹中存在局部回溯，不能概括为“模型不会局部回溯”。

### 冻结节点与条件

材料由 `workspace/build_controlled_interventions.mjs` 从已有日志离线生成：10 道成功/失败混合的题各取一个共享状态节点。按审计中第一组有共享状态的成功/失败配对，取失败轨迹在该状态的最后一次出边。此选择使用了既有成功轨迹，是事后选定的诊断样本；不能外推全20题或全语料收益。选择证据保存在单独的 analyst-only 文件，运行器不读取它。

四个条件共享原始完整历史、当前状态、模型、low effort、原有工具、合法动作菜单及排列：baseline；仅增加既有历史摘要的 memory；仅增加动作含义解释的 semantics；仅增加各候选统一一步模拟状态的 preview。动作编号在全部条件都提供；模型仍使用原始动作参数接口，可选择回溯等其他原有工具。新增材料仅出现在冻结节点的一次请求，之后使用正常提示。

| 题目 | 冻结轮次 | 合法折叠候选数 | 同状态已有动作记录数 |
|---|---:|---:|---:|
| easy-0002 | 23 | 7 | 2 |
| easy-0005 | 6 | 2 | 0 |
| easy-0006 | 10 | 1 | 0 |
| easy-0009 | 8 | 3 | 0 |
| easy-0010 | 7 | 3 | 0 |
| layers-0001 | 26 | 1 | 1 |
| layers-0002 | 13 | 4 | 1 |
| layers-0003 | 16 | 3 | 1 |
| layers-0007 | 22 | 3 | 4 |
| layers-0010 | 18 | 2 | 1 |

4 个无既有动作的节点不作为 memory 有效信息干预的主要分析；2 个单候选节点单列为继续/回退决策，不混为多分支排序证据。摘要只有历史中实际观察过的即时结果，不把后来失败作为某动作错误的标签。预览只含下一步几何，不含目标评分、未来路径、成功标签或推荐。

### 运行、计分与成本

默认脚本仅回放旧响应，逐轮核对完整提示和工具输出；任何差异都停止，不进行模型调用。必须由用户显式设置 EXECUTE=1 才调用模型。

- 验证：`bash scripts/rebuttal/11_controlled_interventions.sh`
- 小规模试跑：`EXECUTE=1 bash scripts/rebuttal/11_controlled_interventions.sh`。easy-0002，4条件各1次，每次最多20个新决策，合计最多80个新决策（重试请求另计）。
- 完整预定设计：`EXECUTE=1 SUITE=full bash scripts/rebuttal/11_controlled_interventions.sh`。10节点×4条件×3次，每次最多20个新决策；最多2400个新决策。先检查试跑结果再运行。按节点和重复轮换条件顺序，重复嵌套于节点，不当作120道独立题。
- 离线计分：`node workspace/score_controlled_interventions.mjs /完整的/controlled-execute-运行目录`。

主观察为首个动作是否重复已有转移、是否被拒绝、是否回退；次观察为20轮内是否到达 E_id，以及是否 finish 提交 E_id，分别记录。错误/未完成实验不伪装为模型失败。报告实际调用量、输入/输出/缓存token、时间、增加的提示字节数与预览计算量。提示长度未匹配，因此识别的是整套支持的效果，不能排除额外文本与显著性影响；相同调用上限也不等于相同计算成本。

**历史接口限制：** 此诊断协议为了逐字重建历史，保留原有 plane-only 自动反馈，并在离线分析中使用 E_id。它应标为“历史接口下的干预”，不能声称运行时反馈已经修复。误导性的 matches 仍可能影响后续提交；相应失败不能全部归于模型。修复运行时 E_id 后的实验应单独定义新协议、重新生成全部条件，不能在一部分条件中静默更换比较器。

已完成 Node 材料生成、候选应用合法性和状态哈希检查、Node语法检查、shell语法检查及 diff 检查。按用户规则未执行 Python 回放或模型评测，因此端到端运行仍待用户执行验证脚本。

## 12. Sonnet 5.5 on all 20 pass@5 instances (complete 2026-11-09)

L+A, text only, low, one episode each. Runs: claude-20261107T175727765597Z (easy 1-4, legacy
prompt order), T183345423404Z (easy 5), T232254743781Z (layers 1-5), T234703304522Z (easy 6-7),
T20261108T044658778503Z (easy 8-9), T20261109T215442499384Z (easy 10), T20261108T175644588326Z
(layers 7-10), layers-0006 timed out twice (T20261108T155517688929Z turn 31,
T20261109T220051615479Z turn 37; single call > 300 s) -> protocol failure, unsolved.

| | easy | layers | total |
| --- | --- | --- | --- |
| Sonnet, E_id | 5/10 (0001, 0004, 0006, 0009, 0010) | 9/10 | 14/20 |
| Sonnet, E_plane | 7/10 (+0003, 0007) | 9/10 | 16/20 |
| Luna mean per repeat, E_id | 2.4 | 6.0 | 8.4 |
| Luna pass@5, E_id | 5/10 (0002, 0005, 0006, 0009, 0010) | 9/10 | 14/20 |

Backtracking (rerun with all runs): Luna L+A text-only 120 episodes, 384 backtracks, 104 to
step 0, 71 of those discarded a repair <=3 folds; Sonnet 21 episodes, 82 backtracks, 16 to step
0 (8 discarding a repair), re-made discarded folds 2/58. Paper 09-results updated.

## 13. Backtracking: conditional rates and chance baseline (2026-11-09)

`workspace/rebuild_baseline.mjs` -> `workspace/RESULTS/backtracking/rebuild_baseline.md`.
Restart vs recoverability: repair (<=3 folds) existed for 68% of Luna L+A restarts vs 58% of
shorter backtracks; Sonnet 50% vs 55%. Restart decisions do not track recoverability.
Re-making discarded folds (jump>=2, compared by state) vs uniform choice among distinct legal
folds: Luna L+A text 32/293 vs 61.0 expected (0.5x); Sonnet 0/58 vs 8.7 (0x); Luna L 7/32 vs 8.3;
Luna B 4/6 vs 0.9; Luna B+A 8/14 vs 3.7. With the legal list the models avoid the discarded path
(below chance); without it Luna re-makes it above chance (small n). Supersedes the "70/293"
count in section 12, which counted a match of the first fold only and compared arguments, not
states.
