# What breadth-first search over the legal-fold enumerator costs
# 合法折叠枚举器上的广度优先搜索，成本到底是多少

Measured on the release corpus (200 easy / 100 mid / 100 hard) against the enumerator merged
in PR #35. Every number below is measured or fitted from measurement.

在 release 语料（200 easy / 100 mid / 100 hard）上，针对 PR #35 合并的枚举器实测。下面每个数字都是实测或由实测拟合而来。

**One-line conclusion.** Search cost is the product of two exponentials, not one. PR #35
accounts for the number of nodes and not for the cost of each node, and each node is itself
exponential in depth. That does not overturn the enumerator — it relocates where the paper's
claim can stand.

**一句话结论。** 搜索成本是**两个指数的乘积**，不是一个。PR #35 只算了节点数，没算每个节点的成本，
而后者本身也是深度的指数函数。这不推翻枚举器的设计，但它改变了论文的主张该放在哪一层。

Reproduce / 复现：

```sh
bash workspace/measure_depth_wall.sh      # depth reached per time budget / 各时间预算下能搜到的深度
bash workspace/profile_enum_cost.sh       # cost of one list_legal_folds call / 单次枚举调用的成本
node workspace/check_prefilter.mjs easy-0003 mid-0001   # shortcut equivalence / 早退优化的等价性
node workspace/figures/make_depth_wall_figure.mjs \
  --data workspace/depth_wall/depth_wall.csv --enum workspace/enum_cost/enum_cost.json
```

---

## 1. Two exponentials, not one / 成本是两个指数

PR #35 reasons about the frontier growing as `b^d` with `b ≈ 3.5`, which assumes every node
costs about the same to expand. It does not.

```
t(d) = b^d  ×  c0·g^d  =  c0·(b·g)^d
       nodes    cost of expanding one node
```

`b` is the deduplicated branching factor, measured as `generated / expanded` over searches
that exhausted their budget. `g` is the per-fold growth in enumeration cost, fitted by least
squares on `log(ms)` against depth along each sample's reference sequence.

PR #35 假设前沿按 `b^d` 增长（`b ≈ 3.5`），这等于假设每个节点的展开成本差不多。实际不是。
`b` 是去重后的分支因子（由跑满预算的搜索以 `generated / expanded` 测得）；
`g` 是单次枚举成本随深度的增长率（沿参考序列逐层计时，对 `log(ms)` 做最小二乘拟合）。

| tier | b | g | **b·g** | mean reference depth / 平均参考深度 |
| --- | --- | --- | --- | --- |
| easy | 2.72 | 1.5–2.0 | **4.1–5.4** | 6.8 |
| mid | 3.15 | 1.6–1.7 | **5.0–5.3** | 12.0 |
| hard | 7.05 | 1.58 | **11.1** | 19.0 |

Fitted over the 1s, 4s, 15s, 60s and 240s budgets. Adding 240s moved `b` by less than 0.3 on
every tier (easy 2.71 → 2.72, mid 3.34 → 3.15, hard 7.33 → 7.05), so the fit has converged.

The published figure of 3.51 legal folds per state matches **mid** and only mid. Easy is
lower and hard is more than double it (hard-0001 alone is 12.8). The saved runs it was
averaged over are almost all easy.

在 1s / 4s / 15s / 60s / 240s 五档预算上拟合。加入 240s 后 `b` 在每层变化都小于 0.3，说明已收敛。
**他公布的「每状态 3.51 个合法折叠」只在 mid 层成立**：easy 更低，hard 是它的两倍多
（hard-0001 单独是 12.8）。那个平均值取自已保存的运行，而那些几乎全是 easy。

Throughput collapses in step / 吞吐量同步崩塌：easy 平均每秒展开 48.5 个节点，hard 只有 2.9 个。

---

## 2. Why one node is exponentially expensive / 为什么单个节点的成本是指数的

The enumerator evaluates exactly

```
evaluated = 4 × lines × stack_size
```

candidates per call. This is an identity, not a fit: it held to the digit at all 13 sampled
states. The 4 is two `move_positive` values times the two-per-layer selection count.

枚举器每次调用评估的候选数**恰好**等于 `4 × 不同折痕线数 × 层数`。这是恒等式不是拟合——
13 个采样状态全部精确相符。那个 4 = 2 个 `move_positive` × 每层 2 种选择。

