# 语料方案（2026-09-15 定）

> 触发：选定 action space = **simple folding（Pureland）** 之后，
> PurelandFold 的非局部依赖代理量实测 **p10=0.0 / p50=0.7 / p90=2.1 / max=3.4**，
> 而 instagram 语料是 **p10=2.6 / p50=12.8 / p90=54.4 / max=159.9**。
> **相差约 20 倍，而且 PurelandFold 内部几乎没有跨度。**
>
> 这不是数据缺陷，是 Pureland 的定义决定的 —— **只允许 simple fold 就折不出复杂的东西**。

---

## 两个后果

1. **非局部依赖轴在 PurelandFold 里用不了**（跨度太小）。那里只剩 `step` 一个轴：
   5–21，三档 **≤11 / 12–14 / >14 = 9 / 9 / 9**，分得开
2. **instagram 的 366 个真实作品大部分出了范围** —— 它们用 reverse fold / squash fold，
   **不是 simple fold**。不能要求模型用 simple fold 折出 simple fold 折不出的东西

→ 序列实验的数据量从「366 个 CP」缩到「27 条序列」。**这是选 simple folding 的真实代价。**

---

## 先例：Learn2Fold 的数据主体也是合成的

核实自 arXiv 2603.29585 正文：

> **OrigamiCode**：**5,760 条折叠序列、75,000 个已验证状态转移**
> （语言模型训练约 10,000 个 expert step，world model 约 76,000 个转移）。
> 主体来自**他们自己的 symbolic Level-0 模拟器**做 "counterfactual perturbations"，
> 只有一部分来自 "in-the-wild instructional videos"。80/20 划分。
> **没有公开发布。**

两条结论：

- **这个领域的主流做法本来就是合成，不是采集。** 27 条真实序列因此不是「少得可怜」，
  是**正常规模的真实性锚点**（Learn2Fold 的视频部分也只是配角）
- **他们不放数据 → 我用不上，只能自己合成。** 没有捷径

---

## (a) 合成 Pureland 语料 —— **正着折，不是倒着造**

从方纸出发，随机施加 simple fold，记录序列，最后展开得到 CP。

- **(CP, 序列) 配对是构造出来的，天然是 ground truth**，不需要标注
- 难度用**步数**直接控制，和 PurelandFold 的 `step` 轴同一个量纲 → 两边可比
- 关键性质：**生成是平凡的，逆问题（CP→Seq）才是难的。** 这正是基准该有的结构

**PurelandFold 的 27 条降级为真实性锚点，不是主数据。**

❓ 待定：随机折的分布怎么选才不会全是退化例子（比如反复对折）。
这个等第一批生成出来看分布再说，**不要提前设计**。

---

## (b) 「真实折纸里有多少是 Pureland」 —— **它就是 Probe C，同一份代码**

判断一个 CP 是不是 simple-foldable 的标准做法是**倒着拆**：
all-layers simple fold 的最后一步一定沿着**贯穿当前纸张的直线**，
所以反复找「全宽、方向一致的折线，展开它」，能拆回方纸就是 simple-foldable。

**而这个拆解过程就是纯搜索找折叠序列。** 所以跑一遍 instagram 的 366 个 CP，同时得到：

| 产出 | |
| --- | --- |
| **(b) 的比例** | 真实折纸里 simple-foldable 的占比 —— 直接支撑论文的范围声明 |
| **Probe C 的基线** | 纯搜索的 query 数，按难度分层 |
| **失败清单** | 跑不通的那些，正是 `../reading/creasy-cp-to-seq.md` 里说的那份清单 |

**一份实现，三个产出。不用分开做。**

⚠️ T4 证了一般情况下判定 simple foldability 是 **NP-hard** → 一定会有超时。
**诚实的报法是三分：可折 / 不可折 / 超时，超时比例本身也是结果。**

---

## 待查

- [ ] PurelandFold 里 **74 行被跳过**（`variables=0`）。27 条序列的 step 1 只占 27 个，
      剩下约 47 个是什么？脚本已改，下次跑会打出这些行的 step 分布和 faces/variables
