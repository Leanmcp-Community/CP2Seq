# Creasy / Akitaya 2013：CP → Seq 的经典算法解

2026-09-14。

- **论文**：Akitaya, Mitani, Kanamori, Fukui, *Generating Folding Sequences from Crease Patterns of Flat-Foldable Origami*
  - ACM SRC 2013 两页摘要（Cloudflare 403，curl 抓不下来，浏览器可开）：https://src.acm.org/binaries/content/assets/src/2013/hugoakitaya.pdf
  - **完整 4 页版（有算法细节和实验数据，读这个）**：https://www.npal.cs.tsukuba.ac.jp/~akitaya/CSSeminarAkitaya.pdf
  - SIGGRAPH 2013 Posters 条目：https://dl.acm.org/doi/10.1145/2503385.2503407
- **实现**：Creasy，https://github.com/xkevio/Creasy

---

## 解决什么问题

**给定一张平折的 CP，倒推出「一步一步怎么折出来」的折叠序列（origami diagram）。**

这就是 Track 1 的 CP→Seq 问题。**2013 年就被命名了**，作者原话：CP 作为记录方式很流行，但 `it is difficult to use them to re-create the design`。

---

## 方法/工作方式

三层结构：

**1. reflection path（几何观察）**

一次简单谷/山折若穿过多层纸，会在 CP 上留下一串互为镜像的折痕。识别特征有两条：

- a) 一对 reflection crease 之间总有一条折痕平分其夹角
- b) 一条折痕的山/谷属性总与其镜像相反

这样一串首尾相接的镜像对叫 **reflection path**。

| 类型 | 定义 | 性质 |
| --- | --- | --- |
| complete | 两端都落在纸边，或成环 | **删掉它不破坏局部平折性** |
| semi-complete | 只有一端落在纸边 | 用作有效性判据 |

**2. 图重写（算法核心）**

CP 建成嵌入图：每个顶点带坐标 + 一个**环形链表**按与 x 轴夹角排序邻边（保拓扑）；每条折痕 = 一对节点 + 山谷类型。

每个 origami maneuver 写成重写规则 `L → R`。在当前 CP 里做 `L` 的子图同构匹配，**反向应用** = 把这一步拆开，得到更简单的 CP。

匹配有效性判据：匹配中每个「重写后不再满足局部平折」的节点，**必须在纸边上，或连着一条 semi-complete reflection path**。全部满足才算 valid matching。

**3. step-graph**

匹配不唯一 → 一路拆下去得到一张有向图。把边反过来，**从空白方纸到目标 CP 的每条路径 = 一个合法折叠序列**。能走到空白方纸就说明该 CP 在 maneuver 集合 M 下可折。

**4. 3D 动画**（次要）
把每个顶点看成单位球心，面与球的交是球面多边形，剖成球面三角形后用球面余弦定理算二面角。非刚折 maneuver 就让各面角速度恒定、加畸变强行拼接。

---

## 验证的假设

「常用折纸手法数量有限，把它们编成重写规则字典，就能把任意平折 CP 拆回方纸。」

---

## 结论

**部分成立，且代价爆炸。**

论文 Table 1（i7-2600 3.4GHz / 4GB）：

| 模型 | 计算时间 | step-graph 节点 | 弧 |
| --- | --- | --- | --- |
| Figure 2 例子 | 295 ms | 23 | 51 |
| 传统鹤 | 451 ms | 41 | 75 |
| **传统蛙基** | **1,780,582 ms（≈30 分钟）** | **22,665** | **73,204** |

作者自己的话：`the cost explodes as the complexity of the model increases`。子图同构用的是**暴力搜索**。

M 里放 4 个基本手法（inside reverse / outside reverse / squash / petal）时，能折出大多数传统模型和少数简单现代设计。**更复杂的模型需要更专门的 maneuver** —— 也就是说动作词表是硬编码的、要人来扩。

---

## 留下的空白 / 我的机会

**作者的 future work 原文就是我的 research gap：**

> `Considerations about maneuver priorities and model symmetry can solve the problem of
> explosion of possibilities shown in section 5.1, discarding possibilities of candidates
> that should rarely be chosen.`

**他 2012 年就说该有个启发式来剪枝，十几年没人做。我的 LLM proposer 就是那个启发式。**

对应关系写死：

| Creasy / 2013 算法 | Track 1 |
| --- | --- |
| maneuver 是硬编码字典（论文 4 个，Creasy 实现 4 个） | LLM 不受固定动作词表限制 |
| 穷举整张 step-graph，蛙基 2.2 万节点 / 30 分钟 | LLM 只提议路径，不建整张图 —— 「把搜索从指数压到可行」 |
| future work 说需要优先级启发式 | 就是这里 |

三样可直接拿的东西：

1. **Baseline 数字** —— 同一批 CP，Creasy 建完整 step-graph 的节点数/秒数 vs 我的 LLM 的模拟器调用次数。这是**已发表、可引用**的对照组，比自搓的强。正好喂 Query Efficiency 指标。
2. **动作空间的形式化定义** —— reflection path 的删除规则是现成的、有理论保证的「合法一步」定义，不用自己发明。
3. **验证器的快速路径** —— 匹配有效性检查（纸边 / semi-complete reflection path）比全局平折判定（NP-hard，见 T2）便宜得多。

