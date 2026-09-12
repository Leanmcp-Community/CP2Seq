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
