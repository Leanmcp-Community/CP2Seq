# 几何 ⊕ 拓扑：写 abstract 时反复回来查这一页

2026-09-14。每条都有引用。

---

## 核心定义

> **平折态（flat-folded state） = 纸面到平面的等距映射 ⊕ 一个层序**
>
> - **映射**由折痕图和折叠序列固定 → **几何**
> - **层序**不由几何决定 → **拓扑**

## 四个词，不要混用

| 概念 | 严格含义 | 什么变了才算变 |
| --- | --- | --- |
| **拓扑 topology** | 连续形变下不变的性质。谁连着谁 | 剪开、粘上、**穿过** |
| **几何 geometry** | 距离、角度、坐标、全等 | 移动、旋转、缩放 |
| **序 order** | 元素之间的上下关系 | 交换次序 |
| **组合 combinatorics** | 离散结构的计数与枚举 | —— |

## 对应到 FOLD 文件，一眼看清

```json
{
  "edges_vertices":  [[0,3],[9,10],...],       ← 拓扑（谁连谁）
  "faces_vertices":  [[0,4,1],[4,6,7,5],...],  ← 拓扑（哪些点围成一个面）
  "vertices_coords": [[0,0],[0,0.667],...],    ← 几何（在哪）
  "edges_assignment":["M","V","B",...],        ← 离散标注（怎么折）
  "faceOrders":      [[f,g,s],...]             ← 序 / 嵌入拓扑（谁压谁）
}
```

## 为什么层序是拓扑而不是几何 —— 有 1996 年的定理

> **Marshall Bern & Barry Hayes, "The Complexity of Flat Origami"**, *SODA 1996*, pp.175–183
> https://dl.acm.org/doi/10.5555/313852.313918

原文结论：指派山谷折是 NP-hard；**并且即使给定一个合法的山谷赋值，确定翻片的 overlap order 仍然是 NP-hard 的。**

→ **几何全定下来，层序仍然是独立的、难的。** 这不是推测，是三十年前的定理。

两个几何完全相同、`faceOrders` 不同的折叠态，在 R³ 里**不同痕（isotopy）**——
没法在不让纸穿过纸的前提下把一个连续地变成另一个。

**isotopy 这个说法文献里有**：
> Jonathan Schneider, *Flat-Foldability of Origami Crease Patterns*
> https://www.sccs.swarthmore.edu/users/05/jschnei3/origami.pdf
> 原话: *"When both the original crease pattern and its folded image are topological disks
> embedded in R³, they are related by an **isotopy**."*

⚠️ **纽结不变量的类比要降级。** 同一篇里提纽结时只说 *"might allow adaptation of these
techniques"* —— 是未展开的建议，不是已有结果。
- ✅ 可写 "the layer ordering determines the isotopy class of the embedding"
- ⚠️ 纽结类比必须标成类比，或引 Schneider 说这是 open direction
- ❌ 不要写"层序就是纽结不变量"

⚠️ **isotopy（同痕）≠ homotopy（同伦）。** 拓扑里是两个东西，写错很刺眼。

---

## folded state vs folding motion —— 领域标准术语，用错会被一眼看穿

> **Demaine, Devadoss, Mitchell & O'Rourke, "Continuous Foldability of Polygonal Paper"**,
> CCCG 2004 · https://erikdemaine.org/papers/PaperReachability_CCCG2004/paper.pdf
> 前身: Demaine & Mitchell, *Reaching Folded States of a Rectangular Piece of Paper*, CCCG 2001

- **folded state** = 静态最终构型 = 等距映射 + 层序
- **folding motion** = 从摊平到折叠态的连续动画

**定理**：任何「良态」folded state 都**一定**存在连续折叠运动能到达。

> ★ **对 Track 1 的直接后果**：CP→Seq **不是**关于「存不存在一条路」——连续运动总是存在的。
> 问题是**离散步骤结构**：能否用有限次 **simple fold**（人手/机器能做的操作）到达。
> 这才是 Arkin 2004 / Akitaya 2017 研究的东西，也是为什么 simple foldability 是 NP-hard
> 而连续可达性不是。

---

## 折叠过程中，什么在变

| | 变吗 | 说明 |
| --- | --- | --- |
| CP 的图拓扑（`edges_vertices`/`faces_vertices`） | ❌ 不变 | 折痕图定下就固定 |
| 顶点坐标 | ✅ 每步都变 | 沿折线做镜像反射 |
| **重叠图** overlap graph（哪些面叠在哪些面上） | ✅ 每步都变 | Ku 的术语，由几何算出 |
| **层序** | ✅ 每步都变，**而且是被「选」出来的** | 决策所在 |
| 层数 / 厚度 | ✅ 累积增长 | 「越折越难」 |

> **模型必须跨步骤同时维护「几何」和「拓扑」两套状态，而且它们互相约束**：
> 几何决定哪些面会重叠（即哪些层序变量存在），层序决定哪些几何构型可达。
>
> **这个耦合就是任务真正难的地方**，也是迷宫类测试床没有的——迷宫只有几何，
> 没有一个独立的拓扑层要同时跟踪。

---

## 定版措辞

**Track 1 在学什么**：
> learning both the planar geometry and the embedding topology, **coupled**

**surface simulator 是什么**：
> an exact, free verifier for the coupled geometry-topology state

**Abstract 草稿（英）**：
> A flat-folded state is an isometric map of the sheet into the plane together with a
> layer ordering. The map is fixed by the crease pattern; the ordering is not —
> determining it is NP-hard even given a valid mountain-valley assignment
> (Bern & Hayes 1996). A single crease pattern therefore admits many folded states that
> are geometrically identical but distinct as embeddings in R³, and we ask whether they
> remain equivalent once the sheet is given thickness and material.

**中文**：
> 一个平折态 = 纸面到平面的等距映射 + 一个层序。映射由折痕图固定，**层序不是**——
> 即使给定合法的山谷赋值，确定层序仍是 NP-hard 的（Bern & Hayes, 1996）。因此同一个
> 折痕图会有多个**几何完全相同、但作为 R³ 中的嵌入互不相同**的折叠态。我们要问的是：
> **当纸被赋予厚度和材料之后，它们还等价吗？**

⚠️ 不要用「同伦」。上面这个版本绕开了同伦/同痕的措辞陷阱，而且每句都有引用撑着。

---

## 数 state 是一个 130 年的未解组合问题

**Stamp folding / Map folding**：一条有折痕的纸带有多少种折法？

> 1, 2, 6, 16, 50, 144, 462, 1392, 4536, 14060, 46310, 146376, 485914, …
> OEIS A000136 · https://oeis.org/A000136 （另见 A001011, A001416）

- **Lucas (1891)** 归于 **Émile Lemoine**；**Touchard (1950)** 给了更早文献
- **Koehler**, *Folding a Strip of Stamps*, J. Combin. Theory **5**:135–152, 1968
- **Lunnon (1971)** 多维地图折叠
- https://en.wikipedia.org/wiki/Map_folding · https://mathworld.wolfram.com/MapFolding.html
- *Foldings and Meanders* · https://arxiv.org/pdf/1302.2025 （meanders 与 stamp folding 是同一组合对象）

> **至今没有闭式公式。**

**双重好消息**：
1. 问题有可敬的数学血统，不是新造的
2. **一维就已经没有公式**了 → Flat-Folder 的 `states` 列（最大 1.45×10⁸⁰）不是工具没优化，
   **是问题本身就难**。这句可以直接回应「为什么不直接枚举」
