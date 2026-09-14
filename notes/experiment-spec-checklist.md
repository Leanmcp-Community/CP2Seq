# Experiment Spec Checklist — what must be frozen before any experiment runs

2026-09-14. **A checklist to be filled in, not a set of conclusions.** Every line is my own call.

> **How to use**: Group `A` is frozen once decided — changing it means re-running.
> Any item in `B`–`G` marked *pending pilot* must state **which pilot number it is waiting on**.
> A "TBD" that doesn't name what it's waiting for is still TBD three months from now.

> **Current position: Phase 0** (see `research-workflow.md`).
> Until the two Phase 0 probes have run, most items below aren't yet ready to be filled in.

---

## The claim this checklist exists to serve

> **On sequential constraint-satisfaction problems with an exact verifier, the LLM's gain lies
> not in proposal quality but in early pruning and targeted backtracking. Therefore query
> efficiency, not success rate, is the right metric.**

Every item below exists because it is needed to test, or to avoid contaminating, this one sentence.
**If an item can't be traced back to this sentence, it doesn't belong in the main experiment.**

---

## First, distinguish two kinds of "TBD"

| | What | When to decide |
| --- | --- | --- |
| **Frozen (definitional)** | Interfaces, contracts, units of measurement. Determines how the simulator is written and what the logs record | **Now.** Deferring this = re-doing everything later |
| **Pending pilot (calibration)** | Thresholds, bin boundaries, budget caps, distance functions | After the pilot numbers. **Guessing early is just guessing** |

---

## A. Interface layer · Frozen

- [ ] **Which named model for the action space**
      one-layer / some-layers / all-layers simple fold; infinite vs finite line
      → Hard constraint, see `track1-surface-simulator.md`. **Decide this first — everything else depends on it**
- [ ] **State representation**: what the LLM is shown
      → Also the baseline arm for the group D ablation, so the interface must be switchable
- [ ] **Verifier contract**: what goes in, what comes out
- [ ] ⚠️ **Does the verifier return a reason for failure?**
      Returning a reason = handing the LLM a free pruning signal = **directly contaminates the core experiment in group C**.
      Must be decided explicitly, and most likely built as a toggle
