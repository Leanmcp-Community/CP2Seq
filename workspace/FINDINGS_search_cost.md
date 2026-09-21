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

| tier | b | g | **b·g** | reference depth | predicted time |
| --- | --- | --- | --- | --- | --- |
| easy | 2.72 | 1.44 | **3.92** | 6.8 | 46 seconds |
| mid | 3.15 | 1.47 | **4.63** | 12.0 | 17 days |
| hard | 7.05 | 1.76 | **12.39** | 19.0 | 5.9 × 10¹² years |

`b` and `g` are fitted from the **same** samples. They were not at first: `b` comes from the
search runs and `g` from the enumeration profile, and the two scripts have different default
sample lists — the profile includes `easy-0108`, a 60-line outlier absent from the search set,
which pulled the easy tier's `g` from 1.44 up to 1.80 and its predicted time from 46 s to
6 min. The figure exposed it: the observed easy solves sat two orders of magnitude below
their own curve. The generator now intersects the two sample sets and says on stderr what it
dropped.

`b` 和 `g` 现在拟合自**同一批样本**。最初不是：`b` 来自搜索运行，`g` 来自枚举剖析，
而两个脚本的默认样本列表不同——剖析里有 `easy-0108`（60 条线的离群点，搜索那批里没有），
把 easy 的 `g` 从 1.44 拉到 1.80，预测时间从 46 秒拉到 6 分钟。
**是图自己暴露的**：实测解出点比自己的曲线低了两个数量级。
生成器现在会取两个样本集的交集，并在 stderr 说明丢掉了什么。

Terminal states are excluded from the `g` fit. A state with no legal fold is short-circuited
entirely by the cheap-rejection shortcut, so its timing collapses — easy-0108 drops from
28670 ms at depth 9 to 987 ms at depth 10. Those are leaves: search expands one and gets
nothing back, so they are not what "the cost of expanding a node at depth d" means. Left in,
each sample contributes one large downward outlier at its own maximum depth.

终局态被排除在 `g` 的拟合之外。没有任何合法折叠的状态会被早退优化完全短路，耗时断崖下跌——
easy-0108 从第 9 层的 28670ms 掉到第 10 层的 987ms。那是叶子节点：搜索展开它什么也得不到，
不符合「深度 d 处展开一个节点的成本」这个定义。留着的话，每个样本都会在自己的最大深度贡献一个向下的大离群点。

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

**`hard-0043` settles it, by being the counterexample to its own CP size.** It has 24448 M/V
edges against hard-0001's 5340 — 4.6× the crease pattern, 1.8× the distinct lines — and at
the same depth 11 it costs **less than half as much**, because its stack is 128 where
hard-0001's is 328:

**`hard-0043` 把这件事钉死了——它用自己的 CP 大小反证了 CP 大小无关。** 它有 24448 条 M/V 边，
是 hard-0001 的 4.6 倍（不同线数 1.8 倍），但在同样的深度 11 上**成本不到一半**，
因为它的层数是 128 而 hard-0001 是 328：

| sample | MV edges | lines | stack | 4·lines·stack | evaluated | ms |
| --- | --- | --- | --- | --- | --- | --- |
| hard-0001 | 5340 | 368 | 328 | 482816 | 482816 ✓ | 467687 |
| hard-0043 | **24448** | 668 | **128** | 342016 | 342016 ✓ | **163845** |

A crease pattern 4.6× larger, costing 0.35× as much. The identity holds exactly on both.

折痕图大 4.6 倍，成本却只有 0.35 倍。恒等式在两者上都精确成立。

### Per-candidate cost grows too / 单候选成本也在涨

The identity governs the candidate **count**. The cost of each candidate is not constant
either — on hard-0001 it goes 144 µs at depth 6 to 969 µs at depth 11, because an all-layers
fold has to split every face in a deeper stack. So per-node cost grows faster than the count
alone, roughly as `stack^1.75` rather than `stack`. The fitted `g` in §1 absorbs both; the
identity is what explains where the larger of the two factors comes from.

恒等式管的是候选**数量**。每个候选的成本也不是常数——hard-0001 从深度 6 的 144 微秒涨到
深度 11 的 969 微秒，因为层数越深，一次全层折叠要切的面越多。所以每节点成本比候选数涨得更快，
大约是 `层数^1.75` 而不是 `层数`。§1 里拟合出的 `g` 把两者都吸收了；
恒等式的作用是解释这两个因子里较大的那个从何而来。

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

