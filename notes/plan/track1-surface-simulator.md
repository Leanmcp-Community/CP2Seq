# Track 1 · Surface Simulator（CP → Seq）

2026-09-14。我的命名保留：**surface simulator** / **CP→Seq problem**。

> **已决定（2026-09-14）：Track 1 和 Track 2 是两篇独立论文。**
> 不是「暂时分开写」，是定案。理由：验证器成本差 10⁴ 倍。
> **推论：Track 1 的设计不受 Track 2 任何约束** —— 不为了兼容力学而限制 CP 规模、
> 不为了将来能加材料而改状态表示。这条线可以自由做到底。

---

## 我的原始想法

> Can you build a simulator that can properly sim paper folding — these simple physical
> contraptions — to let AI think in spatial and 3D dimensions rather than thinking in text
> and images? Once we build such simulator, we give AI proper CP and several steps then let
> AI explore themselves to fold into correct ways, **find multiple ways** that can fold into
> final CP. (RL)
>
> paper cannot go through each other; once you fold one step, next step might be harder
> since paper becomes thicker, more layers. For LLM it only has CP and some simple steps and
> final image — how does it figure out the way to fold? In the process, the edge, line, point
> and surface is keeping changing while folding. **Isn't that a 3D imagination ability we can
> foster?**
>
> here AI is learning the origami topology not 3D.

**我们的立场**：Track 1 和 2 都要给 LLM 一个模拟器（surface / 3D），**让它通过模拟器去思考**。
—— 这就是文献里的 "Imagery Module" / 认知假肢。

---

## 这个立场成立，但有一个必须提前回答的质问

> 「如果模拟器把几何都算了，LLM 到底学到了什么？是不是模拟器在干所有的活？」

**分工必须写死**：

| 谁 | 干什么 |
| --- | --- |
| **模拟器** | 状态更新、合法性判定。**它不搜索、不选择，只回答「这一步行不行」** |
| **LLM** | 在指数大的动作空间里**提议下一步**、**决定往哪走**、**知道何时回退** |

**模拟器是裁判，不是棋手。** 判定全局平折态本身是 NP-hard（Akitaya-Demaine-Ku），穷举不可行。
**LLM 的价值是把搜索从指数压到可行**，这是模拟器给不了的。

**度量也要跟着变**：不用「成功率」，用**「达到目标用了多少次模拟器调用」**
—— 正好是 OrigamiBench 的 **Query Efficiency**。
两个模型用同一个模拟器，谁调用少谁强 → 「模拟器在干活」的质疑自动消解。
先例：AlphaGo（网络提议 + 搜索验证）、Learn2Fold（LLM 出程序 + world model 前瞻）。

---

## 「3D imagination」怎么说才站得住

见 `../reading/geometry-topology-definitions.md`。结论：

| 能说 | 不能说 |
| --- | --- |
| ✅ "spatial reasoning"（spatial ≠ 3D） | ❌ 把状态表示直接叫 3D |
| ✅ 模型必须跨步骤维护并更新一个几何状态 | ❌ 声称模型在做三维重建（除非测了） |
| ✅ 折叠是研究 mental imagery 的理想测试床 | ❌ 把三维想象当**前提** |
| ✅ **「三维表示是必需的还是仅仅充分的」当成研究问题** ←「最强」，*但前提是真做了实验；现在没有* | |

> **把 "3D imagination" 从前提变成研究问题本身。**
> 前提会被攻击；研究问题不会，而且正好踩在一个没有定论的争论上。

**「越折越难」是区别于迷宫类任务的核心卖点**，而且可量化：第 k 步的可行动作数、
涉及层数、约束数 —— **全都能从 Flat-Folder 直接算出来**。应该有专门一节。

注：零厚度平折理论**没有**「越折越难」（零厚度的纸折 1 层和 50 层代价一样）。
这个现象在 Track 1 里的形式化出口是 **simple fold 的模型分类**（见下），
在 Track 2 里的出口是**厚度**。

---

## 理论地基：动作空间已经被形式化，复杂度都算过

**⚠️ 硬约束：RL 的 action space 必须是下面某一个已命名的模型，或必须论证为什么用新的。**
随便定义一个「折一下」，理论界会立刻问是哪个模型。

| 模型 | 定义 |
| --- | --- |
| **one-layer simple fold** | 绕一条线把**一层**纸转 ±180° |
| **some-layers simple fold** | 转**若干层** |
| **all-layers simple fold** | 转**所有**与该线相交的层（对应钣金折弯） |
| **infinite vs finite line** | 折线无限长还是有限段 |

- **Arkin, Bender, Demaine, Demaine, Mitchell, Sethia, Skiena, "When Can You Fold a Map?"**
  *Comput. Geom.* 29(1):23–46, 2004 · https://erikdemaine.org/papers/MapFolding/
  → 地图折叠多项式，稍推广即 NP-complete
- **Akitaya, Demaine, Ku, "Simple Folding is Really Hard"**, *J. Information Processing*, 2017
- **Akitaya et al., "Infinite All-Layers Simple Foldability"**, *Graphs and Combinatorics*
  · https://arxiv.org/pdf/1901.08564
- **"Complexity of Simple Folding of Mixed Orthogonal Crease Patterns"** · https://arxiv.org/pdf/2306.00702
- **Akitaya, Demaine, Ku, "Computing Flat-Folded States"**, OSME 2024
  · https://erikdemaine.org/papers/FlatFolder_OSME2024/paper.pdf
  → **Flat-Folder 本身的论文，动笔前必读**。证明判定全局平折态 NP-hard
