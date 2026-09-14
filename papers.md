# Papers

状态: `todo` / `reading` / `read` / `to-reproduce`

| # | 链接 | 状态 | 笔记 |
| --- | --- | --- | --- |
| 1 | https://arxiv.org/html/2609.00377v1 | todo | |
| 2 | https://arxiv.org/html/2603.13856v1 | todo | |
| 3 | https://arxiv.org/html/2606.26299v1 | todo | (关注 bib.bib30 引用) |
| 4 | https://arxiv.org/html/2603.29585v1 · https://www.alphaxiv.org/pdf/2603.29585 | to-reproduce | Learn2Fold。语义→CP，架构要搬到 L2 |
| 5 | https://arxiv.org/abs/2511.18450 | todo | OrigamiSpace, NeurIPS'25。无 repo |
| 6 | https://arxiv.org/abs/2512.22207 | todo | GamiBench。**唯一完整可跑** repo+HF |


---

## 结构力学侧（新方向：折痕图 → 结构性能）

| # | 链接 | 状态 | 笔记 |
| --- | --- | --- | --- |
| T1 | https://erikdemaine.org/papers/MapFolding/ · https://arxiv.org/abs/cs/0011026 | **必读** | Arkin, Bender, Demaine, Demaine, Mitchell, Sethia & Skiena, *When Can You Fold a Map?* Comput. Geom. 29(1):23–46, 2004。**simple foldability** 的理论地基 —— 「人手易折性」这一维度唯一的严格定义。地图折叠多项式可解，稍推广即 NP-complete。Pureland origami 的定义就是「只允许 simple fold」 |
| M1 | https://arxiv.org/abs/1404.1243 | **必读第一篇** | Lechenault, Thiria & Adda-Bedia, PRL 112, 244301 (2014) *Mechanical Response of a Creased Sheet*。折痕扭转刚度 κ 与面板弯曲刚度 B，比值给出特征长度 ℓ~B/κ。**跨过 ℓ 行为定性改变 —— 这就是「不同尺寸下会怎样」的答案** |
| M2 | https://www.sciencedirect.com/science/article/pii/S0020768317302408 | todo | *Bar and hinge models for scalable analysis of origami* (IJSS 2017)。bar-and-hinge 综述，先读这篇 |
| M3 | https://asmedigitalcollection.asme.org/mechanismsrobotics/article/12/2/021110/1072475/ | todo | ASME JMR 2020，柔顺折痕（compliant crease）的处理 |
| M0 | https://royalsocietypublishing.org/doi/10.1098/rspa.2019.0366 · 免费: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6834023/ | **必读** | Zhu & Filipov, *An efficient numerical approach for simulating contact in origami assemblages*, Proc. R. Soc. A 475(2230):20190366, 2019。**自接触 = 层序影响力学的机制**。原文: self-contact "has significant implications for the foldability, kinematics and resulting mechanical properties" |
| M4 | https://pubmed.ncbi.nlm.nih.gov/33075954/ | todo | *Plasticity and aging of folded elastic sheets*。纸的折痕会随时间松弛 |

## 工具与代码

