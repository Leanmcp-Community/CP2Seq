# FoldOrigami

AI 折纸研究笔记。原始想法存放处。

- `papers.md` — 论文链接 + 阅读状态
- `notes/` — 每篇论文一个笔记文件

## 技术路线的原始思路

- Supervised learning —— 需要一套完整的数据样本去学习 Data
- AI 推断怎么折叠？ —— 2D 方向上的折痕规划，以及对 3D 空间的想象
- 需要一个 environment 能够让 AI 进行折痕步骤的仿真模拟，去一遍一遍尝试怎么折叠才是对的
- Reward function
- 下一个论文才是会关于怎么用机械臂去实现这些预设好的步骤

## 进入这个领域前要先想清楚的事

- 研究这个方向的目的以及意义
- 前人已经做了哪些工作、工作方式、验证的假设是什么、做的结论
- 然后再重新 frame 我的研究目的和目标
- 拆分内容，研究的每个模块都应该独立发布

最重要的问题：

- 如何用规范的流程 —— 易解决
- 用不完整的知识框架去解决：找 dataset、找训练方式、定义训练 rewards，甚至最简单的如何去训练、如何进行训练检测、如何 debug
- 以及如何找到最简单的方式去验证我的猜想 —— 回到之前的问题：我的猜想应该怎么设定

两个必须回答的问题：

- 研究折纸，到底是为了解决什么问题
- 研究让 AI 生成折纸痕迹以及折纸步骤，到底是为了解决什么问题

## 计算折纸的数学建模（待深入方向）

- 折纸的**核心数学定理**：芳贺定理、前川定理、川崎定理
- 用**图论与矩阵**描述折痕图的拓扑结构
- **微分几何**如何解决曲面折纸与非刚性折叠
- 现有**折纸设计软件**（如 Origamizer、TreeMaker）及其算法原理

## 现有折纸软件

| 软件名称 | 主要开发者/机构 | 核心定位与功能 | 主要算法/理论基础 |
| --- | --- | --- | --- |
| **TreeMaker** | Robert J. Lang (折纸大师) | **复杂具象折纸设计**。自动生成折痕图（CP），用于创作昆虫、脊椎动物等具有多肢体的复杂折纸。 | **圆盘打包算法**（Circle Packing）、树状图拓扑映射 |
| **Origami Simulator** | Amanda Ghassaei | **网页端实时交互仿真**。动态模拟折纸的连续折叠过程，支持导入自定义 CP 图并检测碰撞。 | **质点弹簧系统**（Mass-Spring System）、刚性折纸动力学 |
| **Origamizer** | 三谷纯 (Jun Mitani) / 馆知宏 | **三维网格展平设计**。将任意给定的 3D 多面体网格，自动转化为一张可以折叠出该形状的完整折痕图。 | **多面体可展化算法**（Tuck-folding）、几何优化 |
| **MERLIN / OrigamiKotobuki** | 普林斯顿大学等学术机构 | **工程折纸力学分析**。分析折纸结构的刚度、多稳态响应、能量吸收等力学特性。 | **非线性有限元法**（FEA）、位移控制算法 |

## 两条线（2026-09-14）

- `notes/plan/track1-surface-simulator.md` — **Surface simulator / CP→Seq**。组合+拓扑，验证器免费
- `notes/plan/track2-structural-simulator.md` — **Structural simulation**。连续力学，验证器昂贵
- `notes/tools/flat-folder-capabilities.md` — **Flat-Folder 到底能/不能回答什么**（核实自源码；它没有「步骤」）
- `notes/reading/geometry-topology-definitions.md` — **几何 ⊕ 拓扑的定义 + abstract 草稿**（写论文时查这页）

**两篇论文，已定案（2026-09-14）**：验证器成本差 10⁴ 倍。两条线各自独立设计，互不迁就。
节奏：**先做 Track 2（方差数字本周能出），先写 Track 1（不依赖任何人）**。

## 方向（2026-09-11 定）

**这次论文的重点：折痕图 → 结构性能。**

- ~~复现 Learn2Fold，解决语义 → 折痕图~~ → **作废**：它解的是另一个问题（语言 → 序列），
  而且数据集从未公开。只作架构引用，见 `BASELINE_REPRODUCTION.md`
- Flat-Folder 当 verifier（它只管几何合法性，不管力学）
- 先用纸做 paper dynamics，材料以后再换
- 机械臂这次不做

