# Track 2 · Structural Simulation

2026-09-14。我的命名保留：**structural simulation**。

> **已决定（2026-09-14）：Track 1 和 Track 2 是两篇独立论文。** 定案，不再讨论合并。
> **推论：Track 2 不需要等 Track 1。** 它有自己的问题、自己的会议、自己的对手。
> 两者唯一的连接是 Learn2Fold 那个架构（慢验证器 → 学快代理 → 代理上搜索），
> 那是**第三篇**的素材，不是把这两篇缝起来的理由。

---

## 我的原始想法

> paper fold is simple limited physical constraints. Since origami shape has its complex
> kinetics and math inside, can we train AI to let them be able to, based on real problems,
> **design origami-inspired products, robot arms, architectures, furnitures** etc. using
> different rigid or specific materials? On top of it, we need to build a more well-rounded
> simulator that can correctly sim **different materials to test weight, gravity, wind** etc.

**这里才是真正的 3D**：
1. **刚性折纸的部分折叠** —— 二面角在 0 到 π 之间连续变化，真的三维运动学。平折只是退化终点
2. **厚度和材料**

> **「2D → 3D」这个卖点属于 Track 2 和刚性折纸，不属于 Track 1。**

---

## 现在的具体命题

> **在 flat-foldability 的世界里，一个折痕图的所有合法折叠态是等价的；
> 引入结构性能之后，它们不再等价，而且这个排序是可计算的。**

管线见 `README.md`。工具与物理量见 `sim-fast-py-physics.md`。
三维化见 `thick-folding-ku-demaine.md`。

## 机制已经找到：面板自接触

> **Zhu, Y. & Filipov, E. T., "An efficient numerical approach for simulating contact in
> origami assemblages"**, *Proc. R. Soc. A* 475(2230):20190366, 2019
> https://royalsocietypublishing.org/doi/10.1098/rspa.2019.0366
> 免费: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6834023/

> *"self-contact ... has **significant implications for the foldability, kinematics and
> resulting mechanical properties** of the final origami system."*

**层序 → 哪些面贴到哪些面 → 力学。** 而且 Zhu 本人已发文证明自接触对力学性能有显著影响。

### ⚠️ 更正：不是「方差接近零」，情况比这麻烦

之前写「没有接触模型，state 之间方差接近零」—— 不准确。核实自 Flat-Folder `src/NOTATION.txt`：
`Vf`（folded position）由 CP + M/V 赋值**算一次**；一个 state 是求解器选了一组不同的 `GI`，
产出不同的 `FO`。**N 个态共享同一份 `Vf`，只有层序不同。** 所以：

| | 结果 |
| --- | --- |
| **不加厚** | N 个态的 bar-and-hinge 模型**逐字节相同** → 方差**恰好**为 0，不是「接近 0」 |
| **加厚，不加接触** | 层序决定每个面的 z → 几何真的不同 → 刚度真的不同。**但密堆栈里最主要的传力路径（层压着层）不存在**，受载时层与层互穿 |
| **加厚 + 接触** | 层序 → 哪些面贴哪些面 → 传力 → 刚度。**机制在这里** |

**第二行是真正的陷阱。** 它给出非零的数字，看起来像结果。但本课题的产出物是**排序**，
而接触对不同层序的贡献不同 —— 缺接触时排序可能不是偏一点，是**次序翻转**。
**非零方差会让人误以为管线通了。**

### 工具现状：管线在这一段是断的

核实自源码（2026-09-14）：

- **SWOMPS（MATLAB）有真接触** —— `00_SourceCode/@OrigamiSolver/Contact_P2TDistance.m`（点—三角形距离）、
  `Contact_AssembleForceStiffness.m`、`Contact_DerivativeZone0/1/2.m`、`Mesh_NumberingForContact.m`
