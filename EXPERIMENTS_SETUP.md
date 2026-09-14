# Experiments Setup — Tool-Augmented VLM for CP → Fold Sequence

2026-09-14. Operational design for the plan sketched in `notes/experiment-spec-checklist.md`
("Experiment Plan" section). That file has the hypothesis, metrics, and ablation *definitions*;
this file is the concrete loop, tools, and dataset audit needed to actually run it.

Scope: Track 1 (CP → Seq) only, per `notes/track1-surface-simulator.md`.

---

## 1. Dataset

### 1.1 Sources

- **Flat-Folder** examples (`flat-folder/examples/...`) — CPs only. Per
  `notes/flat-folder-capabilities.md`, Flat-Folder has **no concept of a step at all** — it
  solves for terminal flat-folded states, not sequences. So these give us CPs and, at best, a
  terminal state — never a step-by-step ground truth.
- **Learn2Fold** dataset — this is where a `(CP, final result)` pair is most likely to exist in
  a form we can reuse directly. Needs an audit (below) to confirm the exact format of "final
  result" it ships (`.fold` state, rendered image, or 3D mesh — TBD, check their repo/paper).
- **Creasy / Akitaya 2013** worked examples — per `notes/creasy-cp-to-seq.md`, a handful of
  classic models (crane, frog base) have a **fully computed step-graph**, i.e. genuine
  step-by-step ground truth, sometimes tens of thousands of nodes deep. Useful as reference
  sequences for the few models it covers; not a source of new CPs (GPL-3, unmaintained since
  2022 — we don't reproduce it, see that file).

### 1.2 The real shape of the data: pairs are common, sequences are rare

Every sample we can use has at minimum a **`(CP, final result)` pair** — that's the
non-negotiable minimum, since it's the ground truth the loop's ACCEPT/REJECT check needs.

What's *not* guaranteed is the middle: the full `.fold`-by-`.fold` sequence connecting CP to
final result. Some sources (Creasy's step-graphs) give sequences hundreds of steps long for a
few classic models. Most CPs in the wild give us only the two endpoints — no intermediate
`.fold` files exist at all.

⚠️ **Consequence**: this splits the dataset into three usable buckets, and not every experiment
can run on every bucket:

| Bucket | Has | Usable for |
| --- | --- | --- |
| A | CP + full step sequence | Sequence-level metrics (edit distance, group F of the checklist) |
| B | CP + final result only, no intermediate steps | ACCEPT/REJECT loop (this doc's main experiment) |
| C | CP only, no ground truth of any kind | Not usable for scored experiments — exploration/pilot only |

### 1.3 Action item before running anything

- [ ] Write an audit script over every dataset source that buckets each CP into A/B/C above and
      records, for bucket A, exactly how many intermediate steps exist.
- [ ] Report bucket sizes before doing the dev/test split (group G in the checklist depends on
      knowing how many samples are actually scorable).
- [ ] For Learn2Fold specifically: confirm the exact file format of "final result" (`.fold` /
      image / mesh) since the simulator's comparison step (§4) needs to know what it's diffing
      against.

---

## 2. The model under test: a VLM

**VLM = an LLM with vision input.** Nothing more exotic than that — it takes the same text
context (CP description, prompt, history) as a plain LLM, plus it can also consume the images
the simulator renders. Every "LLM" reference in the Experiment Plan section of
`notes/experiment-spec-checklist.md` becomes a VLM call the moment the visual feedback channel
is turned on, because a text-only model literally cannot read the rendered fold-state images.

Candidate models (no training/fine-tuning on any of them — inference and tool-calling only, per
PR #2): **Gemini Flash** (free credits), **Nemotron**, and other off-the-shelf VLMs opportunistically.

---

## 3. Tools given to the VLM

### 3.1 Surface simulator — the core tool, must be built

- **Input**: a `.fold` file — either a full state, or the previous state plus one candidate next
  fold applied to it.
- **Output on success**: a 3D representation of that state — either (a) a three.js scene, or
  (b) 3–4 static images rendered from different camera angles.
- **Output on failure**: a structured **error**, not images — the candidate fold is illegal
  because the paper would have to pass through itself ("penetrate"). This is the same class of
  check as Flat-Folder's four constraint types (`taco-taco` / `taco-tortilla` /
  `tortilla-tortilla` / `transitivity` — see `notes/flat-folder-capabilities.md`), but applied to
  **one candidate step**, not a global terminal state.
- This is the piece the rest of the notes call the **surface simulator**. Flat-Folder does not
  provide it — Flat-Folder has no notion of "step," full stop — so it has to be built from
  scratch. This is the actual engineering deliverable of Track 1.

### 3.2 Hamiltonian-path tool (Prof. Yi's suggestion) — to attempt

- Intended purpose (still being scoped): search over / verify a traversal order on the crease
  graph, to help the VLM propose an ordering instead of deriving one from scratch every step.
- Status: **not implemented yet.** Either build a minimal version or find an existing
  open-source implementation that does the equivalent job — needs its own short scoping note
  before it's added to the tool belt for real. Don't let it block the surface simulator work.

### 3.3 Image-generation tool — optional, experimental

- Purpose: given a `.fold` file, generate a picture of the folded state directly (candidates:
  **Nano Banana**, a **GPT Imagen-2-class** model), as an alternative to the simulator's
  geometrically exact render.
- ⚠️ **Accuracy is unverified.** An image generator is not a geometry solver — it can produce a
  plausible-looking image of a fold that is actually illegal. Treat this strictly as an
  **ablation arm** ("does a fast-but-unverified image help or hurt vs. the simulator's exact
  render?"), never as a substitute for the simulator's correctness guarantee.

---

## 4. The loop

```
   (CP, FINAL RESULT)                 ← dataset pair (§1)
            │ CP
            ▼
      ┌───────────┐
      │  PROMPT   │◄──────────────────────┐
      └─────┬─────┘                       │
            ▼                             │
      ┌───────────┐                       │
      │    VLM    │                       │
      └─────┬─────┘                       │
            │ candidate next .fold step    │
            ▼                             │
      ┌────────────────────┐              │
      │  SURFACE SIMULATOR  │              │
      │   (+ optional tools) │              │
      └─────────┬───────────┘              │
           ok   │   illegal fold           │
           ▼    ▼                          │
        IMAGES  ERROR ──────────────────────┘
           │
           │  (VLM marks its own step "final")
           ▼
      FINAL .fold  ──►  compare to FINAL RESULT  ──►  ACCEPT / REJECT
```

- **Dataset pair**: `(CP, FINAL RESULT)` from a bucket-B-or-better sample (§1.2).
- **PROMPT**: the running context — CP, task instructions, and the full history of
  step → images/error exchanges so far. This is what actually grows each iteration; the VLM box
  itself is stateless per call.
- **VLM**: proposes the next `.fold` step, or declares the sequence complete.
- **Surface simulator**: the verifier (§3.1) — renders images on success, returns a structured
  error on an illegal (self-intersecting) fold. Optional tools (§3.2, §3.3) sit alongside it.
- **Loop**: images or error get folded back into the prompt for the next VLM call. This repeats
  until the VLM emits a step it marks as final.
- **Compare**: the VLM's final `.fold` is diffed against the dataset's `FINAL RESULT` (format
  depends on source — §1.1) → **ACCEPT** if it matches, **REJECT** if it doesn't.

---

## 5. Experiment conditions

| Condition | Tools available | What it measures |
| --- | --- | --- |
| **Full tool belt** | surface simulator + Hamiltonian tool (if ready) + optional image-gen | upper bound — how well the loop does with everything |
| **No tools, prompt-only** | none — plain VLM prompting, no simulator calls | memorization control (per PR #2's Experiment Plan) — is the model reasoning through the loop or just recalling the fold from pretraining/dataset exposure |

Same VLM, same CP set, same query budget across both conditions — this is the direct A/B that
answers "how would it behave and what's the accuracy without these tools."

---

## 6. Metrics

- **% of dataset solved** — fraction of bucket-B-or-better CPs where the loop's final `.fold`
  matches `FINAL RESULT`, computed for both conditions in §5. This is the headline number: "out
  of the dataset, how many did the experiment actually solve."
- **Queries to solve** — number of simulator/tool calls per solved CP (ties to the query
  efficiency claim in `notes/experiment-spec-checklist.md`).
- **Sequence-level metrics** (edit distance to ground-truth sequence, group F) — only computable
  on bucket A, since it's the only bucket with a real intermediate sequence to compare against.

---

## 7. Error analysis

Every simulator rejection already comes labeled with which constraint class it violated
(Flat-Folder's four types, §3.1) — reuse the failure taxonomy in group E of
`notes/experiment-spec-checklist.md` rather than inventing a new one. This is what turns a REJECT
into a diagnosis instead of a dead end.

---

## 8. Output

Numbers from §6 + the error breakdown from §7, for both conditions in §5, get written up as the
Track 1 paper (framing per `notes/track1-surface-simulator.md`).

---
---

# 实验设置 —— 工具增强 VLM 做 CP → 折叠序列

2026-09-14。把 `notes/experiment-spec-checklist.md`（「实验计划」一节）里的方案落成可执行的设计。
那份文件给的是假设、指标和消融的**定义**；这份文件是真正跑起来需要的具体循环、工具和数据集审计。

范围：只做 Track 1（CP → Seq），依据 `notes/track1-surface-simulator.md`。

---

## 1. 数据集

### 1.1 来源

- **Flat-Folder** 自带示例（`flat-folder/examples/...`）—— 只有 CP。根据
  `notes/flat-folder-capabilities.md`，Flat-Folder **完全没有「步骤」这个概念** —— 它求解的是
  终态平折态，不是序列。所以这些示例给的是 CP，最多再加一个终态 —— 从来没有逐步的
  ground truth。
- **Learn2Fold** 数据集 —— 这是最可能现成存在 `(CP, final result)` 对、可以直接拿来用的地方。
  需要先做下面的审计，确认它给的「final result」到底是什么格式（`.fold` 状态 / 渲染图片 /
  3D 网格 —— 待定，要去查它的仓库/论文）。
- **Creasy / Akitaya 2013** 的现成例子 —— 根据 `notes/creasy-cp-to-seq.md`，少数几个经典模型
  （千纸鹤、蛙基）有**完整算出来的 step-graph**，也就是真正逐步的 ground truth，有的深达几万个
  节点。可以当作它覆盖到的那几个模型的参考序列；但不是新 CP 的来源（GPL-3，2022 年后停更 ——
  我们不复现它，见那份文件）。

### 1.2 数据的真实形状：配对常见，序列稀有

我们能用的每一个样本至少要有一个 **`(CP, final result)` 配对** —— 这是不可谈判的最低要求，
因为它是循环里 ACCEPT/REJECT 判定所需要的 ground truth。

**没有保证的是中间那一段**：从 CP 到 final result 之间逐个 `.fold` 的完整序列。少数来源
（Creasy 的 step-graph）能给出长达几百步的序列，但仅限少数几个经典模型。野生环境里的大多数 CP
只给我们两个端点 —— 中间的 `.fold` 文件根本不存在。

⚠️ **后果**：这把数据集分成三个可用的桶，不是每个实验都能在每个桶上跑：

| 桶 | 拥有 | 可用于 |
| --- | --- | --- |
| A | CP + 完整逐步序列 | 序列层面的指标（编辑距离，清单里的 F 组） |
| B | 只有 CP + final result，没有中间步骤 | ACCEPT/REJECT 循环（本文档的主实验） |
| C | 只有 CP，没有任何 ground truth | 不能用于打分的实验 —— 只能做探索/pilot |

### 1.3 跑之前要做的事

- [ ] 写一个审计脚本，扫描每一个数据集来源，把每个 CP 归到上面的 A/B/C 桶里，并且对 A 桶
      记录到底有多少个中间步骤。
- [ ] 在做 dev/test 划分之前先报出各桶大小（清单里的 G 组要知道到底有多少样本能打分）。
- [ ] 专门针对 Learn2Fold：确认它「final result」的确切文件格式（`.fold` / 图片 / 网格），
      因为模拟器的比对步骤（第 4 节）需要知道自己在跟什么做 diff。

---

## 2. 被测模型：一个 VLM

**VLM = 带视觉输入的 LLM。** 没有更玄乎的东西了 —— 它跟普通 LLM 一样吃同样的文本上下文
（CP 描述、prompt、历史），只是额外能消费模拟器渲染出的图片。`notes/experiment-spec-checklist.md`
「实验计划」一节里每一处「LLM」，一旦打开视觉反馈通道，就都变成 VLM 调用 —— 因为纯文本模型
根本读不了渲染出来的折叠状态图片。

候选模型（不对它们做任何训练/微调 —— 只用推理和 tool-calling，见 PR #2）：**Gemini Flash**
（有免费额度）、**Nemotron**，以及其他现成的 VLM，视机会而定。

---

## 3. 给 VLM 的工具

### 3.1 曲面模拟器 —— 核心工具，必须自己搭

- **输入**：一个 `.fold` 文件 —— 可以是一个完整状态，也可以是「上一个状态 + 一个候选的下一步
  折法」。
- **成功时的输出**：该状态的 3D 表示 —— 要么 (a) 一个 three.js 场景，要么 (b) 从不同摄像机角度
  渲染出的 3–4 张静态图片。
- **失败时的输出**：一个结构化的**错误**，不是图片 —— 因为这个候选折法非法，纸会「穿透」自己。
  这跟 Flat-Folder 的四类约束检查（`taco-taco` / `taco-tortilla` / `tortilla-tortilla` /
  `transitivity` —— 见 `notes/flat-folder-capabilities.md`）是同一类判定，只是这里判的是
  **单个候选步骤**，不是全局终态。
- 这就是笔记里其他地方说的**曲面模拟器（surface simulator）**。Flat-Folder 不提供这个 ——
  它压根没有「步骤」的概念 —— 所以必须从零搭建。这才是 Track 1 真正的工程交付物。

### 3.2 哈密顿路径工具（Yi 教授的建议）—— 待尝试

- 目前设想的用途（还在细化中）：在折痕图上搜索/验证一个遍历顺序，帮助 VLM 提议一个顺序，
  而不是每一步都从零推导。
- 状态：**还没实现。** 要么自己搭一个最小版本，要么找一个现成的开源实现来做同样的事 ——
  在真正加入工具腰带之前需要单独写一份简短的 scoping note。不要让它卡住曲面模拟器那部分的工作。

### 3.3 图像生成工具 —— 可选，实验性

- 用途：给定一个 `.fold` 文件，直接生成一张折叠状态的图片（候选：**Nano Banana**、
  **GPT Imagen-2 级别**的模型），作为模拟器几何精确渲染的一个替代方案。
- ⚠️ **准确性未经验证。** 图像生成模型不是几何求解器 —— 它可能生成一张看起来合理、但实际上
  非法的折法图片。这应该严格当作一个**消融分支**来对待（「一张快但未经验证的图片，到底是帮助
  还是拖累，相对于模拟器精确渲染而言？」），绝不能替代模拟器的正确性保证。

---

## 4. 这个循环

```
   (CP, FINAL RESULT)                 ← 数据集配对（第 1 节）
            │ CP
            ▼
      ┌───────────┐
      │  PROMPT   │◄──────────────────────┐
      └─────┬─────┘                       │
            ▼                             │
      ┌───────────┐                       │
      │    VLM    │                       │
      └─────┬─────┘                       │
            │ 候选的下一个 .fold 步骤       │
            ▼                             │
      ┌────────────────────┐              │
      │    曲面模拟器        │              │
      │   (+ 可选工具)       │              │
      └─────────┬───────────┘              │
           成功  │   非法折法               │
           ▼    ▼                          │
        IMAGES  ERROR ──────────────────────┘
           │
           │  （VLM 自己标记该步骤为「final」）
           ▼
      FINAL .fold  ──►  与 FINAL RESULT 比对  ──►  ACCEPT / REJECT
```

- **数据集配对**：来自一个 B 桶及以上样本的 `(CP, FINAL RESULT)`（第 1.2 节）。
- **PROMPT**：持续运行的上下文 —— CP、任务说明，以及到目前为止「步骤 → 图片/错误」交互的完整
  历史。真正逐轮增长的是这个东西；VLM 这一格本身每次调用都是无状态的。
- **VLM**：提议下一个 `.fold` 步骤，或者宣布序列已经完成。
- **曲面模拟器**：即验证器（第 3.1 节）—— 成功时渲染图片，遇到非法（自我穿透）的折法就返回一个
  结构化错误。可选工具（第 3.2、3.3 节）跟它并列存在。
- **循环**：图片或错误被折回 prompt，供下一次 VLM 调用使用。这个过程一直重复，直到 VLM
  发出一个它标记为 final 的步骤。
- **比对**：VLM 的 final `.fold` 拿去跟数据集的 `FINAL RESULT` 做 diff（格式取决于来源 ——
  第 1.1 节）—— 匹配则 **ACCEPT**，不匹配则 **REJECT**。

---

## 5. 实验条件

| 条件 | 可用工具 | 测的是什么 |
| --- | --- | --- |
| **完整工具腰带** | 曲面模拟器 + 哈密顿工具（如果就绪）+ 可选的图像生成 | 上限 —— 什么都有的情况下这个循环能做到多好 |
| **无工具，纯 prompting** | 无 —— 纯 VLM prompting，不调用模拟器 | 记忆性对照（对应 PR #2 的「实验计划」）—— 模型是在通过这个循环推理，还是只是在回忆它从预训练/数据集里见过的折法 |

同一个 VLM、同一批 CP、同样的 query 预算跑这两个条件 —— 这就是直接回答「没有这些工具会怎么表现、
准确率是多少」的那个 A/B。

---

## 6. 指标

- **数据集解决比例** —— 在 B 桶及以上的 CP 里，循环产出的 final `.fold` 跟 `FINAL RESULT`
  匹配的比例，第 5 节两个条件都要算。这是最重要的数字：「这批数据里，实验到底解决了多少个」。
- **解决所需的 query 数** —— 每个成功解决的 CP 用了多少次模拟器/工具调用（对应
  `notes/experiment-spec-checklist.md` 里的 query efficiency 主张）。
- **序列层面的指标**（跟 ground-truth 序列的编辑距离，F 组）—— 只能在 A 桶上算，因为只有它
  有真正的中间序列可以拿来对比。

---

## 7. 错误分析

每一次模拟器拒绝时，已经自带标签说明违反了哪一类约束（Flat-Folder 的四类，第 3.1 节）——
直接复用 `notes/experiment-spec-checklist.md` E 组的失败分类学，不要另起炉灶。这才能把一次
REJECT 变成一个诊断，而不是一个死胡同。

---

## 8. 产出

第 6 节的数字 + 第 7 节的错误分解，两个条件（第 5 节）各一份，最终写成 Track 1 的论文
（框架依据 `notes/track1-surface-simulator.md`）。