The two factors behave completely differently / 两个因子的行为截然不同：

- **`lines`** is set by the crease pattern and barely grows with depth — hard-0001 goes from
  188 to 356 over nine folds. The double deduplication does its job: 5340 M/V edges collapse
  to 188 distinct lines, and hard-0043's 24448 edges collapse to 380.
  **CP size is not the problem, and his deduplication design is vindicated.**

  **`lines` 由折痕图决定，且几乎不随深度增长**（hard-0001 九折只从 188 涨到 356）。
  两轮去重很有效：5340 条 M/V 边塌成 188 条线，hard-0043 的 24448 条塌成 380 条。
  **折痕图大小不是瓶颈，他的去重设计是对的。**

- **`stack_size`** grows geometrically. This is the cost driver.

  **`stack_size` 按几何级数增长。这才是成本爆炸的来源。**

### What a "layer" is, and why the count explodes / 「层数」是什么，为什么会爆炸

A layer is one **facet** of the folded paper: a polygonal region of the sheet occupying one
position in the stack. It is not physical thickness. Each crease subdivides the sheet into
more polygons, so a heavily creased model has many small facets, and the stack lists all of
them bottom to top. `stack_size` is `paper.order.length`, and it agrees exactly with the
distinct-layer count in the corpus's own final folded form.

一个「层」是折好的纸的一个**面片**（facet）：纸面上的一块多边形区域，占据层叠中的一个位置。
它不是物理厚度。每条折痕都会把纸切成更多多边形，所以折痕密的模型有大量小面片，
层叠自下而上把它们全部列出。代码里就是 `paper.order.length`，
而且和语料里最终折叠态的层数完全一致。

**Folding a stack of N in half gives at most 2N.** Exactly 2N when the fold line cuts every
layer; less when some layers lie wholly on one side and merely move or stay. So the growth
ratio is always between 1 and 2 — geometric, bounded by `2^d`.

**把 N 层对折，最多得到 2N 层。** 折线切到每一层时正好是 2N；
有些层整个落在一侧、只是整体移动或不动时，就少于 2N。
所以增长比恒在 1 到 2 之间——是几何增长，上界 `2^d`。

Measured, replaying each sample's reference sequence / 实测，重放参考序列：

| depth | hard-0001 | ×prev | easy-0108 | ×prev | easy-0003 | ×prev |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 1 | — | 1 | — | 1 | — |
| 1 | 2 | 2.00 | 2 | 2.00 | 2 | 2.00 |
| 3 | 8 | 2.00 | 8 | 2.00 | 5 | 1.67 |
| 6 | 28 | 1.75 | 32 | 1.68 | 18 | 1.29 |
| 10 | 164 | 1.52 | **512** | 2.00 | **48** | 1.20 |
| 13 | 616 | 1.31 | | | | |
| 16 | 1888 | 2.00 | | | | |
| 19 | **3504** | 1.20 | | | | |

Every fold in all three reference sequences is an all-layers fold. easy-0108 hits the 2.00
ceiling repeatedly — a clean box pleat where every layer gets cut — and reaches 512 = 2⁹ in
ten folds. hard-0001 averages 1.537× and reaches 3504 in nineteen, which is 2^11.8 rather
than 2^19: as the paper subdivides, more facets end up wholly on one side of the line and
escape being cut.

这三条参考序列里**每一折都是全层折叠**。easy-0108 反复顶到 2.00 上限——
典型的箱形褶，每一层都被切到——十折就到 512 = 2⁹。
hard-0001 平均 1.537 倍，十九折到 3504，相当于 2^11.8 而不是 2^19：
纸被切得越碎，越多面片整个落在折线一侧，逃过了被切。

So the answer to "3504 层是不是太高了": it is high, and it is real, and it is why one
`list_legal_folds` call on hard-0001 at full depth evaluates `4 × 400 × 3504 ≈ 5.6 million`
candidate actions and takes about 47 minutes.

所以「3504 层会不会太高」——高，但是真的，而且这正是 hard-0001 在完整深度上
单次 `list_legal_folds` 要评估约 **560 万**个候选动作、耗时约 **47 分钟**的原因。

---

## 3. Time to reach each sample's reference depth / 到达参考深度需要多久

