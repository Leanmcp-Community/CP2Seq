# 交接：CP2Seq rebuttal 工作（截至 2026-11-07 14:20 PST）

英文原版：`workspace/HANDOFF_rebuttal_2026-11-07.md`。两份内容一致，以本中文版为最新（多了 14:05 之后的进展）。

仓库 `/Users/luxian/FoldOriganmi`，分支 `lu/preprint`。用中文跟用户交流。
完整结果和定义见 `workspace/RESULTS/REBUTTAL_RUNS_2026-11-07.md`（先读它）。
记号：B = 基础工具；L = 合法折叠列表；A = 自动第三级反馈；L+A = 论文里原来叫 "A" 的条件。
计分一律用 E_id。题目分 easy / mid / hard / layers 四组。

## 不能违反的规则
- **绝不自己跑 python、评测、训练或任何模型调用。** 写成 `.sh`（或给出完整命令），由用户来跑。
  不调用模型的 Node 离线分析可以由助手自己跑。
- `.env` 里有 `ANTHROPIC_API_KEY`：不能打印，不能提交。
- Claude 这一组走的是 `claude -p`（claude.ai 登录）。订阅额度用完后会自动按量扣费
  （"extra usage"，每次约扣 $12）。扩大任何 Claude 实验之前先算成本。
- `scripts/rebuttal/8_generality.sh` 正在被 Luna 运行时，**不要编辑这个文件**：
  bash 边执行边读脚本，改了可能弄坏正在跑的那批。需要新 arm 就另建文件。
- 跑实验时电脑要**插电、不合盖**。`caffeinate -i` 挡不住合盖睡眠；电脑睡眠时 300 秒超时
  的计时会暂停，看起来就像"卡住"（10:37 和 11:36 两次"卡住"都是这个原因，已用 `pmset -g log` 确认）。

## 正在进行的实验（`scripts/rebuttal/8_generality.sh`）
统一设置：L+A，纯文字（`IMAGE_HISTORY=none`），low effort，最多 80 轮；
easy-0001..0010（all-layers 动作空间）+ layers-0001..0010（some-generated-d5，动作空间 any）。
运行目录在 `CODEX_HARNESS_TESTING/runs/`（不进 git）。

1. **Luna pass@5**（`ARMS=luna-pass5`，Codex CLI，ChatGPT 订阅，无 API 费用）。**在跑。**
   - 第 1 轮重复：easy `codex-20261107T175431422982Z` 解出 2/10（easy-0006、0010）；
     layers `codex-20261107T183433007248Z` 解出 5/10（0002、0004、0005、0008、0009）。
   - 第 2 轮重复：`codex-20261107T192735624427Z`（easy，14:15 时在 easy-0003 第 35 轮）。
   - pass@1 参照（之前纯文字 L+A 的单次结果，`codex-20260925T*`）：easy 5/10，layers 6/10。
   - 查进程：`ps -o pid,etime,command -ax | grep "codex -a never"`。
   - 5 轮全部跑完后：分别算 easy 和 layers 的每轮 pass@1，以及 pass@5（5 次里至少解出 1 次）。

2. **Sonnet 5.5 试跑（10 题）**，因额度用完而**停着**。
   - `claude-20261107T175727765597Z`（旧的 prompt 顺序，缓存修复之前，花费 $82.32）：
     easy-0001 解出，0002 未解出，0003 解出，0004 解出。
   - `claude-20261107T183345423404Z`（修复后）：easy-0005 未解出（花费 $3.87）。
   - `claude-20261107T190225893933Z`：layers-0001 在第 15 轮报错
     "You've hit your 5-hour limit · resets 2pm"（429 共 6 次）。花费 $0.86。
   - **续跑脚本已写好**：`scripts/rebuttal/8b_sonnet_layers_resume.sh`，只跑 layers-0001..0005
     （layers-0001 从头重跑），设置与上面相同。由用户启动：
     `caffeinate -i env EXECUTE=1 bash scripts/rebuttal/8b_sonnet_layers_resume.sh`
   - 缓存修复后的成本：约 $0.06–0.08/轮（每题 $2–5）。
     用 `turn-*/process.json` 核对（`cache_read_input_tokens` 应逐轮增长，看 `total_cost_usd`）。
   - 成本构成（easy-0005 第 40 轮）：每轮新写入 1h 缓存约 13.5k token（尾部的当前状态 JSON，
     `claude -p` 自己在消息末尾加的断点），读缓存约 71k token。写 1h 缓存是输入价的 2 倍，
     是成本大头。
   - 论文里要注明：Sonnet 最早的 4 个 episode 用的是旧 prompt 顺序。

## 今天改过的代码（已提交）
- `claude_fold_loop.py`：`--action-space`、`--oracle-stop`、`--image-history none`、
  `--prompt-layout`（默认 history-first）；`prompt_blocks()` = 开头 / 每条历史一个 block
  （分隔符放在条目前面）/ 结尾；最后一个历史 block 上加 1h TTL 的缓存断点。
  离线检查 `workspace/check_prompt_blocks.py` 通过（229 轮）。
- `codex_fold_loop.py`：`--image-history none`、`--oracle-stop`。
- 分析脚本：`workspace/exploration_analysis.mjs`（H2）、`workspace/audit_passed_through.mjs`。

## 目前的主要结论（细节见结果文档）
- 同一模态（文字+图片）：B 2/40，B+A 5/40，L 5/40，L+A 9/40（按 E_id；之前写的 L 6、L+A 10 是 E_plane 的数）。纯文字：B 3，L 5，L+A 11。
- 模态对比（B）：纯文字 3/40，纯图片 1/40，文字+图片 2/40：图片替代不了坐标。
- 盲搜：随机合法折叠在 80 步内能解出 57%（easy）/ 96%（layers）的 episode；BFS 解出 mid 5/10。
  "depth wall"（深度墙）的说法要改：只有 hard 组是所有方法都 0 分。
- Oracle-stop 审计：143 个里从 25 变成 27；失败的原因是根本没走到目标状态。
- 探索：模型访问到的不同状态数只有随机搜索的 1/10 到 1/4（支持 H2）。
- Sonnet 目前在 easy 前 5 题解出 3 题，Luna 在同样 5 题上解出 2 题（样本很小）。

## 待办（按顺序）
1. 盯 Luna pass@5 到结束；算 pass@1 / pass@5 表；写进结果文档；提交并推送。
2. 用户启动 Sonnet 续跑（layers-0001..0005）；跑完后再决定是否跑 sonnet20 / haiku20。
3. Qwen 后端已写好（`CODEX_HARNESS_TESTING/qwen_fold_loop.py`，OpenAI 兼容接口，默认 OpenRouter），
   启动脚本 `scripts/rebuttal/9_qwen_sizes.sh`。用户需在 .env 加 OPENROUTER_API_KEY，先跑 SMOKE=1
   冒烟测试，核对模型 id。之后和空间推理 benchmark 的成绩做相关（H3）。
4. 论文已改（模态表、B+A 表、同条件搜索基线表、depth 表述、passed-through、探索分析、
   images-only、A 改名 L+A，摘要和结论同步）。待补：Luna pass、Sonnet、Qwen 结果出来后再加。
5. 可选：在信息量大的题上重跑 Haiku 排序的混合搜索（easy-0002/0003/0007、
   mid-0002/0004/0007），指标是解出所需的展开次数。