- [ ] **Definition of "one query"** — this is the denominator of every number I report
      - [ ] One Flat-Folder call? (most natural, but cost varies with fold depth, so it isn't comparable across difficulty levels)
      - [ ] One "state advance + legality check"?
      - [ ] One LLM call?
      ⚠️ These do not measure the same thing: ① measures **compute** saved, ③ measures **reasoning** saved.
      **My claim is about reasoning; readers will assume I mean compute. This ambiguity must be killed in the first paragraph of Section 3.**
- [ ] **How many retries allowed after a failure**
- [ ] **How much history is kept in context**
- [ ] **CP dataset**: where from, how synthesized, how many, how difficulty is covered

---

## B. Difficulty axis

- [ ] **Which quantity is the primary axis**
      - [ ] Number of feasible actions at step k (branching factor)
      - [ ] Log of the state-space size
      - [ ] Shortest solution length
      ⚠️ The three give **completely different curve shapes**
- [ ] **Recommendation: record all of them, plot only one in the main figure, rest to the appendix. Recording is free; re-running is not**
- [ ] Bin boundaries — *pending pilot*
- [ ] **Verify monotonicity**: does pure search's query count actually rise monotonically with this axis?
      Not monotone → the axis is broken, replace it

> All of these can be computed directly from Flat-Folder. "We can precisely control and measure task difficulty" is itself a contribution for a methods paper.

---

## C. Measurement protocol for pruning / backtracking · **the core of the paper, design this first**

- [ ] **How to make "pruning" an observable, explicit action**
      The LLM must declare "this branch is dead" **before** calling the verifier,
      otherwise the LLM's judgment can't be separated from the verifier's ruling
- [ ] **How to compute the pruning ground truth**
      = whether a solution still exists from a given state = one exhaustive search. Possibly expensive → precompute and cache?
- [ ] **Report the two pruning metrics separately**
      - [ ] Pruning correctness (precision / recall)
      - [ ] Query savings from pruning
      ⚠️ An over-conservative model prunes accurately but saves little; an aggressive one saves a lot but may cut the only solution.
      **Report a trade-off curve, or a single point?**
- [ ] **Backtracking distance error**: failure at step k, the real error at step j (the last prefix that still has a solution),
      LLM says go back to step i → `|i − j|`
      - [ ] How is `j` computed, and how expensive is it
      ⚠️ This quantity is meaningless in mazes (you can back up cell by cell); **it is meaningful in origami, because "each fold gets harder" makes backing up to the wrong step very costly**
- [ ] **Baselines: who am I comparing against?**
      ⚠️ **Baselines are not ablations.** Ablations strip parts off the LLM; baselines are the
      reference frame. Without the pure-search row, "the LLM wins on pruning" has nothing to
      win against.

| | Proposal | Pruning | Backtracking |
| --- | --- | --- | --- |
| **Random baseline** | Random legal move | None | Restart |
| **Pure search** (DFS/BFS + Flat-Folder) | Enumeration | Verifier only — you only find out once you've gone all the way down | Back up one step |
| **LLM** | LLM proposes | **LLM rejects early, without calling the verifier** | **LLM specifies backing up to step k** |

      - [ ] Is pure search DFS or BFS? (different query profiles — decide, don't leave it implicit)
      - [ ] Does the random baseline get the same query budget as the LLM?
      - [ ] Is there a fourth row worth having — an LLM-free heuristic search (e.g. greedy on
            a hand-written score)? It's the cheapest way to pre-empt "your baseline is a straw man"

- [ ] **Concrete implementation of the three ablations**

| Ablation | How | Expected (if my intuition is right) |
| --- | --- | --- |
| Proposal off | Actions come from enumeration, LLM acts only as a filter | **small** drop |
| Pruning off | Every proposal goes to the verifier | **large** drop |
| Backtracking off | Restart on failure | **large** drop |

> If the result inverts (proposal turns out to be the key), it means the LLM is a good proposer rather than a good critic —
> **that is also a finding, not a failed experiment.**

---

## D. Representation ablation (the science version, not the engineering version)

- [ ] ❌ Not "try four representations and see which is best" (that produces a table)
- [ ] ✅ Instead: "**do the two representations differ systematically in the *types* of pruning errors they make**" (that produces a mechanism)
- [ ] ⚠️ **D depends on E** — without the failure taxonomy there are no "error types"
- [ ] Statistical test: comparing **distributions**, not means → which test?
- [ ] This group is what can engage the Spa3R vs "I Know About Up!" debate
      (see the mental imagery table in `track1-surface-simulator.md`)

---

## E. Failure-mode taxonomy

- [ ] **Category definitions**
      - [ ] Proposed an illegal action
      - [ ] False prune (cut a branch that had a solution)
      - [ ] Backtracked too far
      - [ ] Backtracked not far enough
      - [ ] Layer-ordering reasoning error
      - [ ] Repeated the same error on the same CP
- [ ] ⚠️ **How each category is automatically determined from the logs** — this decides what the logs must record, so it **must be settled before running**
- [ ] Are the categories mutually exclusive? Exhaustive? What is the catch-all called?

> A methods paper with nothing but curves reads thin. A free verifier means failures can be classified **exhaustively**.
> This table may end up cited more than the main experiment.

---

## F. Turning "find multiple ways" into a metric

- [ ] **How to obtain the solution-space ground truth**
      - [ ] Exhaustively enumerable on small CPs?
      - [ ] Sampling only on large CPs? What about sampling bias?
- [ ] **Which distance between sequences**
      - [ ] Edit distance (easiest to defend)
      - [ ] Hausdorff (a **shape** distance — using it on **sequences** needs extra justification; don't conflate the two)
- [ ] Definition of coverage / diversity — *pending*, depends on the above
- [ ] ⚠️ **This group and group C are two sides of the same story**:
      **over-confident pruning systematically cuts one class of solutions.**
      If that holds, the "sequence space" gap and the "pruning/backtracking" gap merge into one paper instead of two parallel selling points

---

## G. Experimental hygiene

- [ ] **dev / test split**; the test set is **not looked at once** before the main experiment finishes
- [ ] Random seeds, model versions, prompt versions **all recorded**
- [ ] **Budget gate**: a hard token cap per experiment, stop on trigger, human decides whether to continue
- [ ] Caching: identical `(prompt, seed, model)` hits cache, second run costs nothing
- [ ] **All intermediate results written to structured logs; all analysis done offline from the logs, never by re-running the model**
      → Nearly every "burned the tokens again" is caused by discovering at analysis time that a field wasn't recorded

---
---

# 中文版

# 实验 Spec 清单（跑实验前必须冻结的东西）

2026-09-14。**这是一份待填的清单，不是结论。** 每一条都由我自己拍板。

> **用法**：`A` 组冻结后不许改（改了要重跑）。`B`–`G` 组里标 *pending pilot* 的，
> 必须写明**等的是哪个 pilot 数字**。没标等谁的「待定」= 三个月后还是待定。

> **当前位置：Phase 0**（见 `research-workflow.md`）。
> Phase 0 的两个探针跑完之前，这份清单里大部分条目都还没有资格填。

---

## 这份清单服务的那句主张

> **在带精确验证器的序贯约束满足问题上，LLM 的增益不在提议质量，而在提前剪枝和定位回溯；
> 因此 query efficiency 而非 success rate 才是正确的度量。**

下面每一条存在的理由，都是为了检验这句话、或者为了不污染这句话。
**追溯不到这句话的条目，不属于主实验。**

---

## 先分清两种「待定」

| | 什么 | 什么时候定 |
| --- | --- | --- |
| **Frozen（定义性）** | 接口、契约、口径。决定模拟器怎么写、日志记什么 | **现在**。拖着不定 = 后面全部返工 |
| **Pending pilot（标定性）** | 阈值、切分点、预算上限、距离函数 | 等 pilot 数字。**提前拍脑袋就是瞎定** |

---

## A. 接口层 · Frozen

- [ ] **action space 用哪个已命名模型**
      one-layer / some-layers / all-layers simple fold；infinite vs finite line
      → 硬约束，见 `track1-surface-simulator.md`。**这是第一个要定的，别的都依赖它**
- [ ] **状态表示**：给 LLM 看什么
      → 同时是 D 组消融的 baseline 臂，所以要留出可切换的接口
- [ ] **验证器契约**：输入什么、返回什么
- [ ] ⚠️ **验证器返不返回失败原因？**
      返回理由 = 免费送给 LLM 一个剪枝信号 = **直接污染 C 组的核心实验**。
      必须明确，而且大概率要做成开关
- [ ] **「一次 query」的定义** —— 这是我全部数字的分母
      - [ ] 一次 Flat-Folder 调用？（自然，但开销随折叠深度变，跨难度不可比）
      - [ ] 一次「状态推进 + 合法性判定」？
      - [ ] 一次 LLM 调用？
      ⚠️ 它们测的不是同一件事：① 测省了多少**计算**，③ 测省了多少**推理**。
      **我的主张是关于推理的，读者会默认我在说计算。这个歧义必须在 Section 3 第一段消掉。**
- [ ] **失败后允许几次重试**
- [ ] **上下文里保留多少历史**
- [ ] **CP 数据集**：从哪来、怎么合成、多少个、难度怎么覆盖

---

## B. 难度轴

- [ ] **选哪个量当主轴**
      - [ ] 第 k 步的可行动作数（分支因子）
      - [ ] 状态空间大小的对数
      - [ ] 最短解长度
      ⚠️ 三个会给出**完全不同的曲线形状**
- [ ] **建议：全都记录，只用一个画主图，其余进附录。记录是免费的，重跑不是**
- [ ] 分层切点 —— *pending pilot*
- [ ] **验证单调性**：难度越高，纯搜索的 query 数确实单调上升吗？
      不单调 → 这个轴是坏的，换

> 这些量全都能从 Flat-Folder 直接算出。「能精确控制并测量任务难度」本身就是方法论文的贡献。

---

## C. 剪枝 / 回溯的测量协议 · **论文核心，最该先设计**

- [ ] **怎么让「剪枝」成为可观测的显式动作**
      LLM 必须在**调用验证器之前**说出「这条死了」，
      否则没法把 LLM 的判断和验证器的判定分开
- [ ] **剪枝 ground truth 怎么算**
      = 从某状态出发是否仍有解 = 一次穷尽搜索。可能很贵 → 要不要预计算并缓存？
- [ ] **剪枝的两个指标要分开报**
      - [ ] 剪枝正确性（precision / recall）
      - [ ] 剪枝带来的 query 节省
      ⚠️ 过度保守的模型剪得准但省不了；激进的模型省很多但可能剪掉唯一解。
      **报 trade-off 曲线还是单点？**
- [ ] **回溯距离误差**：失败在第 k 步，真错误在第 j 步（最后一个仍有解的前缀），
      LLM 说退到第 i 步 → `|i − j|`
      - [ ] `j` 怎么算、贵不贵
      ⚠️ 这个量在迷宫里没意义（可逐格退），**在折纸里有意义，因为「越折越难」让退错一步代价极高**
- [ ] **基线：我在跟谁比？**
      ⚠️ **基线不是消融。** 消融是从 LLM 身上拆零件，基线是参照系。
      没有纯搜索那一行，「LLM 赢在剪枝」就没有东西可赢。

| | 提议 | 剪枝 | 回溯 |
| --- | --- | --- | --- |
| **随机基线** | 随机合法动作 | 无 | 重启 |
| **纯搜索**（DFS/BFS + Flat-Folder） | 枚举 | 只靠验证器 —— 走到底才知道 | 退一步 |
| **LLM** | LLM 提议 | **LLM 提前否决，未调用验证器** | **LLM 指定退回第 k 步** |

      - [ ] 纯搜索用 DFS 还是 BFS？（query 曲线完全不同 —— 要定，不要含糊带过）
      - [ ] 随机基线拿到的 query 预算和 LLM 一样吗？
      - [ ] 要不要加第四行 —— 不含 LLM 的启发式搜索（比如按手写打分贪心）？
            这是抵挡「你的基线是稻草人」最便宜的办法

- [ ] **三组消融的具体实现**

| 消融 | 做法 | 预期（如果我的直觉对） |
| --- | --- | --- |
| 关掉提议 | 动作由枚举给，LLM 只当过滤器 | 掉幅**小** |
| 关掉剪枝 | 提议什么都送进验证器 | 掉幅**大** |
| 关掉回溯 | 失败即重启 | 掉幅**大** |

> 如果结果反过来（提议才是关键），那说明 LLM 是好 proposer 而不是好 critic ——
> **这也是个发现，不是失败的实验。**

---

## D. 表示消融（science 版，不是 engineering 版）

- [ ] ❌ 不做「试四种表示看哪个好」（那产出一张表）
- [ ] ✅ 做「**两种表示的剪枝错误类型分布是否有系统性差异**」（那产出一个机制）
- [ ] ⚠️ **D 依赖 E** —— 没有失败分类学就没有「错误类型」
- [ ] 统计检验：比的是**分布差异**，不是均值差异 → 用什么检验？
- [ ] 这一组才是能碰 Spa3R vs "I Know About Up!" 那个争论的地方
      （见 `track1-surface-simulator.md` 的 mental imagery 表）

---

## E. 失败模式分类学

- [ ] **类别定义**
      - [ ] 提议了非法动作
      - [ ] 误剪（剪掉了有解的分支）
      - [ ] 回溯过头
      - [ ] 回溯不足
      - [ ] 层序推理错
      - [ ] 在同一个 CP 上重复同一个错误
- [ ] ⚠️ **每一类怎么从日志自动判定** —— 这条决定了日志要记什么，**必须在跑之前定**
- [ ] 类别是否互斥？是否穷尽？兜底类叫什么？

> 方法论文只有曲线会显得薄。有免费验证器 = 可以**穷尽地**分类失败。
> 这张表可能比主实验更被引用。

---

## F. "find multiple ways" 的度量

- [ ] **解空间 ground truth 怎么拿**
      - [ ] 小 CP 上可穷举？
      - [ ] 大 CP 上只能采样？采样偏差怎么办？
- [ ] **序列之间的距离用什么**
      - [ ] 编辑距离（最容易辩护）
      - [ ] Hausdorff（是**形状**距离，用在**序列**上要额外论证 —— 别混用）
- [ ] 覆盖率 / 多样性的定义 —— *pending*，取决于上一条
- [ ] ⚠️ **这条和 C 组是同一个故事的两面**：
      **过度自信的剪枝会系统性地砍掉某一类解。**
      如果这个成立，「序列空间」和「剪枝/回溯」两个空白就合并成一篇论文，而不是两个并列卖点

---

## G. 实验卫生

- [ ] **dev / test 划分**，test 集在主实验跑完前**一次都不看**
- [ ] 随机种子、模型版本、prompt 版本**全部记录**
- [ ] **预算闸门**：每个实验设 token 硬上限，触发即停，人工决定是否继续
- [ ] 缓存：相同 (prompt, seed, model) 直接命中，跑第二遍不花钱
- [ ] **所有中间结果落盘成结构化日志，分析全部离线从日志做，不重跑模型**
      → 绝大部分「又烧了一遍 token」都是因为分析时发现没记某个字段