No extrapolation is needed for the layer count: the corpus states each sample's final folded
form, so `stack_size` at the reference depth is measured, not fitted. The last level costs
`4 · lines · final_layers · µs_per_candidate`, and the total is `b^d` times it.

层数不需要外推：语料里有每个样本的最终折叠态，所以参考深度处的层数是**实测量**。
最后一层的成本 = `4 · lines · 最终层数 · 单候选耗时`，总时间 = `b^d` 乘以它。

| sample | b | final layers / 最终层数 | one enumeration / 单次枚举 | BFS total / 总时间 |
| --- | --- | --- | --- | --- |
| easy-0003 | 2.72 | 48 | 0.2 s | 1.5 hours |
| easy-0108 | 2.72 | 512 | 36 s | 9.1 days |
| mid-0001 | 3.15 | 128 | 1.9 s | 6.5 days |
| mid-0030 | 3.15 | 512 | 59 s | 5.7 years |
| hard-0001 | 7.05 | 3504 | 47 minutes | 1.2 × 10¹² years |

**Saturation is settled: it happens, mildly.** For every sample profiled to full depth the
geometric fit reproduced the corpus's final layer count exactly (48, 512, 128, 512). Only
hard-0001 was truncated, at depth 10, and there the fit overshoots: extrapolating its 1.67×
to depth 19 predicts 16151 layers where the corpus has **3504**, a 4.6× overestimate. That
halves the projection (2.8 × 10¹² → 1.2 × 10¹² years) and changes nothing else.

**饱和问题已解决：会饱和，但很轻微。** 所有剖析到完整深度的样本，几何拟合都和语料的最终层数
精确吻合（48、512、128、512）。只有 hard-0001 被截断在第 10 层，那里高估了 4.6 倍——
外推给出 16151 层，语料实际是 **3504** 层。修正后总时间减半（2.8×10¹² → 1.2×10¹² 年），
其余结论不变。

hard-0001 has 188 lines against a hard-tier median of 59, so it sits near the tier's 90th
percentile; a typical hard sample is perhaps 3× cheaper per node, which again changes nothing.

hard-0001 有 188 条线，而 hard 层中位数只有 59，所以它在该层约 p90 位置；
典型 hard 样本每节点大概便宜 3 倍，同样不改变结论。

---

## 4. The tier label does not predict cost / tier 标签不能预测成本

Distinct CP lines per tier / 各层的不同折痕线数：

| tier | min | p25 | median | p75 | max |
| --- | --- | --- | --- | --- | --- |
| easy | 4 | 8 | 12 | 17 | 60 |
| mid | 15 | 23 | 28 | 38 | 60 |
| hard | 19 | 42 | 59 | 86 | 380 |

`easy-0108` has 60 lines and needs 9.1 days — more than `mid-0001`. Two of the 200 easy
samples are in that class.

The twelve easy samples the deterministic arm used average 12.3 lines against an easy-tier
median of 12, so **that 8/12 result is representative and not a cheap-end selection.** An
earlier suspicion to the contrary was checked and is wrong.

`easy-0108` 有 60 条线，要跑 9.1 天——**比 mid-0001 还贵**。200 个 easy 里有 2 个属于这一类。
确定性 arm 用的那 12 个 easy 样本平均 12.3 条线，而 easy 层中位数是 12，
**所以那个 8/12 的结果是有代表性的，不是挑了便宜的样本。** 我一度怀疑过，查了，是我错了。

---

## 5. The cheap-rejection shortcut / 便宜拒绝的早退优化

85–98% of candidates are rejected as `nothing-to-move` or `no-crease`, rising monotonically
with depth to 100%. Both mean the fold creases nothing, which is decidable from each layer's
projection onto the fold normal without splitting a polygon. Implemented in `legal_folds.mjs`
behind the `prefilter` option (default on) and verified by `check_prefilter.mjs`: **every
state returns a byte-identical enumeration with it on and off**, so the guarantee that a
listed action is accepted verbatim by `add_fold` is untouched.

85–98% 的候选被判为 `nothing-to-move` 或 `no-crease`，且比例随深度单调升到 100%。
两者都意味着这一折什么折痕都做不出来，而这**只需要每层在折线法向上的投影就能判定**，
不必切任何多边形。实现在 `legal_folds.mjs` 的 `prefilter` 选项里（默认开），
由 `check_prefilter.mjs` 验证：**开和关返回的枚举结果逐状态字节级一致**，
所以「列出的动作一定被 `add_fold` 原样接受」这条保证没有被破坏。

