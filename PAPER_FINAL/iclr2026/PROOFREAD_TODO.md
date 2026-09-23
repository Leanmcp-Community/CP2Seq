# ICLR 2026 投稿前待办清单

来源：对 `sections/` 下 §1–§14 逐节中译校对（2026-09-23），加上评审讨论中提出的内容缺口。
与 `IMPORTANT_TODO.md`（内容层面的 12 条）互补，重叠处已标注。

状态标记：`[ ]` 待办 · `[?]` 需先确认事实 · `[!]` 会挡住投稿

---

## A. 投稿阻塞项

- [!] **A1. `[TO FILL ...]` 占位符会编进 PDF。** `sections/07-experimental-setup.tex`
  「Models」段，待填：实际运行的模型、版本、reasoning-effort 与 image-history 设置。
  这是正文里唯一一处直接可见的空白。
- [!] **A2. §6.4 证据缺失，与 §1 定位段冲突。** 定位段声称 "its judge can be trusted"，
  但 `06-scoring.tex` 的比较器验证现在只剩规范性陈述——原先 600/600 拒绝损坏状态的负控结果，
  因为跑的是另一份 identity-aware 比较器而被撤下。
  **二选一：在实际评分器上重跑负控，或把定位段的说法降级。** 全文最大的内在张力。
- [!] **A3. 删掉 §11「计划中的图及其状态」整节。** `11-figures.tex` 是作者看板，
  交给审稿人等于声明图没画完。
- [!] **A4. 五处图占位。** `[TO DRAW]` / `[DRAFT IMAGE]` / `\draftimage{8}`，
  含 §9 的主结果图 `fig:main`。
- [!] **A5. CP 编辑距离：方法在正文，结果不在。** `06-scoring.tex` §6.3 定义极细却不报数，
  而 `workspace/RESULTS/cp-distance/summary.json` 已存在。补进 §9，或整段移入附录。
  〔= IMPORTANT_TODO 12〕
- [ ] **A6. 清理 `EDITING NOTE (retained)` 等作者注释。** 遍布各节；不进 PDF，
  但会随 supplementary 源码一起提交。
- [ ] **A7. §12 是只含注释的空文件但仍被 `\input`。** 确认不会渲染出空白节标题。

## B. 数字与口径

- [ ] **B1. 模型尝试总数对不上。** §9/§10 称「461 次记录了 reasoning 设置 + 25 次缺失」；
  §9.1 表中非 BFS、非出错行相加为 **462**。差 1。
- [ ] **B2. 三个总数并存且未说明关系。** 1,211（解出率快照）/ 1,422（CP 距离扫描）/ 447（Luna）。
  **建议全部数字由同一个脚本产出**，避免逐个被审稿人加总核对。
- [ ] **B3. BFS 展开状态中位数倒置未解释。** 中等 1051.5 > 困难 532。
  真实原因多半是困难实例更早超时（725 次中 358 次超时）。补一句：
  *the hard median is lower because hard attempts time out earlier, not because they are easier.*
- [ ] **B4. `gpt-6-astra` 的 1/1 行。** 论文已警告不可读作 100%，但它同时是表中唯一一个
  在基础工具条件下解出样本的非 Luna 模型。表注应直接说明为何只跑一次。

## C. 交叉引用与结构

- [ ] **C1. §7.4 末句指向一个不存在的论证。** 它说 BFS 基线回答了 §5 的
  "the simulator did all the work" 质疑，但 §5 全文没有这个质疑——原 DRAFT 的
  "Objections, answered here rather than in rebuttal" 一节在拆分成 `sections/` 时没被搬过来。
- [ ] **C2. §13 指向 §10 的「一个数字」不存在。** `examples/instagram/` 的 366
  现在只在附录 A 的引用注记里。
- [?] **C3. §5 末句把 Flat-Folder 的适用范围指向 `app:action-errors`（错误码表）**，
  实际描述在 `appendix-folding-model.tex:95`。需核编译后 PDF 的跳转位置。
- [ ] **C4. `\label{sec:ablations}` 名不副实。** §8 明确说这不是受控对照，label 却叫 ablations，
  PDF 里「见第 X 节（消融）」会暗示一个不存在的消融实验。建议改 `sec:assistance`。
  —— 与 D5 一并处理。
- [ ] **C5.「未确立匹配对照」在 §7.3、§8、§9、§10 各说一遍。** 诚实，但四遍会形成
  「实验设计未完成」的整体印象。§10 完整说一次，其余引用它。
- [ ] **C6. §6.4 与 §10 第 4 段是同一件事，说了两遍。**

## D. 内容缺口

- [x] **D1.〔已加入 `01-introduction.tex:11`〕引言缺 2–3 句「为什么是折纸」。** 补在第 1 段末（"…decisions over successive folds." 之后）。
  已备好的措辞见文末「备用段落 1」。
