# notes 索引

| 目录 | 放什么 |
| --- | --- |
| **`plan/`** | 两条 track 的方案、研究流程、语料方案、实验 spec 清单 |
| **`probes/`** | Phase 0 探针的**结果**（结论 + 数字 + caveat，不写过程） |
| **`reading/`** | 读论文的笔记 |
| **`tools/`** | 工具能力核实（Flat-Folder、Sim-FAST-PY） |

## Phase 0 现状

| 探针 | 状态 | 一句话结论 |
| --- | --- | --- |
| [A 爆炸曲线](probes/probe-a-explosion.md) | ✅ | 爆炸在长尾不在中位数；语料必须分层采样；只用 instagram |
| [B 可行性判据](probes/probe-b-oracle.md) | ✅ | 传播判据免费且完美，但因为终态问题不难 → **难度在序列层** |
| [C 纯搜索基线](probes/probe-c-screen.md) | 🟡 阶段一完成 | **46.7% 的真实折纸已证明不可 simple fold**（判据 34.2% + 预折痕 12.6%）；阶段二代码已写、待跑 |

**已定**：action space = simple folding（Pureland）· 序列数据 = PurelandFold + 自己合成
· 难度轴 = step count + non-local dependency

**已定**：预折痕**不纳入**动作空间 —— 它会拆掉 Probe C 的判据本身；改为当作实测的范围边界来报

**待跑**：阶段二完整搜索（195 个 CP）—— `bash workspace/probe-c/run-stage2.sh`