**But it buys only 1.1–1.4× overall.** An earlier estimate of "up to 11×, up to 50×" was
computed as `1 / (1 - cheap_share)`, which silently assumes every candidate costs the same.
They do not: candidates that miss the selection bail out early, while the survivors pay for
the tearing check and the per-crease CP comparison. Skipping 78% of candidates saved 19% of
wall clock, so the counts overstate the achievable speedup by roughly 4×.

**但实际只有 1.1–1.4 倍。** 之前「上界 11 倍 / 50 倍」的估算用的是 `1 / (1 − cheap%)`，
它默认每个候选花一样的时间。不成立——被跳过的候选本来就便宜（一发现没东西可动就退出），
留下的那些才要做撕裂检查和逐折痕 CP 比对。实测跳过 78% 的候选只省 19% 的墙钟时间，
所以按数量算高估了约 4 倍。

Where it does pay is the terminal states, which have no legal fold at all and are therefore
100% cheap: **16.1× on easy-0108 at depth 10, 6.6× on mid-0001 at depth 11.** Those are the
dead ends `--stuck-limit` exists for, so it is worth keeping for episode latency even though
it does not move the search wall. mid-0001 goes from 12 days to about 10, not to 15 hours.

真正有收益的是**死局状态**——完全没有合法折叠，因此 100% 便宜：
**easy-0108 第 10 层 16.1 倍，mid-0001 第 11 层 6.6 倍。**
那正是 `--stuck-limit` 要处理的状态，所以这个优化值得留着（能降低 episode 延迟），
但它不移动搜索的墙。mid-0001 是从 12 天到约 10 天，不是到 15 小时。

What is left is the surviving 22%: the `would-tear` adjacency test, which is pairwise over
moving and stationary faces, and the per-crease CP comparison.

剩下的 22% 才是大头：`would-tear` 的邻接检查（移动面 × 静止面两两配对）和逐折痕的 CP 比对。

---

## 5b. The action space does not match the corpus — and this may overturn §6

## 5b. 动作空间和语料不匹配——这可能推翻 §6

PR #35 widened the action space from whole-stack folds to "whole stack, or a contiguous
top/bottom run". Counting the corpus:

PR #35 把动作空间从「全层折叠」扩展到「全层，或栈一端的连续区间」。数一下语料：

| corpus / 语料 | samples | reference folds | of which partial / 其中部分折叠 |
| --- | --- | --- | --- |
| `release/all-layers` — **every experiment runs here** | 400 | 4180 | **0** |
| `release/some-verified-d3` | 50 | 150 | 51 |
| `release/some-verified-d4` | 50 | 200 | 67 |
| `release/some-generated-d5` | 50 | 250 | 96 |
| `release/some-generated-d6` | 50 | 300 | 118 |

The partial-fold extension is not gratuitous — the `some-*` corpora are about one third
partial folds and would be unsolvable without it. But **no experiment runs on them.** On
`all-layers` the saved fold format has no selection field at all, so a partial fold can never
appear in a reference solution, while it multiplies the candidate count by the layer count.

部分折叠不是白加的——`some-*` 语料约三分之一是部分折叠，没有它根本解不了。
**但没有任何实验跑在那些语料上。** 在 `all-layers` 上，保存的折叠格式里连 `selection` 字段都没有，
所以部分折叠**不可能出现在任何参考解里**，而它把候选数乘上了层数。

`enumerateLegalFolds` already takes `selection_filter`, and the harness never sets it.
Restricting to `all` on the all-layers corpus:

`enumerateLegalFolds` 本来就有 `selection_filter` 参数，harness 从来没用过。在 all-layers 语料上限制为 `all`：

| sample | depth | `any` candidates / ms | `all` candidates / ms | speedup |
| --- | --- | --- | --- | --- |
| easy-0108 | 9 | 116736 / 33211 ms | 456 / 1078 ms | **30.8×** |
| easy-0108 | 10 | 237568 / 967 ms | 464 / 19 ms | **50.9×** |
| hard-0001 | 9 | 153792 / 50991 ms | 1424 / 8238 ms | **6.2×** |