最终目标（远期）：prompt → 模型 + 机器人，按我给的参数折出能解决真实问题的东西（家具、建筑）。

### simulator 分层

| 层 | 算什么 | 工具 | 速度 |
| --- | --- | --- | --- |
| L0 组合 | 能不能折平、层序 | Flat-Folder | 毫秒～秒 |
| L1 运动学 | 折叠过程、刚性可折性 | Tachi 的软件、Origami Simulator | 毫秒～秒 |
| **L2 降阶力学** | **刚度、承载、多稳态** | **Sim-FAST-PY（Python！）**、MERLIN2、SWOMPS | 秒～分钟 |
| L3 有限元 | 真实材料、厚度、风载 | Abaqus / ANSYS | 分钟～小时 |

**simulator ≠ environment**：environment = simulator + 动作空间 + reward + reset + **够快**。
卡点是速度：RL 要 10⁶～10⁸ 次 step，L2 直接跑要 11 天～2 年，L3 不可能。
→ 所以必须用 learned surrogate 代理 + 真 simulator 当裁判。

### 要记住的硬约束

**flat-foldable ≠ 能承重。**
- flat-foldable 假设零厚度；真实材料一有厚度，折痕打架，几何全变（→ 厚板折纸）
- 承重要的是 **rigid-foldable**，和 flat-foldable 是两套约束，交集很小
- 现在 AI 那条线（OrigamiBench / Learn2Fold / Flat-Folder）100% 在 flat-foldable 世界
- 我的工程目标在 rigid-foldable + 厚板世界
- **中间缺一座桥 —— 这座桥本身可能就是最有价值的那篇论文**

### 论文的形状

```
CP (.fold) ──Flat-Folder──→ 枚举合法折叠态 {s₁...sₙ}      L0 已有，免费
                                  │                        这层说：哪些合法
           ──Export "state"→ 每个 state 导出为 FOLD          平面坐标 Vf + faceOrders
                                  │                        ⚠️ 这是「压平的纸+顺序表」，不是 3D
           ──三维化────────→ 按 faceOrders 赋予厚度 t 展开     Ku & Demaine 2016 已做（Thick Folding）
                                  │                        见 notes/thick-folding-ku-demaine.md
           ──转换层────────→ 转成 bar-and-hinge              面→杆，折痕→扭转弹簧（κ 要实验标定）
           ──Sim-FAST-PY──→ 刚度/承载/多稳态              L2 已有，**Python**
                                  │                        这层说：哪个好
           ──learned GNN────→ 直接从 CP-graph 预测力学性能   ★ Learn2Fold 架构的搬运
                                                           训练数据由上面三层自动生成
```

四个可独立发布的产出：
1. **把 Flat-Folder（枚举态）和 Thick Folding（加厚）接起来 → bar-and-hinge** —— 两半 Ku 都造了，没人连过。
   详见 `notes/reading/thick-folding-ku-demaine.md` 和 `notes/tools/flat-folder-export-and-3d.md`
2. 同一 CP 不同折叠态的力学性能差异有多大 —— 见 `notes/reading/2026-09-11-states-and-simulator.md` 的 MARK
3. learned surrogate —— Learn2Fold 架构搬到 L2
4. 接上 Learn2Fold 前端 → 完整的 prompt → CP → 结构性能 管线

**第一件事做 1，不是先复现 Learn2Fold。** 不依赖任何人回邮件、不需要 GPU、做完立刻知道整条路通不通。

## Phase 0 进展（2026-09-14）

- `notes/probes/probe-a-explosion.md` — **Probe A 完成**。主实验区 ≈100–500 faces；验证器免费边界 ≈500 faces
- `notes/probes/probe-b-oracle.md` — **Probe B 初查**。部分状态可行性判据**存在**（`solver.js` 的 `initial_assignment` 接受部分 `BA`）
- `notes/plan/experiment-spec-checklist.md` — 跑实验前要冻结的决定 + 每条状态（中文）
- `notes/plan/research-workflow.md` — Phase 0–5，**Phase 0 已结束**（中文）
- `EXPERIMENTS_SETUP.md` / `DATASET.md` / `BASELINE_REPRODUCTION.md` — 怎么跑 / 数据 / 基线（英文，给同事看）
- `workspace/probe-a/explosion.svg` — 爆炸曲线图
