# 2026-09-11 · 多解问题 & simulator 分层

方向已定：**折痕图 → 结构性能**。机械臂这次不做。先用纸，材料以后再换。

---

## Q1 「learned surrogate ─→ 学一个 GNN，直接从 CP-graph 预测力学性能」这是啥意思

真 simulator 慢。MERLIN2 算一次几秒到几分钟，RL / 搜索要跑 10⁶ 次以上，算不完。

所以分两步：

1. 用真 simulator（MERLIN2）离线跑几万个样本，每个样本得到 (CP-graph, 刚度/承载)
2. 拿这些样本训一个 GNN：输入 CP-graph，输出力学性能。之后用 GNN 代替 MERLIN2，快几个数量级
3. 搜索时用 GNN，最后的候选再回去用真 simulator 校验

**「无需人工标注」的意思**：标签是 MERLIN2 算出来的，不是人标的。要多少有多少，只花 CPU 时间。
这就是 Learn2Fold 的架构（Level0Sim 当 hard verifier + 学一个 differentiable world model 当代理），只是把 L0 组合验证换成 L2 力学。

---

## Q2 Flat-Folder 不是也 check 了 foldability 吗，也有算法

对，我上次说「Flat-Folder 缺偏好函数」措辞有误导，澄清一下：

- Flat-Folder **有**完整算法，而且 check 得很彻底 —— 前川/川崎 + 四类约束 + 层序求解
- 但它 check 的是**几何合法性**（折起来纸不穿过自己）
- 它**不 check 力学**（能承多重、会不会塌）—— 它的世界里纸是零厚度、无重量、无材料的数学平面

所以不是「它没算法」，是**它算完之后给出 4428 个合法解，然后无法在这些解之间排序**。排序需要的信息（物理）它根本没有。

---

## Q3 Learn2Fold 没研究多解，他们直接给定顺序图，那 state 不就只有一种吗

**是的，而且这正是空白的来源。**

Learn2Fold 建模的是**折叠序列**（一步一步的 procedural），数据是专家轨迹 —— 人怎么折就怎么折。
**一条给定的路径会唯一确定最终的层序。** 所以对他们来说 state 确实只有一个：被数据选中的那个。

推论：
- 有 demo 数据 → 不用面对「该选哪个态」这个问题
- 整个 AI 折纸文献都有 demo 或有目标图，所以**集体绕过了 (a) 类多解**
- 但一旦要从语义生成（没有 demo），或者要优化结构性能，这个选择就暴露出来，且必须回答

---

## Q4 state 的意义是什么？除了物理差别，有没有易折性、步骤多少的差别

有。而且这个问题比只谈力学更有价值 —— **state 排序不止一个维度**：

| 维度 | 含义 | 有没有现成 metric |
| --- | --- | --- |
| **力学性能** | 层叠顺序不同 → 局部厚度分布、层间互锁/摩擦不同 → 刚度/承载不同 | 无（bar-and-hinge 能算，但没人对 state 做过） |
| **步骤数** | 不同 state 到达所需的折叠动作数不同 | 无 |
| **人手易折性** | 有些层序要塞（tuck）、要同时动多条折痕（compound move），手很难做；有些纯序列就能完成 | 无 |
| **机器可执行性** | 同上但约束不同（夹爪数量、能不能同时动） | 无 |

四个维度**全都没有现成指标**。这本身就是可做的东西。

注：FoldingAgent 的 5 个 primitive（add_vertex / fold / unfold / rotate / flip）里，
「同时发生的 compound action」正是它明确报告的失败模式之一 —— 和「人手易折性」这个维度对上了。

---

## ★ MARK：最小可行实验（两周，一个人）

> **命题**：在 flat-foldability 的世界里，一个折痕图的所有合法折叠态是等价的；
> 引入结构性能之后，它们不再等价，而且这个排序是可计算的。

**做法**：
1. 从 flat-folder `examples/instagram/` 挑一个 `states` 数中等的 CP（几十到几百个态）
2. 把每个 state 喂进 bar-and-hinge（MERLIN2 / SWOMPS）
3. 算刚度，看方差

**判据**：
- 方差显著 → 命题成立，论文成立
- 方差为零 → 干净的 negative result，一样能写

不需要 GPU、不需要等任何人回邮件、不需要复现任何论文。

**前置卡点**：需要一个 FOLD → bar-and-hinge 的转换层。这东西目前不存在，是整条路上最关键的一块砖。
→ 应该第一件事做这个，而不是先复现 Learn2Fold。做完立刻知道整条路通不通。

---

## 待确认