⚠️ 注意这里的分工和 T2 不同：Creasy 判的是**局部**平折 + 拆解合法性，Flat-Folder 判的是**全局**层序。两者互补，不重叠。

---

## 值不值得复现（为什么）

**不复现。跑，不复现。**

不复现的理由：

- 15★ / 1 fork / 最后 push 2022-02-10，**停更四年**
- **GPL3** —— 会污染代码库（Flat-Folder 是 MIT，Sim-FAST-PY 是 CC-BY）
- Java + JavaFX，且要手动 `mvn install:install-file` 塞一个 ORIPA 1.45 的 jar 进 `lib/`（折叠预览是直接调 ORIPA，自己没实现）
- 复现工程量不小，收益是重造一个 2013 年的轮子

**该做的**：下载 releases 里的 jar，喂 `flat-folder/examples/instagram/` 里的 CP 进去，记录

- 哪些 CP 它**跑不出序列**（超出 4 个 maneuver 的表达能力）
- 哪些 CP 它**炸掉**（step-graph 爆炸）

**这份失败清单比任何复现都值钱 —— 它是 Track 1 存在理由的实证。**

真要把匹配逻辑接进 Python，只抄算法思路（`ExtendedCreasePatternFactory` + `ReflectionPathBuilder`），别整包移植。

---

## 代码结构速查（核实自仓库文件树）

`src/main/java/ovgu/creasy/`（`ovgu` = Otto-von-Guericke-Universität Magdeburg，学生项目）

| 文件 | 对应论文的哪部分 |
| --- | --- |
| `origami/ExtendedCreasePattern.java`（134 行）、`ExtendedCreasePatternFactory.java` | §3.1 CP 图表示 |
| `origami/ReflectionPath.java`、`ReflectionPathBuilder.java`、`ExtendedReflectionPath.java` | §2.1 reflection path |
| `origami/ReflectionGraph.java`、`ReflectionGraphFactory.java` | 反射图构建 |
| `origami/SimplificationPattern.java`、`KnownPatterns.java` | §3.2 重写规则 |
| `origami/basic/Diagram.java`、`DiagramStep.java` | §3.4 step-graph |
| `origami/oripa/*` | 调 ORIPA 做折叠预览 |

**`KnownPatterns.java` 只有 67 行、4 条规则**：`insideReverseFold`、`outsideReverseFold`、`swivelFold1`、`swivelFold2`。

⚠️ 与论文有出入：论文说 M = inside reverse / outside reverse / **squash** / **petal**；Creasy 实现的是 inside/outside reverse + **swivel ×2**。要引用 baseline 数字时注意这个保真度差异。

---

## ⚠️ 2026-09-15：能不能拿 Table 1 当 Probe C 的基线？**不能。**

Probe C 想要的是「纯搜索找一条折叠序列要多少次调用」。Table 1 的 22,665 / 30 分钟看起来正好，
但三条都对不上：

**1. 动作空间不同 —— 这条最致命。**
T11 的模型是 **4 个 maneuver 的字典**（inside/outside reverse、squash/petal，Creasy 实现的是
swivel×2）。**这些都不是 simple fold。**
而我们已定 action space = **simple folding（Pureland）**，序列数据用 PurelandFold。
→ **两套模型的序列互不可表达。** T11 的数字量的是另一个问题。

**2. 量的东西不同。**
22,665 是**完整 step-graph 的节点数**（所有拆解可能性的全图），不是「找到一条序列要展开多少节点」。
找一条会便宜得多，枚举全部会更贵。**这个数既不是上界也不是下界，是另一个量。**

**3. n=3。**
Table 1 只有三个模型（Figure 2 例子 / 鹤 / 蛙基）。不是曲线，不是分布。
**Probe A 的教训就是分布比均值重要**，三个点撑不起基线。

### 由此暴露的决定点

**「action space = simple folding」和「拿 T11 当基线」二选一，不能都要：**

| | 保 simple folding | 改用 T11 的 maneuver 模型 |
| --- | --- | --- |
| 序列数据 | ✅ PurelandFold（27 序列，现成） | ❌ 要自己造 |
| 理论地基 | ✅ T4 simple folding NP-hard 可引 | ❌ T4 不适用，maneuver 模型没有复杂度结论 |
| 已发表基线 | ❌ 没有，Probe C 要自己跑 | ✅ Table 1 可引 |
| 每步可用 Flat-Folder | ✅ Pureland 中间态都是平折态 | ❓ 未验证 |

**倾向保 simple folding** —— 三比一，而且丢掉的那一项（基线）本来就只有 3 个数据点。
**T11 降级为 related work：证明「经典方法会爆炸」的引文，不是对照组。**

→ **Probe C 仍然要自己跑。** 但现在有明确的落点：在 PurelandFold 的 27 条序列上，
用 simple fold 动作空间做穷举搜索，记录 query 数，按 step 三档（≤11 / 12–14 / >14）分层报。