- **Sim-FAST-PY 没有。** 全仓库 `contact` 只命中 `Elements_Vec_RotSprings_4N_Directional.py:6` 一处注释。
  `Elements_Vec_RotSprings_4N.py:59` 的 `theta1 = 0.1π` / `theta2 = 1.9π` 刚化项是
  **单条折痕的角度门限**（防折痕过闭），**不是面—面接触**（防面 A 穿过面 F）。两件完全不同的事

→ README 管线图里「转换层 → bar-and-hinge → Sim-FAST-PY」这一段，按现在的工具**是断的**。
两条路：① 需要接触的试件走 SWOMPS（MATLAB），管线分叉；
② 把上面那 5–6 个 `Contact_*` 文件移植进 Sim-FAST-PY（Zhu 在 README 里写做 Python 版的动机
就是 "better integration with other AI methods"，PR 大概率会被接受）。

### Zhu 本人的判断（2026-09-14 邮件）

> `For some shapes, we may need to include contact. For some, perhaps we can get away with it.`

**写接触求解器的人说：接触重不重要是形状相关的，而且他没有先验判据。**

→ 这正是「方差为零 → 立论要重做」那个风险。**处理办法是把它变成产出**：
命题从「不同 state 力学性能不同」改成 —— **对哪些折痕图，层序真的改变力学排序？改变多少？**
方差小的那些图案就是结果的一部分，不是失败的实验。

---

## ⚠️ 这条线的竞争格局：ML 做力学超材料逆设计已经很拥挤

2026 年一大批：

| 论文 | |
| --- | --- |
| **A Review of ML Applications in Mechanical Metamaterial Design** · https://pmc.ncbi.nlm.nih.gov/articles/PMC13362914/ | **先读这篇综述** |
| RL for inverse structural design and rapid laser cutting of **kirigami** prototypes · https://arxiv.org/pdf/2605.08098 | 最接近的对手 |
| Nonlinear Inverse Design via **Video Denoising Diffusion** · https://arxiv.org/pdf/2409.13908 | |
| Algebraic Language Models for Inverse Design via **Diffusion Transformers** · https://arxiv.org/pdf/2507.15753 | |
| **Generative metamaterials based on LLMs** · https://arxiv.org/pdf/2601.17997 | |
| ML-enabled inverse design of bimaterial thermoelastic lattice metamaterials · https://arxiv.org/pdf/2602.20173 | |
| Neural Operator Transformer + Diffusion for SDF-based metamaterial design · https://arxiv.org/pdf/2504.01195 | |
| OPERA: operator learning + physics embedding + normalizing-flow inverse · https://pmc.ncbi.nlm.nih.gov/articles/PMC13417098/ | |

**但「折纸 + AI + 真实材料力学」这一格明显稀薄。** 这是我的优势。
Yi Zhu 的研究方向写着 "Machine Learning with Application in Structural Design"
—— **他有工具没有 AI，我有 AI 没有工具。**

---

## 两条线的关系：**不要写成一篇论文**

| | Track 1 surface | Track 2 structural |
| --- | --- | --- |
| 状态 | 平面图 + 面全序 | 节点 XYZ + 材料 |
| 数学 | **组合 / 拓扑** | **连续 / 力学** |
| 验证器 | 免费、精确、毫秒级 | 昂贵、近似、秒到分钟 |
| 数据 | 可无限合成 | 每个样本都要算 |
| 能宣称 | 序贯规划、拓扑推理 | 2D→3D、真实物理 |
| 会议 | NeurIPS / ICLR / SoCG | ASME JMR / IJSS / Extreme Mechanics |
| 对手 | Learn2Fold, OrigamiBench | ML-metamaterial 那一大片 |

**验证器成本相差 10⁴ 倍，这一条就决定了不可能是同一篇论文。**
Track 1 可以百万次采样，Track 2 每个样本都要付钱。

**唯一把它们连起来的是 Learn2Fold 那个架构**：慢验证器生成数据 → 学快代理 → 在代理上搜索。
**Track 1 是这个架构已被验证的例子，Track 2 是它没被验证的例子。**
这是两篇论文之间的真实逻辑关系，也是先写 Track 1 的理由。