- [x] **D2.〔已加入 `02-related-work.tex:29`，并删去原先那句笼统的复杂度陈述〕§2.2 缺 simple fold 的定义与困难性归属。** 要点：
  - `arkin-map` = **When Can You Fold a Map?**（Arkin 等, *Comput. Geom.* 29(1):23–46, 2004），
    simple fold 与 one-layer / some-layers / all-layers 的划分出自此。
  - **地图折叠本身（矩形纸 + 正交折痕）是线性时间可判定的**；NP 完全出现在推广之后
    （正交纸上的正交折痕、方形纸上轴平行与 45° 折痕、无山谷指派）——且只是**弱** NP 完全。
  - `akitaya-hard` = **Simple Folding is Really Hard**（Akitaya, Demaine, Ku,
    *J. Information Processing* 25:580–589, 2017）加强为**强** NP 完全，
    恰好覆盖 some-layers 与 all-layers 模型、方形纸、45° 整数倍折痕。
  - 我们的语料正落在该区间（`generate-layers.mjs` 折线限定 0/45/90/135°，正方形纸）。
  - `akitaya-hard` **在 .bib 第 79 行但正文零引用**。
  - 必须加防线：NP 难说的是一般判定问题，我们的实例按构造可达，难度是实测而非推断的。
  已备好的措辞见文末「备用段落 2」。
- [x] **D3.〔已加入 `10-limitations.tex:28`，开头已改为明指并挂上 §9.3 的 48.1%〕回退与剪枝作为未来工作，全文未提。** `pruning` 一次都没出现；
  `backtracking` 只作为工具名出现在 §8 表格里。48.1% 死于状态重访正指向这两项能力。
  已备好的措辞见文末「备用段落 3」。
- [ ] **D4. 加 Future Work 节。** 目前 14 个正文节直接进附录，**没有 Conclusion 也没有 Future Work**。
  D3 的内容需要一个落脚处。
- [ ] **D5. 加消融实验。** §8 现在只报告了 basic tools 与 legal-folds 两种条件，
  no-vision 与 verifier-only 标着「计划中」。要么补跑，要么把「四种辅助条件」的说法
  （§1 贡献 2）改成与实际相符。与 C4 一并处理。〔= IMPORTANT_TODO 6〕
- [ ] **D6. 参考文献改成会议要求的格式。** 核对 ICLR 2026 模板的 `\bibliographystyle`
  与 natbib 用法；同时清理附录 A 里 `⚠️ Citation missing` 一类条目
  （`origamibench`、`corigami`）。
- [ ] **D7. §5 未点明「拒绝目标图样之外的折痕」本身是一种辅助。** 它泄露目标信息、
  大幅剪枝动作空间，却不在 §8 的辅助条件表里。建议补一句：
  *This is a form of assistance: it prevents a class of unrecoverable moves, and the rates
  reported here are therefore rates under that constraint.*
- [ ] **D8. 容差三个数分散在两节**（2e-6 / 1e-7 / 1e-9）。集中到附录一张表，正文引表。
- [ ] **D9. `coupling` 定义了但没用上。** §4.2 出现一次，§9 只出现在一条「待运行」注释里。
  要么补上 solve rate vs coupling 的结果，要么弱化其在 §4 的地位。

## E. 事实更正（提出过但与代码不符，勿写入论文）

- [x] **E1.「模拟器用了 flat-fold 的四种约束」——不成立。**
  taco-taco / taco-tortilla / tortilla-tortilla / transitivity 是 **Flat-Folder**
  判定平折状态存在性的方式（`origamimagiro/flat-folder`，论文 Akitaya, Demaine & Ku,
  *Computing Flat-Folded States*, OSME 2024）。`workspace/tools/flatfolder-check.mjs`
  的注释写明：Flat-Folder **没有「折叠步」这个概念，所以不能充当我们的模拟器**。
  我们的引擎判定的是单步动作合法性（连通性/撕裂、层选择、方向、与目标 CP 相容），
  并在构造中直接维护层序，不做全局平折性求解。
- [x] **E2.「BFS 基线用了那四种约束」——同样不成立。**
  全仓库 `taco` 只出现在 `workspace/tools/flatfolder-check.mjs`、`corpus/inspector.html`
  和第三方数据集 blob 中；`workspace/search_baseline.mjs` 里没有。
  BFS 用的是与模型相同的合法动作枚举器。
- 正文现有的三处 Flat-Folder 表述（`05-environment.tex:32`、
  `appendix-folding-model.tex:95`、`appendix-a-reference-notes.tex:50`）**措辞都是对的**，
  界限划得很清楚，不需要改。
- [ ] **E3. 四类约束的引用 key 不一致。** 附录正文挂 `\citet{akitaya-flatfolder}`（论文），
  refnotes 挂 `\citet{flatfolder}`（软件）。建议统一为 `\citep{akitaya-flatfolder,flatfolder}`。

## E'. 新增（来自 `origami-surface-sim` 核查）