So the answer to "3504 层是不是太高了": it is high, it is real, and it is why one
`list_legal_folds` call on hard-0001 at its full depth would evaluate
`4 × 380 × 3504 ≈ 5.3 million` candidate actions. At the 969 µs per candidate measured at
depth 11, scaled for the per-candidate growth above, that is on the order of **8 hours for a
single call**. Measured directly: 467 seconds at depth 11, the deepest state profiled inside
the 300 s budget.

所以「3504 层会不会太高」——高，但是真的，而且这正是 hard-0001 在完整深度上
单次 `list_legal_folds` 要评估约 **530 万**个候选动作的原因。按深度 11 实测的 969 微秒/候选、
再计入上面说的单候选成本增长，**单次调用约 8 小时**量级。
直接实测到的是：深度 11 一次 **467 秒**，那是 300 秒预算内剖析到的最深状态。

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
| hard-0001 | 7.05 | 3504 | ~8 hours (extrapolated) | ≥ 1.2 × 10¹² years |

**Saturation is settled: it happens, mildly.** For every sample profiled to full depth the
geometric fit reproduced the corpus's final layer count exactly (48, 512, 128, 512). Only
hard-0001 was truncated, at depth 11, and there the fit overshoots: extrapolating its 1.67×
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

### Measured. It overturns §6.2. / 已实测，§6.2 被推翻

Both arms, budgets 4s and 15s. The `any` arm's 4s and 15s runs were collected on an idle
machine; the `all` arm shared the machine with an enumeration profile, so any bias runs
**against** `all` and the real gap is at least this large.

两臂对比，4 秒和 15 秒预算。`any` 那两档是在机器空闲时采的，`all` 那两档与一次枚举剖析共享机器，
所以偏差方向是**不利于 `all`** 的——真实差距只会比下表更大。

| sample | ref depth | `any` b / to ref | `all` b / to ref | ratio |
| --- | --- | --- | --- | --- |
| easy-0002 | 7 | 2.19 / 3.6 s | **solved, depth 7** | — |
| easy-0003 | 10 | 3.44 / 1.2 h | 2.85 / **6.0 min** | 11.8× |
| mid-0001 | 11 | 3.66 / 17.5 h | 2.74 / **30.6 min** | 34.4× |
| mid-0002 | 12 | 2.34 / 12.4 min | 2.15 / 3.7 min | 3.4× |
| mid-0003 | 13 | 4.47 / 100.7 d | 3.24 / **1.2 d** | 87.2× |
| hard-0002 | 19 | 2.37 / 26.8 d | 2.02 / **1.0 d** | 26.4× |
| hard-0001 | 19 | 12.62 / 2.1 × 10¹³ y | 10.68 / 8.9 × 10¹¹ y | 24.1× |

The strongest line is not a projection: **`easy-0002` times out under `any` at depth 5 and is
solved outright under `all`**, same budget, same machine. `b` falls on every single sample,
and `all` reaches a greater depth in the same time on four of them.

最硬的一条不是推算：**`easy-0002` 在 `any` 下超时（停在深度 5），在 `all` 下直接解出**，
同预算同机器。`b` 在每一个样本上都下降，而且同样时间内 `all` 在四个样本上搜得更深。

**Consequences / 后果：**

- **mid is not a tier where search is a fair foil.** Restricted BFS reaches mid-0001's
  reference depth in about half an hour and mid-0003's in about a day. §6.2 as originally
  written is wrong.
  **mid 不是一个「搜索够不着」的层。** 限制后的 BFS 约半小时到 mid-0001 的参考深度，
  约一天到 mid-0003 的。§6.2 原来的写法是错的。
- **"hard" is not a tier either.** hard-0002 comes down to about a day while hard-0001 stays
  at 10¹¹ years. The 24× spread within one tier is larger than the gap between tiers. What
  predicts cost is the sample's own `b` and line count, not its label.
  **「hard」也不是一个整体。** hard-0002 降到约一天，hard-0001 仍是 10¹¹ 年。
  **同一层内部 24 倍的差距比层与层之间还大。** 决定成本的是样本自己的 `b` 和线数，不是它的标签。
- The honest framing is per-sample, against measured `b`, not per-tier.
  诚实的表述方式是**按样本**、对着实测的 `b` 来讲，而不是按 tier。

For a clean same-machine rerun of both arms with more budgets / 想在安静机器上重跑两臂：

```sh
bash workspace/compare_action_space.sh
```

It refuses to start while anything else that measures time is running.
它在有其它计时任务运行时会拒绝启动。

### Completeness is not fairness — read the ratios narrowly

### 完备 ≠ 公平——上表的比值只能窄着读

