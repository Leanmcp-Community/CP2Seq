# Probe B 初查 · 部分状态可行性判据（读源码，2026-09-14）

源码：`~/Downloads/flat-folder-main/src/solver.js`（302 行）、`NOTATION.txt`

> **问题**：剪枝 ground truth 和回溯距离误差里的 `j`，都要求能判断
> **「一个部分折叠状态是否还有救」**。`flat-folder-capabilities.md` 当时的结论是
> **「剪枝这条腿悬空 —— Flat-Folder 只判完整赋值的终态」**。

## 更正：这条腿不悬空，Flat-Folder 已经支持部分赋值

`NOTATION.txt:111`：

```
BA0 | for each var:     initial assignment
```

`solver.js:194` 的签名与行为：

```js
initial_assignment: (BA, BF, BT, BI, FC, CF, CC, trans_count) => {
    ...
    for (const [i, a] of BA.entries()) {
        if (a != 0) { level.set(i, a); BP[i] = []; }   // 0 = 未赋值
    }
    ... // 约束传播
    return [type, F, E];   // 冲突：哪类约束 + 哪几个面
    ...
    return BA;             // 无冲突：返回传播后的 BA
}
```

**`BA` 里 `0` 就是「这个变量还没定」。** 函数接受任意部分赋值向量，
做约束传播，冲突则返回 `[type, F, E]`，否则返回传播后的 `BA`。

`EF_EA_Ff_BF_BI_2_BA0`（`solver.js:181`）只是**从 M/V 边赋值构造 BA0 的一种方式**，
不是唯一入口 —— `initial_assignment` 本身是通用的。

## 所以我拿到了两级判据，不是一个

| 判据 | 怎么拿 | 代价 | 完备性 |
| --- | --- | --- | --- |
| **传播判据** | `initial_assignment(部分 BA, ...)` | 便宜 | ❌ **不完备**。无冲突 ≠ 有解（只是单元传播，不是完整搜索） |
| **完全判据** | 用该部分 BA 调 `solve(...)` | 贵（= 穷尽搜索） | ✅ 完备 |

**两个都有用，而且用途不同：**

- **完全判据** = 剪枝 ground truth，= 回溯距离误差里的 `j`。
  → `experiment-spec-checklist.md` C 组成立，不用重写
- **传播判据** = **一个免费的、不含 LLM 的剪枝基线** ←
  正好是 C 组基线表下面留白的那个「第四行：不含 LLM 的启发式搜索」。
  **它现在白送到手了，而且比手写打分更有说服力**（是求解器自己的传播，不是我编的启发式）

> ⚠️ **这同时是个风险**：如果传播判据就能吃掉 LLM 的大部分剪枝优势，
> 我的核心主张会被削弱。**但这是现在就该知道的事，不是 rebuttal 阶段才知道。**

## 还剩的缺口（Probe B 未完成的部分）

真正没解决的不是「可行性判据」，而是**更窄的一件事**：

> **一个折叠序列前缀 → 固定了哪些 `B` 变量？**

`B` 变量是**面对面的层序关系**（`BF` = 重叠面对，`FO` = layer order）。
一次 simple fold 会确定哪些面对的相对层序 —— **这个映射要我自己建，它就是 step semantics 本身。**

→ 缺口从「建一个可行性判据」缩小到「建 step→B 的映射」。**范围小很多，但仍是 Probe C 的前置。**

## 下一步

- [ ] 核实 `solve()` 是否接受外部传入的、已部分赋值的 `BA`（读 `solver.js:241`）
- [ ] 核实传播判据的**假阳率**：传播说没冲突、但 `solve` 说无解，占多少？
      → 这个数字直接决定传播判据当基线有多强
- [ ] 设计 step → `B` 的映射（= step semantics，Probe C 前置）
