# notes 索引

## 文件分工（每件事只有一个出处）

| 文件 | 只负责 | 语言 |
| --- | --- | --- |
| `../BASELINE_REPRODUCTION.md` | 跟谁比：已发表方法 + 自建搜索基线 | 英文 |
| `../DATASET.md` | 数据从哪来 | 英文 |
| `../EXPERIMENTS_SETUP.md` | 怎么跑：循环、工具、条件、指标、协议 | 英文 |
| `plan/experiment-spec-checklist.md` | 要冻结哪些决定 + 每条状态 | 中文 |
| `plan/research-workflow.md` | 阶段、纪律、现在走到哪 | 中文 |

**根目录是给同事看的（英文），`notes/` 是我的工作笔记（中文）。同一段不写两遍。**

| 目录 | 放什么 |
| --- | --- |
| **`plan/`** | 两条 track 的方案、研究流程、语料方案、实验 spec 清单 |
| **`probes/`** | Phase 0 探针的**结果**（结论 + 数字 + caveat，不写过程） |
| **`reading/`** | 读论文的笔记 |
| **`tools/`** | 工具能力核实（Flat-Folder、Sim-FAST-PY） |

## Phase 0 · 已结束

| 探针 | 状态 | 一句话结论 |
| --- | --- | --- |
| [A 爆炸曲线](probes/probe-a-explosion.md) | ✅ | 爆炸在长尾不在中位数；语料必须分层采样；只用 instagram |
| [B 可行性判据](probes/probe-b-oracle.md) | ✅ | 传播判据免费且完美，但因为终态问题不难 → **难度在序列层** |
| [C 纯搜索基线](probes/probe-c-screen.md) | ✅ | **89.3% 的真实折纸已证明不可 simple fold**；确认可折仅 2 个（0.5%）。纯搜索在真实语料上不工作 |

**已定**：action space = simple folding（Pureland）· 序列数据 = PurelandFold + 自己合成
· 难度轴 = step count + non-local dependency

**已定**：预折痕**不纳入**动作空间 —— 它会拆掉 Probe C 的判据本身；改为当作实测的范围边界来报

**待定**：37 个 TIMEOUT 要不要加大预算再判一次（搜索撑不过 ~8 折，而真实序列 5–21 步）