Restricting is **complete** with respect to this corpus: every reference solution is
whole-stack, so a restricted search still contains a path to every target. It is **not fair**.
Telling the search "you only need whole-stack folds" is a fact about the solution that the
model is not told; the model gets `any` and has to find its way inside the wider space. So
the numbers above are not "search reaches mid", they are "**search reaches mid when handed a
structural hint the model does not have**".

限制对本语料是**完备的**：每个参考解都是全层折叠，所以限制后的搜索仍然包含通往每个目标的路径。
但它**不公平**。告诉搜索「你只需要全层折叠」是一条关于答案的信息，而模型没有被告知这一点——
模型拿到的是 `any`，得自己在更宽的空间里摸索。所以上表不是「搜索够得着 mid」，
而是**「搜索在拿到模型没有的结构性提示之后够得着 mid」**。

That corrects this section's own first draft, which treated the restricted run as overturning
§6.2. It does not, on its own. The defensible statement is a pair of conditionals:

这一点修正了本节初稿的说法——它当时把限制后的运行当成了对 §6.2 的推翻。**单凭它并不能推翻。**
站得住的表述是一对条件句：

| both arms get / 两臂都用 | conclusion / 结论 |
| --- | --- |
| `any` | mid is out of search's reach, §6.2 **stands** — but the action space is far wider than the corpus needs / mid 搜索够不着，§6.2 **成立**，但动作空间远宽于语料所需 |
| `all` | mid is within reach, §6.2 fails — but the task is now easier for the model too, and it is a different benchmark / mid 够得着，§6.2 不成立，但模型那边也同时变简单了，这是另一个基准 |

The one configuration that cannot be defended is the arms disagreeing. What the measurement
establishes on its own is narrower and still worth having: **on this corpus the wider action
space costs 3–87× in search time and raises `b` on every sample.**

唯一无法辩护的配置是两臂不一致。这组测量本身确立的结论更窄，但仍然成立：
**在本语料上，更宽的动作空间使搜索时间增加 3–87 倍，并且在每个样本上都抬高了 `b`。**

### The missing experiment: this corpus cannot evaluate `any` at all

### 缺失的实验：本语料根本无法评估 `any`

A corpus whose reference solutions never need partial folds can only ever measure what
partial folds **cost**, never what they **buy**. The outcome is decided by the corpus, not by
the parameter. `any` exists for the `some-*` sets, where about a third of reference folds are
partial and restricting to `all` should make them outright unsolvable — and **no experiment
has ever run there.**

一个参考解从不需要部分折叠的语料，只能测出部分折叠的**成本**，永远测不出它的**收益**。
结论是被语料决定的，不是被参数决定的。`any` 是为 `some-*` 那组存在的——
那里约三分之一的参考折叠是部分折叠，限制成 `all` 应当直接导致无解——**而从来没有实验跑在那里。**

|  | `all-layers` corpus | `some-*` corpora |
| --- | --- | --- |
| search with `any` | measured: expensive / 已测：贵 | **not run** / **没跑** |
| search with `all` | measured: fast, but hinted / 已测：快，但有提示 | expected: unsolvable / 预期：无解 |

### Measured on some-verified-d3: `any` is necessary / 已实测：`any` 是必需的

All 50 samples, 30 s each, both arms (`bash workspace/run_some_layers.sh`):

50 个样本全跑，每个 30 秒，两臂对比：

```
any solved 50 of 50
all solved 43 of 50           ← 7 samples need partial folds
reference uses a partial fold in 37 of 50
```

**Both halves of the obvious argument are wrong, and the truth is in between.**

**「显然需要」和「显然不需要」都不对，真相在中间。**

- It is *not* the case that a partial-fold instance obviously requires partial folds. The
  goal test is `terminalMatch` — the same folded **form**, not the same sequence — so an
  all-layers route to the same shape may exist. It usually does: of the 37 samples whose
  reference uses a partial fold, **30 are solved by whole-stack folds alone**. `layers-0001`
  is a worked example: its reference is `all / bottom:1 / all`, and a three-step all-layers
  sequence reaches the identical 5-layer target, verified by replaying from a clean session.

  **「部分折实例显然需要部分折」不成立。** 判定标准是 `terminalMatch`——同一个折叠**形态**，
  而不是同一串步骤——所以可能存在只用全层折到达同一形态的路线。而且通常存在：
  参考解用了部分折的 37 个样本里，**30 个能被纯全层折解出**。`layers-0001` 是个实例：
  参考解是 `all / bottom:1 / all`，而一条三步全层折序列到达了完全相同的 5 层目标，
  从干净会话重放验证过。