| 工具 | 层 | 链接 | 说明 |
| --- | --- | --- | --- |
| **Flat-Folder** | L0 组合 | https://github.com/origamimagiro/flat-folder · https://origamimagiro.github.io/flat-folder/ | JS, MIT。判定+枚举平折状态。`examples/instagram/` 366 个 .fold = OrigamiBench 的数据集 |
| **FOLD 格式** | — | https://github.com/edemaine/fold | 事实标准 JSON 格式 |
| Tachi 的软件 | L1 运动学 | https://origami.c.u-tokyo.ac.jp/~tachi/software/ | Rigid Origami Simulator, Freeform Origami |
| Origami Simulator | L1 | https://origamisimulator.org/ | Ghassaei, GPU 质点弹簧, 实时 |
| **Sim-FAST-PY** | **L2 力学** | https://github.com/zzhuyii/Sim-FAST-PY | **Python！** Yi Zhu（SWOMPS 作者）。CC-BY 4.0。含 `Assembly_ThickOrigami.py`、载荷控制求解器。在线 demo: https://deployablebridges.streamlit.app/ |
| MERLIN2 | L2 力学 | Liu & Paulino, MATLAB | bar-and-hinge 标准实现 |
| **SWOMPS** | **L2 力学** | https://drsl.engin.umich.edu/software/swomps-package/ · https://github.com/zzhuyii/OrigamiSimulator | Zhu & Filipov, 含多物理场 |
| rigid-origami | L1 RL | https://github.com/belalugaX/rigid-origami | 31★。**唯一公开的折纸 gym 环境**，但是 rigid 不是 flat。论文 arXiv:2211.13219 |
| GamiBench | benchmark | https://github.com/stvngo/GamiBench · https://huggingface.co/datasets/stvngo/GamiBench | MIT，完整可跑 |
| PurelandFold | 数据 | https://huggingface.co/datasets/mayaweiz/PurelandFold | CC-BY-4.0。27 序列/337 帧，`cp.fold` 含**层序 ground truth** |

## 该找的人（力学侧，比 Jason Ku 更对口）

- **舘知宏 Tomohiro Tachi**（东大）—— freeform origami 发明人
- **Evgueni Filipov**（UMich DRSL）—— SWOMPS 作者
- **Glaucio Paulino**（Princeton）—— MERLIN 作者
- **Sergio Pellegrino**（Caltech）—— 航天可展开结构
- **Larry Howell**（BYU）—— 柔顺机构、厚板折纸

---

## 理论地基：平折、层序、复杂度

| # | 论文 | 状态 | 为什么重要 |
| --- | --- | --- | --- |
| T0 | **Bern & Hayes, "The Complexity of Flat Origami"**, SODA 1996, 175–183 · https://dl.acm.org/doi/10.5555/313852.313918 | **必读** | **几何不决定层序**：即使给定合法 M/V 赋值，确定 overlap order 仍是 NP-hard。这是核心论断的引用 |
| T1 | Arkin, Bender, Demaine×2, Mitchell, Sethia, Skiena, **"When Can You Fold a Map?"** Comput. Geom. 29(1):23–46, 2004 · https://erikdemaine.org/papers/MapFolding/ | **必读** | simple foldability 的理论地基。地图折叠多项式，稍推广即 NP-complete |
| T2 | **Akitaya, Demaine, Ku, "Computing Flat-Folded States"**, OSME 2024 · https://erikdemaine.org/papers/FlatFolder_OSME2024/paper.pdf | **必读** | **Flat-Folder 本身的论文**。判定全局平折态 NP-hard |
| T3 | Demaine, Devadoss, Mitchell, O'Rourke, **"Continuous Foldability of Polygonal Paper"**, CCCG 2004 · https://erikdemaine.org/papers/PaperReachability_CCCG2004/paper.pdf | **必读** | **folded state vs folding motion** 的标准区分。任何良态折叠态都存在连续运动可达 → CP→Seq 不是存在性问题，是离散步骤结构问题 |
| T4 | Akitaya, Demaine, Ku, **"Simple Folding is Really Hard"**, J. Information Processing, 2017 | todo | |
| T5 | **"Infinite All-Layers Simple Foldability"**, Graphs and Combinatorics · https://arxiv.org/pdf/1901.08564 | todo | all-layers 模型（对应钣金折弯） |
| T6 | **"Complexity of Simple Folding of Mixed Orthogonal Crease Patterns"** · https://arxiv.org/pdf/2306.00702 | todo | |
| T7 | **"Flat Origami is Turing Complete"** · https://arxiv.org/pdf/2309.07932 | **读** | 撑起「折纸是研究推理的模式生物」 |
| T8 | Schneider, **"Flat-Foldability of Origami Crease Patterns"** · https://www.sccs.swarthmore.edu/users/05/jschnei3/origami.pdf | 读 | **isotopy 措辞的出处**；纽结类比在这里只是 open direction |
| T9 | **"An Algebraic Approach to Layer Ordering Constraints for Origami Flat-Foldability"**, Origami8 (2026) · https://link.springer.com/chapter/10.1007/978-981-96-6561-7_21 | todo | 最新的层序约束代数化 |
| T10 | **"Realization and Connectivity of the Graphs of Origami Flat Foldings"** · https://arxiv.org/pdf/1808.06013 | todo | 折叠态的图论刻画与连通性 |
| T11 | Akitaya et al., **"Generating Folding Sequences from Crease Patterns of Flat-Foldable Origami"**, ACM SRC 2013 · https://src.acm.org/binaries/content/assets/src/2013/hugoakitaya.pdf | **读** | **CP→Seq 问题 2013 年就被命名了** |