**The candidate count stops depending on the stack at all**: `4 · lines`, not
`4 · lines · layers`. easy-0108 goes 240 → 464 over ten folds instead of 240 → 237568. One
of the two per-node factors of N is gone; per-candidate cost still grows with the stack,
because each surviving all-layers fold still touches every face.

**候选数不再依赖层数**：变成 `4 · lines` 而不是 `4 · lines · 层数`。
easy-0108 十折从 240 涨到 464，而不是 240 涨到 237568。
每节点的两个 N 因子去掉了一个；单候选成本仍随层数增长，因为每次全层折叠还是要碰每一个面。

**The branching factor drops too**, which matters more. Over 8-second searches:
easy-0003 `b` 3.54 → 2.95 with throughput 47.8 → 103.5 expansions/s; mid-0001 `b`
3.63 → 2.94 with throughput 17.3 → 38.9.

**分支因子也降了**，这更要紧。8 秒搜索实测：
easy-0003 的 `b` 从 3.54 降到 2.95，吞吐量从 47.8 升到 103.5；
mid-0001 的 `b` 从 3.63 降到 2.94，吞吐量从 17.3 升到 38.9。

**Both exponentials shrink at once, so the effect compounds with depth.** A back-of-envelope
projection from those eight-second runs puts easy-0003's reference depth at about 8 minutes
instead of 1.8 hours, and mid-0001's at roughly an hour instead of days.

**两个指数同时变小，所以效果随深度复利。** 按那组 8 秒数据粗算，
easy-0003 到参考深度约需 8 分钟而非 1.8 小时，mid-0001 约需 1 小时而非数天。

> **This is not yet measured, and if it holds it overturns §6.2.** The claim that "mid is
> where the comparison has tension" rests on BFS needing days to years there. If restricting
> the search to the action space the corpus actually uses makes mid searchable in hours, then
> mid joins easy as a tier where search is not a fair foil, and the paper's claim has to move
> to hard — or to a corpus the `some-*` sets provide. Settle it before the draft leans on it:
>
> **这一点尚未实测，如果成立，它推翻 §6.2。**「mid 才是有张力的区间」这个主张，
> 依赖于 BFS 在那里需要几天到几年。如果把搜索限制到语料真正使用的动作空间之后 mid 几小时可解，
> 那 mid 就和 easy 一样不再是公平的对照，论文的主张必须移到 hard，或者移到 `some-*` 语料。
> **在草稿依赖这条结论之前先把它测掉：**
>
> ```sh
> SELECTION=all bash workspace/measure_depth_wall.sh
> ```
>
> It writes to `workspace/depth_wall_all/`, leaving the `any` data intact for comparison.
> 它写到 `workspace/depth_wall_all/`，不覆盖 `any` 那组数据。

Note also that restricting is **complete with respect to this benchmark**: every reference
solution is all-layers, so a restricted search still contains a path to every target. It can
only lose alternative routes, never the known one.

另外，这个限制对本基准是**完备的**：每个参考解都是全层折叠，
所以限制后的搜索仍然包含通往每个目标的路径。它只可能丢掉别的替代路线，不会丢掉已知那条。

---

## 6. Consequences for the paper / 对论文的影响

1. **Do not headline the easy tier.** Effective base 4.1–5.4 at depth 6.8 means BFS solves it
   in seconds to minutes. It does not measure origami reasoning.
   **不要把 easy 当主结果。** 有效底数 4.1–5.4、深度 6.8，BFS 几秒到几分钟就解完，测不出模型推理。

2. **mid is where the comparison has tension — pending §5b.** BFS needs 6.5 days to 5.7 years
   there against a model's 80-turn budget, so every mid sample a model solves is something
   search cannot do at any reasonable cost. **But this is measured with the partial-fold
   action space, which no reference solution on this corpus uses.** §5b projects that
   restricting to whole-stack folds may bring mid down to hours. Do not build the draft on
   this point until that run is done.
   **mid 才是有张力的区间——但取决于 §5b。** BFS 在那里要 6.5 天到 5.7 年，而模型只有 80 回合预算，
   所以模型每解出一个 mid 样本都是搜索做不到的。**但这是在带部分折叠的动作空间下测的，
   而本语料没有任何参考解使用部分折叠。** §5b 推算限制回全层后 mid 可能降到几小时。
   **这条结论测掉之前，草稿不要依赖它。**

   Independently of the outcome: the model arms and the search arm should be given the **same**
   action space, and right now the choice of that space is not being made deliberately.
   不论结果如何：模型 arm 和搜索 arm 应当使用**同一个**动作空间，
   而目前这个空间是怎么选的，并没有被有意识地决定过。

