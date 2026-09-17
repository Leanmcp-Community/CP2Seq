# notes 索引

| 文件 | 职责 |
| --- | --- |
| `../EXPERIMENTS_SETUP.md` | 主实验：VLM 闭环、工具消融、验证、指标与步骤 |
| `../DATASET.md` | 数据来源与现有注释 |
| `plan/experiment-spec-checklist.md` | 跑实验前待冻结的决定 |
| `plan/research-workflow.md` | 执行阶段与纪律 |
| `plan/corpus-plan.md` | 小规模实验语料准备 |

## 已归档的探针

2026-09-17：ABC 不再作为主实验前提、评分标签或基线。原代码与工件保留用于追溯。

| 笔记 | 原问题 | 当前处理 |
| --- | --- | --- |
| [Probe A](probes/probe-a-explosion.md) | 终态枚举数量与成本 | 归档；不作为序列难度依据 |
| [Probe B](probes/probe-b-oracle.md) | 终态层序传播 | 归档；不当作动作验证器 |
| [Probe C](probes/probe-c-screen.md) | 受限动作空间搜索 | 归档；不提供物理不可折标签 |

`reading/` 保留论文阅读记录，`tools/` 保留工具调查。
旧笔记中的研究假设不覆盖主实验规范；历史详细结果可从 Git 历史恢复。