## 组合：数折叠态（stamp / map folding）

**至今没有闭式公式。** 一维就已经没有公式 → `states` 列的天文数字不是工具没优化，是问题本身难。

- OEIS **A000136**: 1, 2, 6, 16, 50, 144, 462, 1392, 4536, 14060, … · https://oeis.org/A000136 （另见 A001011, A001416）
- Lucas (1891) 归于 Émile Lemoine；Touchard (1950)
- Koehler, *Folding a Strip of Stamps*, J. Combin. Theory 5:135–152, 1968
- Lunnon (1971) 多维地图折叠
- https://en.wikipedia.org/wiki/Map_folding · https://mathworld.wolfram.com/MapFolding.html
- *Foldings and Meanders* · https://arxiv.org/pdf/1302.2025

## 统计物理：随机折纸的平折性

论证「state 多解性是普遍现象不是特例」的弹药；提供配分函数/相变/熵的语言。

- **A Spin model for global flat-foldability of random origami** · https://arxiv.org/pdf/2403.07306
- **On random locally flat-foldable origami** · https://arxiv.org/pdf/2502.04279

## Mental imagery / 空间推理（Track 1 的外部语境）

| 论文 | |
| --- | --- |
| **Spatial Reasoning in MLLMs: A Survey** · https://arxiv.org/pdf/2511.15722 | **先读这篇** |
| **Mind's Eye of LLMs: Visualization-of-Thought**, NeurIPS 2024 · https://arxiv.org/pdf/2404.03622 | 「心像」有名字了 |
| **Machine Mental Imagery: latent visual tokens** · https://arxiv.org/pdf/2506.17218 | |
| **Limits of Spatial Imagery Reasoning in Frontier LLM Models** · https://arxiv.org/html/2603.26779v2 | |
| **Reasmory: 3D Reconstruction as Explicit Memory for VLMs** · https://arxiv.org/pdf/2606.00963 | |
| **Spa3R** · https://arxiv.org/pdf/2602.21186 | 不用显式 3D 也能学 ← **反方** |
| **"I Know About Up!"** · https://arxiv.org/pdf/2407.14133 | 3D 重建有帮助 ← **正方** |

## ML × 力学超材料逆设计（Track 2 的竞争格局）

| 论文 | |
| --- | --- |
| **A Review of ML Applications in Mechanical Metamaterial Design** · https://pmc.ncbi.nlm.nih.gov/articles/PMC13362914/ | **先读综述** |
| RL for inverse structural design + laser cutting of **kirigami** · https://arxiv.org/pdf/2605.08098 | 最接近的对手 |
| Video Denoising Diffusion for nonlinear metamaterial inverse design · https://arxiv.org/pdf/2409.13908 | |
| Algebraic Language Models via Diffusion Transformers · https://arxiv.org/pdf/2507.15753 | |
| Generative metamaterials based on LLMs · https://arxiv.org/pdf/2601.17997 | |
| Neural Operator Transformer + Diffusion (SDF-based) · https://arxiv.org/pdf/2504.01195 | |
| OPERA · https://pmc.ncbi.nlm.nih.gov/articles/PMC13417098/ | |