- But 7 of 50 genuinely cannot be solved without them, and all 7 have a reference that uses
  one. **On this corpus the wide action space is necessary, not merely expensive.**

  但 50 个里有 7 个确实没它就解不出来，而且这 7 个的参考解全都用了部分折。
  **在这个语料上，宽动作空间是必需的，不只是贵。**

The seven cannot be picked out by the shape of their reference sequence: `all / bottom:1 /
all` appears in both groups. Only search distinguishes them.

这 7 个无法从参考序列的形状认出来——`all / bottom:1 / all` 在两组里都出现。只有搜索能分辨。

**So the conclusion is "right tool, wrong corpus".** `any` earns its cost where reference
solutions need partial folds and is pure overhead where none do. The defect is that the
harness applies one setting to both, and that setting is never chosen deliberately.

**所以结论是「工具是对的，用错了语料」。** `any` 在参考解需要部分折的地方值回成本，
在一条都不需要的地方是纯开销。缺陷在于 harness 对两者用同一个设定，而这个设定从未被有意识地选择过。

| corpus | reference folds that are partial | verdict |
| --- | --- | --- |
| `release/all-layers` (every experiment) | 0 of 4180 | `any` costs 3–87× and buys nothing |
| `some-verified-d3` | 51 of 150 | `any` needed for 7 of 50 samples |

### The necessary fraction rises with depth / 必需比例随深度上升

`some-generated-d6`, same protocol:

```
any solved 49 of 50
all solved 32 of 50           <- 17 samples need partial folds
```

| | d3 | d6 |
| --- | --- | --- |
| reference uses a partial fold | 37/50 (74%) | 48/50 (96%) |
| **genuinely requires one** | **7/50 (14%)** | **17/50 (34%)** |
| routed around by whole-stack folds | 30 of 37 (81%) | 31 of 48 (65%) |

The necessary fraction grows 2.4x from three folds to six, which is what one would expect:
the deeper the model, the fewer whole-stack detours exist. But even at depth 6, **65% of the
references that use a partial fold can be routed around it.** "The reference uses it" and
"nothing else works" are not the same thing at any depth.

从三折到六折，必需比例涨了 2.4 倍，这符合预期：折得越深，全层折的绕路越少。
但即使在深度 6，**用了部分折的参考解里仍有 65% 能被绕过**。
「参考解用了它」和「非它不可」在任何深度上都不是一回事。

(One d6 sample is unsolved by both arms within 30 s.)
（有 1 个 d6 样本在 30 秒内两臂都没解出。）

### A separate problem for the corpus itself / 语料本身的另一个问题

If 30 of 37 "partial fold" instances are solvable without a partial fold, then the corpus is
not testing partial-fold reasoning on those 30 either: a model could ignore the partial-fold
action entirely and still score. That is a note for whoever generated the corpus, and it is
independent of what the harness should enable.

如果 37 个「部分折」实例里有 30 个不用部分折也能解，那语料在那 30 个上**也没有在测试部分折推理**——
模型可以完全忽略这个动作照样拿分。这一条是给生成语料的人的，和 harness 该开什么是两回事。

---

## 6. Consequences for the paper / 对论文的影响

1. **Do not headline the easy tier.** Effective base 4.1–5.4 at depth 6.8 means BFS solves it
   in seconds to minutes. It does not measure origami reasoning.
   **不要把 easy 当主结果。** 有效底数 4.1–5.4、深度 6.8，BFS 几秒到几分钟就解完，测不出模型推理。

2. **Do not frame the result by tier at all.** This does not depend on §5b and survives
   either action space. Under `any`, hard-0002 needs 26.8 days while hard-0001 needs
   2.1 × 10¹³ years; under `all`, 1.0 day against 8.9 × 10¹¹ years. Either way the spread
   **inside** the hard tier is wider than the gap between tiers. The labels track reference
   depth; cost is set by each sample's own branching factor and line count.
   **不要按 tier 来表述结果。** 这一条不依赖 §5b，在两种动作空间下都成立。
   在 `any` 下 hard-0002 要 26.8 天而 hard-0001 要 2.1×10¹³ 年；
   在 `all` 下是 1.0 天对 8.9×10¹¹ 年。**无论哪种配置，hard 层内部的差距都比层间的差距大。**
   tier 标签反映的是参考深度，成本由样本自己的分支因子和线数决定。

   Whether **mid** is a tier search can reach is a separate question and is **not settled** —
   it depends on which action space both arms are given. See §5b.
   **mid 是不是搜索够得着的层是另一个问题，目前未定论**——取决于两臂使用哪个动作空间。见 §5b。

   Report against measured `b` per sample. The samples where search is genuinely out of
   reach exist — hard-0001 is one — but they have to be identified by measurement, not by
   which directory they sit in.
   **按样本、对着实测的 `b` 报告。** 搜索真正够不着的样本是存在的（hard-0001 就是），
   但它们必须由测量来识别，而不是由它们放在哪个目录里来识别。