- **"Flat Origami is Turing Complete"** · https://arxiv.org/pdf/2309.07932
  → **平折折纸图灵完备**。
  ⚠️ **只当防守用，不当进攻用（2026-09-14 定）**：审稿人说「折纸是玩具问题」时拿它挡回去。
  它证明**表达力足够**（这个领域不会因为太简单而没意思），
  **不证明在它上面学到的东西能迁移** —— Rule 110 也图灵完备。
  「折纸图灵完备 → 训练 AI 折纸能让它理解物理世界」这条因果链中间是断的，**不写**。

---

## CP→Seq 这个问题 2013 年就被命名了

> **Hugo A. Akitaya et al., "Generating Folding Sequences from Crease Patterns of
> Flat-Foldable Origami"**, ACM Student Research Competition, 2013
> https://src.acm.org/binaries/content/assets/src/2013/hugoakitaya.pdf

Akitaya 就是 Flat-Folder 理论论文的作者之一 —— **我用的工具和这个问题出自同一批人。**

| 已有方法 | 做法 |
| --- | --- |
| Akitaya 2013 | 符号方法，从 CP 生成折叠序列 |
| **离散粒子群优化 PSO** | 组合优化，**最小化当前形状与目标形状的 Hausdorff 距离** |
| [Creasy](https://github.com/xkevio/Creasy) | CP → 折叠指令，Java/GPL-3.0，**2022 后停更** |
| "Automatically Making Origami Diagrams" | Springer 2008 |
| **Learn2Fold 2026** | LLM 出候选程序 + 学出的 world model 做前瞻规划 |

那个 Hausdorff 距离，就是 Oh/Toussaint/Demaine 的 CP dissimilarity measure 的用途。这条线是通的。

**区分两个不同问题**：
- **prompt → sequence** = Learn2Fold 的问题，已有人做
- **CP → sequence** = 我的这个，老问题、理论成熟、更可解

---

## 空白在哪

**不是「AI 能不能折出来」** —— Learn2Fold 做了。

是我自己那句话里的三个字：**"find multiple ways"**。

> **前人都在找一条序列。没有人研究序列的空间本身。**

一个 CP 有多少条合法折叠序列？它们差多远？哪些人手能折、哪些只有机器能做？哪条最短？

**这和「一个 CP 多个 state」是同一问题的另一个投影**
—— 之前那四个维度（力学性能 / 步骤数 / 人手易折性 / 机器可执行性）原样搬到序列上。
**这是已有资产，不用重新想。** 见 `../reading/2026-09-11-states-and-simulator.md`。

---

## ⚠️ 实验设计：**还没有**

2026-09-14 删除。这里原先有一段 AI 自作主张写的「A/B/C/D 四组表示消融」。
**那不是我的想法，我也还没想好要论证什么。** 删掉，留白。

现在确定的只有：这条线上有一个开着的问题（见上：Spa3R vs "I Know About Up!"），
**但「用什么实验回答它」「甚至要不要回答它」都还没定。**
在想清楚之前不要往这里填表格。

## mental imagery 文献（Track 1 的外部语境）

这条线让 Track 1 从「折纸论文」变成「NeurIPS 论文」。

| 论文 | 内容 |
| --- | --- |
| **Mind's Eye of LLMs: Visualization-of-Thought (VoT)**, NeurIPS 2024 · https://arxiv.org/pdf/2404.03622 | 诱导 LLM 生成「心像」可视化内部状态再推理。**我说的那个能力已经有名字** |
| **Machine Mental Imagery: latent visual tokens** · https://arxiv.org/pdf/2506.17218 | 潜视觉 token 做多模态推理 |
| **Limits of Spatial Imagery Reasoning in Frontier LLM Models** · https://arxiv.org/html/2603.26779v2 | 前沿模型空间想象的边界 |
| **Reasmory: 3D Reconstruction as Explicit Memory for VLMs** · https://arxiv.org/pdf/2606.00963 | 3D 重建当显式记忆 |
| **Spa3R** · https://arxiv.org/pdf/2602.21186 | **不用显式 3D 模态**也能学空间表示 ← **站我反面** |
| **"I Know About Up!"** · https://arxiv.org/pdf/2407.14133 | 用 3D 重建增强空间推理 ← **站我这面** |
| **Spatial Reasoning in MLLMs: A Survey** · https://arxiv.org/pdf/2511.15722 | **先读这篇** |

还有人做 **"Imagery Module"** —— 给 LLM 外挂能渲染和旋转 3D 模型的工具，当**认知假肢**。
**这正是我们的定位。**

> **Spa3R 和 "I Know About Up!" 是对立的两个答案。这个问题领域内还没定论。**
> 我的问题不是已被解决，是**还开着**。

## 为什么折纸比现有测试床好

现有测试床：迷宫导航（VSP）、心理旋转（SpatialViz）、多视角场景。

| | 迷宫 / 心理旋转 | **折纸** |
| --- | --- | --- |
| 验证器 | 要人标注 | **免费、精确、毫秒级** |
| 数据量 | 有限 | **可无限合成** |
| 步骤间耦合 | 弱 | **强（「越折越难」）** |
| 状态复杂度 | 固定 | **随步骤增长**（层数累积） |
| 可分解性 | 难分离「看」和「想」 | **可精确控制给模型看到什么表示** |

---

## Track 1 的完整形状

```
问题：给定 CP + 目标形态，找出折叠序列（们）
理论地基：simple foldability 的模型分类 + 复杂度（Arkin 2004, Akitaya 2017）
验证器：Flat-Folder（免费、精确）
空白 1：没人研究序列空间本身（"find multiple ways"）
空白 2：没人用它回答 mental imagery 那个争论
实验：待定（还没想好论证什么）
可宣称：第一个带免费精确验证器的序贯空间推理测试床
```