3. **The 120s default in `run_deterministic*.sh` is wasted on mid and hard.** Measured, 120s
   reaches depth 8.6 on easy (needs 6.8), 6.9 on mid (needs 12) and 2.9 on hard (needs 19).
   **`run_deterministic*.sh` 的 120 秒默认值在 mid/hard 上是浪费机器。**
   实测 120 秒在 easy 到深度 8.6（需要 6.8），mid 到 6.9（需要 12），hard 到 2.9（需要 19）。

4. **Tool latency is an uncontrolled variable on hard.** One `list_legal_folds` call at depth
   10 of hard-0001 takes 140 seconds and at full depth about 47 minutes, while `--timeout`
   governs only the model call, not the simulator.
   **hard 上工具延迟是失控变量。** hard-0001 第 10 层一次 `list_legal_folds` 要 140 秒，
   完整深度约 47 分钟，而 `--timeout` 只管模型调用、不管模拟器。

---

## 7. Figure caption / 图注

> **Figure N. Breadth-first search time against fold depth.** Log-scale vertical axis. Curves
> are t(d) = c0·(b·g)^d, where b is the deduplicated branching factor (measured as
> generated/expanded during search) and g is the per-fold growth in the cost of one legal-fold
> enumeration (least squares on per-depth timings along each sample's reference sequence).
> Both are exponential: the node count grows as b^d while the cost of expanding one node grows
> as g^d, because a fold of all layers at most doubles the sheet's facets and one enumeration
> evaluates exactly 4·(distinct crease lines)·(facets) candidate actions. Diamonds mark each
> tier's mean reference depth; circles are observed solves. Fitted from 5 time budgets × 12
> samples of search and 6 samples × full depth of enumeration timing.

> **图 N：广度优先搜索的时间随折叠深度的增长。** 纵轴对数刻度。曲线为 t(d) = c0·(b·g)^d，
> 其中 b 为去重后的分支因子（搜索过程中以 generated/expanded 测得），
> g 为单次合法折叠枚举成本随深度的增长率（沿各样本参考序列的逐层计时做最小二乘拟合）。
> 两者均为指数：节点数按 b^d 增长，每个节点的展开代价按 g^d 增长——
> 因为一次全层折叠最多使纸的面片数翻倍，而一次枚举恰好评估
> 4·(不同折痕线数)·(面片数) 个候选动作。菱形标记各层的平均参考深度，圆圈为实测解出点。
> 参数拟合自 5 档时间预算 × 12 个样本的搜索，以及 6 个样本 × 完整深度的枚举计时。

**The committed `depth_wall.svg` and `.tex` are the b^d lower bound**, not the curve above:
the enumeration timings exist as `enum_cost.txt` but the machine-readable `enum_cost.json`
was lost when that run was interrupted, and the generator refuses to guess. Re-run
`profile_enum_cost.sh` and regenerate with `--enum`. Both artifacts state their own cost
model in the SVG `desc` and the LaTeX header, so the two cannot be confused.

**目前提交的 `depth_wall.svg` 和 `.tex` 用的是 `b^d` 下界模型**，不是上面那条曲线：
逐层计时以 `enum_cost.txt` 形式存在，但机器可读的 `enum_cost.json` 在那次被中断的运行里丢了，
生成器拒绝猜。重跑 `profile_enum_cost.sh` 后用 `--enum` 重新生成即可。
两个图都在 SVG 的 `desc` 和 LaTeX 注释头里写明了自己用的是哪个模型，不会混淆。

---

## 8. Not yet measured / 尚未测量

- `hard-0043` (24448 edges, 380 lines) — the extreme point, never profiled to completion.
  Corroboration for §2, not a load-bearing gap.
  `hard-0043`（24448 条边、380 条线）——极端点，从未剖析完成。是 §2 的佐证，不是承重缺口。
- The 960s search budget. `b` moved by less than 0.3 when 240s was added.
  960 秒那档搜索预算。加入 240s 时 `b` 变化小于 0.3，跑它换不来会变的数字。

Resolved since first writing / 初稿后已解决：layer-count saturation (§3), the 240s budget,
and what a "layer" actually counts (§2).