3. **Give the model arm and the search arm the same action space.** Right now that choice is
   not being made deliberately: the enumerator offers partial folds because the `some-*`
   corpora need them, and every experiment inherits that on a corpus where no reference
   solution uses one.
   **模型 arm 和搜索 arm 必须用同一个动作空间。** 目前这个选择不是有意识做出的：
   枚举器提供部分折叠是因为 `some-*` 语料需要，而所有实验都在一个没有任何参考解使用它的语料上
   继承了这个设定。

4. **The 120s default in `run_deterministic*.sh` is wasted on mid and hard.** Measured, 120s
   reaches depth 8.6 on easy (needs 6.8), 6.9 on mid (needs 12) and 2.9 on hard (needs 19).
   **`run_deterministic*.sh` 的 120 秒默认值在 mid/hard 上是浪费机器。**
   实测 120 秒在 easy 到深度 8.6（需要 6.8），mid 到 6.9（需要 12），hard 到 2.9（需要 19）。

5. **Tool latency is an uncontrolled variable on hard.** One `list_legal_folds` call at depth
   11 of hard-0001 takes 467 seconds and at full depth some 8 hours, while `--timeout`
   governs only the model call, not the simulator.
   **hard 上工具延迟是失控变量。** hard-0001 第 11 层一次 `list_legal_folds` 要 467 秒，
   完整深度约 8 小时，而 `--timeout` 只管模型调用、不管模拟器。

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

The committed `depth_wall.svg` and `.tex` now use the measured `(b·g)^d` model for all three
tiers. Both artifacts state their cost model, source file and fitted parameters in the SVG
`desc` and the LaTeX header. The generator **refuses** to draw one figure from two models —
if some tier has enumeration timings and another does not, it exits rather than putting a
measured curve and a constant-throughput curve on the same axis, where the gap would read as
a tier difference. `--allow-mixed` overrides it.

目前提交的 `depth_wall.svg` 和 `.tex` 三层全部使用实测的 `(b·g)^d` 模型。
两个文件都在 SVG 的 `desc` 和 LaTeX 注释头里写明了模型、数据来源和拟合参数。
生成器会**拒绝**用两种模型画同一张图——如果某一层有枚举计时而另一层没有，它直接退出，
而不是把实测曲线和恒定吞吐曲线放在同一坐标轴上（那样两者的差距会被误读成层间差异）。
`--allow-mixed` 可以强制覆盖。

**One caveat on the hard curve.** hard-0001 was profiled only to depth 11 of 19 (300 s
budget), so its `g` is extrapolated eight levels. The figure's 5.9 × 10¹² years is therefore
about 5× above §3's 1.2 × 10¹², which uses the corpus's own final layer count and needs no
extrapolation. **Quote §3's number in the text and treat the curve as the shape.**

**hard 曲线有一个注意点。** hard-0001 只剖析到第 11 层（19 层中，300 秒预算用尽），
所以它的 `g` 向外推了八层。图上的 5.9×10¹² 年因此比 §3 的 1.2×10¹² 高约 5 倍——
后者用语料自带的最终层数，完全不需要外推。**正文引用 §3 的数字，把曲线当作形状看。**

---

## 8. Not yet measured / 尚未测量

- The 960s search budget. `b` moved by less than 0.3 when 240s was added.
  960 秒那档搜索预算。加入 240s 时 `b` 变化小于 0.3，跑它换不来会变的数字。

Resolved since first writing / 初稿后已解决：whether the wide action space is necessary and whether
that rises with depth (§5b — yes, for 14% of samples at depth 3 and 34% at depth 6), the
corpus metadata's integrity (200/200 samples: meta.partial_used matches seq.json exactly, and
no sequence begins with a partial fold, which is impossible from one layer — the 0-partial
samples are the documented p_partial = 0.5 generator, not an error),
`hard-0043` (§2 — it is cheaper than the 4.6x smaller
hard-0001 at the same depth, which settles that CP size is not the driver), layer-count
saturation (§3), the 240s budget,
and what a "layer" actually counts (§2).
