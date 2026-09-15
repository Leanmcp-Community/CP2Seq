# Probe A 图

结果见 `notes/probes/probe-a-explosion.md`。

| 文件 | 什么 |
| --- | --- |
| `explosion.svg` | **主图**。单面板双纵轴，中位数线 + p50–p90 带，刻度用人话（「1 秒」「1 后 20 个零」）。awk 生成，无依赖 |
| `explosion-v1-scatter.svg` | v1 双面板散点图。刻度是 log10，需要解释才能读懂 —— 保留作对照 |
| `states.png` / `time.png` | `plot.py` 的 matplotlib 输出，分成两张，论文里单独调尺寸方便 |
| `plot.py` | 生成上面两张 PNG。`pip install matplotlib && python workspace/probe-a/plot.py` |