- [ ] Learn2Fold world model 架构细节（GNN 层数、状态编码、损失函数）—— 要搬到 L2，架构比结果数字重要
- [ ] 纸的 κ（折痕扭转刚度）要自己做实验标定，查不到表

---

## 现存指标全表（可直接用作 related work 的论证）

**核心论点：所有现存指标都是「把产出物和目标比」。没有一个是「给同一个 CP 的 N 个合法态排序」。**
每个指标的定义里都必须有一个 target 才能计算 —— 这就是空白所在。

| 来源 | 指标 | 精确定义 | 比的是什么 |
| --- | --- | --- | --- |
| OrigamiBench | Query Efficiency (QE) | 对最终成品有贡献的折叠步数占比 | agent 走了多少弯路 |
| | Geometric Similarity | IoU(M_A,M_B)=\|M_A∩M_B\|/\|M_A∪M_B\| | 产出 vs 目标 |
| | Semantic Similarity | fine-tuned CLIP 嵌入余弦相似度 | 产出 vs 目标 |
| OrigamiSpace | 选择题/序列准确率 | 标准准确率 | 答案 vs 正确答案 |
| | 编译成功率 | CP 代码能否编译 | 二值 |
| | 拓扑/几何/约束/形状相似度 | 各 0–1，加权平均 | 产出 vs 目标 |
| GamiBench | Accuracy | 标准准确率 | 答案 vs 正确答案 |
| | Viewpoint Consistency (VC) | 换视角后重测的条件准确率 | 模型自身一致性 |
| | Impossible Fold Selection Rate (IFSR) | 把合法折痕误判为不可折的频率 | 模型偏差 |
| Learn2Fold | Precision/Recall/F1 | 动作 token 层面 | 预测序列 vs 专家序列 |
| | Category Success Rate | 完成目标的比例 | 二值 |
| | Edge-IoU | 受影响边集合的 IoU | 产出 vs 目标 |
| FoldingAgent | 拓扑/几何/约束满足 | 各自定义 | 重建 vs ground truth |
| | 人类偏好 | 84% | 主观 A vs B |
| COrigami | flat-foldability | 布尔 | 合不合法 |
| | VLM 审美分 | 与人一致率 0.811 | 主观 |
| Flat-Folder（非指标，是输出） | states / components / variables / 四类约束计数 / solve_sec | 见 instagram_data.csv | **规模，不是质量** |

注：Flat-Folder 输出的是「有多少个态、多难解」，不是「哪个态好」。印证它没有偏好函数。

### 四个维度的真实状态

| 维度 | 有指标吗 | 卡在哪 |
| --- | --- | --- |
| **力学性能** | ✅ 力学界有且成熟（刚度 K、多稳态能量景观、能量吸收，bar-and-hinge 可算） | **从没和 state 选择连接过 ← 这就是我的论文** |
| **步骤数** | ❌ | 最接近的 QE 量的是 *agent 浪费了多少查询*，不是 *state 本身内在需要多少步*。完美 agent 在需要 20 步的 state 上 QE=100%，步数仍是 20 |
| **人手易折性** | ⚠️ 有理论定义，且**判定 NP-hard** | 无可量化指标；AI 界靠限制数据集回避 |
| **机器可执行性** | ❌ | 折纸领域完全空白。最接近的是 LeHome 的关键点阈值二值判定，但那是评价*一次执行*不是评价 *state 有多难执行*，而且是布料不是纸 |

### 人手易折性这一维度的理论地基

> Arkin, Bender, Demaine, Demaine, Mitchell, Sethia & Skiena,
> **"When Can You Fold a Map?"** *Comput. Geom.* 29(1):23–46, 2004
> https://erikdemaine.org/papers/MapFolding/ · https://arxiv.org/abs/cs/0011026

- 研究的正是 **simple fold**：把一部分纸绕一条折痕转 ±180°，人手最自然的折法
- 核心问题：给定带 M/V 赋值的 CP，存不存在一个 simple fold 序列把它折平？
- 结论：**地图折叠及变体多项式可解，稍作推广即 NP-complete**

为什么重要：
1. 它把「人手能不能折」变成**有严格定义的计算问题**，不是模糊直觉
2. 判定在一般情况 NP-hard → **正是需要学 surrogate 的地方**
3. **Pureland origami 的定义本身就是「只允许 simple fold」** → FoldingAgent 是用*限定数据集*回避了这个维度，不是测量了它。它报告的 "simultaneous compound actions" 失败，就是这个回避的边界处漏出来的

→ 这个维度不是没人想过，而是**理论界定义了它、证明了它难，AI 界绕开了它**，中间没有任何可量化指标。