- [ ] **E4. §5 应点明自穿透在本动作空间中不可表示。** `workspace/tools/surface-sim.mjs` 文件头：
  部分层折叠只能移动取自顶部或底部的一段连续层，这类移动无法把纸推过它留下的层，
  因此自穿透是构造上排除的，而非检测出来的。环境永远不会返回该类拒绝。
- [?] **E5. `origami-surface-sim` 要不要作为制品一起发布？** §13 现在没列它。
  该仓库的 `learn2fold/cp-checker.js` 实现的是 **Kawasaki / Maekawa / big-little-big
  三个局部必要条件**（不是 Flat-Folder 的四类约束，全仓库 `taco` 零命中），
  且文件头写明「Necessary conditions only. Never emits a positive global-foldability label.」,
  输出只会是 `unknown` 或 `ruled_out_...`，**只能证伪不能证实**。
  若要写进论文，必须连同这一限定一起写。
- [x] **E6.〔已压缩，`02-related-work.tex:45`〕§2.2 新段与其后一段首句重复。** 新段已说明 one-layer / some-layers / all-layers
  的划分，后一段「Our action models build on the simple-fold framework of \citet{arkin-map},
  which distinguishes one-layer, some-layers, and all-layers folds. CP2Seq uses the latter two
  variants.」可压缩为一句「CP2Seq uses the some-layers and all-layers variants.」

## F. 术语统一

- [ ] **F1.** `stratum` / `group` 混用（表头写成 "Stratum or group"）。
- [ ] **F2.** `reference depth` 与 `fold depth` 并存，是否同一个量需确认。
- [ ] **F3.** `turnover` 与 `reflection` 在 §6 与摘要中所指是否同一操作需确认。
- [ ] **F4.** `action model` 与 §3.2 的 action space 是否同义；若是，统一用一个词。

## G. 高价值但未做的实验

- [ ] **G1. Flat-Folder 独立检查从未跑过。** 仓库里没有 `flatfolder-check.json`。
  这是全项目**唯一一个不与生成引擎共享代码**的检查，也是唯一能回答
  「我们的纸张模型本身对不对」的检查。跑通后可把 §10 第 4 段
  从「只检验自洽性」升级成真正的独立验证；跑出分歧则是必须写进论文的发现。
  审稿价值高于上面大半条目。

  ```bash
  node workspace/tools/flatfolder-check.mjs workspace/corpus/out/release --ff ~/Downloads/flat-folder-main --out workspace/corpus/out/release/flatfolder-check.json
  ```

  （Flat-Folder 是 GPL，未 vendored，需先 clone `github.com/origamimagiro/flat-folder`。）

---

## 备用段落

### 备用段落 1 — 引言，补在第 1 段末（D1）

> Origami is an unusually economical instrument for this. A single sheet and a small action space
> generate geometric dependencies of arbitrary depth at no annotation cost, so difficulty is
> dialled by fold depth rather than by collecting harder images, and the exact simulator makes
> every intermediate state checkable rather than merely plausible. That combination — cheap depth
> and exact step-level checking — is what a benchmark needs if it is to support not only
> measurement but the iteration that improves spatial and geometric ability: an automatic, dense
> signal over a long horizon, which visual question answering over static scenes does not provide.

克制之处：没有声称折纸是空间推理的代表任务（无证据），也没有声称该信号已训练出更好的模型（本文无训练）。

### 备用段落 2 — §2.2 开头，替换现有那句笼统的复杂度陈述（D2）

> A \emph{simple fold} is the operation introduced by \citet{arkin-map} for map folding: the sheet
> is folded along one line at a time, by $\pm 180^\circ$, and the models are distinguished by how
> much of the stack that line carries — a single layer, a contiguous run from the top or bottom
> (some-layers), or the entire stack (all-layers). Simple foldability is not uniformly hard.
> Deciding it for an orthogonal crease pattern on a rectangular sheet, which is map folding proper,
> is linear-time; hardness appears once the sheet shape or the crease directions are generalized,
> and \citet{arkin-map} proves weak NP-completeness for an orthogonal pattern on an orthogonal
> sheet, for assigned axis-parallel and $45^\circ$ creases on a square sheet, and for unassigned
> patterns. \citet{akitaya-hard} strengthens these to strong NP-completeness, in the some-layers
> and all-layers models, for square paper with creases at multiples of $45^\circ$. CP2Seq generates
> in exactly that regime: a square sheet, fold lines at multiples of $45^\circ$, and those two
> action models. Deciding whether such a crease pattern is simply foldable at all is therefore
> strongly NP-complete, while producing an instance costs one forward pass of the engine. The
> hardness is a statement about the general decision problem and not about our instances, which are
> reachable by construction; the difficulty of the released samples is measured, not inferred
> (Section~\ref{sec:results}).

### 备用段落 3 — Future Work（D3 / D4）

> These are capabilities the benchmark is built to exercise but does not yet train: making a model
> decide when to abandon a partial sequence and which candidate folds to discard unexamined. We
> report the gap and leave its closure — by search-aware prompting, by tool design, or by training
> against the verifier — to future work.
