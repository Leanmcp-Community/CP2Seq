# CP2Seq rebuttal：待办（Claude 维护）

最后更新：2026-11-07 15:10 PST。完成一项就打勾并写上结果；新任务加在对应分组里。
背景见 `workspace/HANDOFF_rebuttal_2026-11-07.zh.md` 和 `workspace/RESULTS/REBUTTAL_RUNS_2026-11-07.md`。

**规则：** 模型实验和 python 由用户在终端里跑；Claude 只写脚本、跑 Node 离线分析。
跑实验时插电、不合盖。

## 今天（2026-11-07）

### 语料 v2（层数受控）
- [x] all-layers v2：`out/release-v2/all-layers-cap16`，400 题（easy 200 / mid 100 / hard 100），
      coupling cap 16，max-attempts 400。层数中位数 easy 24 / mid 60 / hard 76，最大 120
      （v1 hard 中位数 404，最大 16384）。
- [x] some-layers 7 步：`out/release-v2/some-generated-d7`，50 题。
- [ ] some-layers 8 步：`out/release-v2/some-generated-d8`（15:10 在用户终端里跑）。
- [ ] 全部生成完后做 replay 检查：`node workspace/corpus/verify-replay.mjs workspace/corpus/out/release-v2`
- [ ] 统计 v2 各组的层数和状态大小，写进结果文档。
- [ ] 从 v2 里选出实验用的 40 题（每组 10 题，规则同 v1：每组前 10 个 ID）。
- [ ] 在 v2 上重跑匹配的搜索基线（Node，Claude 可以跑）：`workspace/matched_baselines.mjs`。

### 模型实验（用户跑）
- [ ] Luna pass@5：在跑（v1 语料）。跑完算每轮 pass@1 和 pass@5，easy / layers 分开。
- [ ] Sonnet 续跑 layers-0001..0005：
      `caffeinate -i env EXECUTE=1 bash scripts/rebuttal/8b_sonnet_layers_resume.sh`（约 $10–25）
- [ ] Qwen 冒烟测试：`.env` 加 `OPENROUTER_API_KEY`，到 OpenRouter 核对模型 id，然后
      `SMOKE=1 EXECUTE=1 bash scripts/rebuttal/9_qwen_sizes.sh`，看每轮花费。
- [ ] Qwen 正式运行：`caffeinate -i env EXECUTE=1 bash scripts/rebuttal/9_qwen_sizes.sh`
- [ ] 决定：v2 上要重跑哪些模型条件（至少 Luna L+A 和 B），写成 `.sh`。

### 论文：修复逻辑问题（定位：可精确验证的长程序列规划 benchmark）
- [x] 去掉"多模态 / 视觉"立意：标题、摘要、引言、贡献、结论。
- [x] 如实说明 v1 all-layers 的层数爆炸（hard 中位数 404 层），以及 v2 的修法。
- [x] 去掉"深度墙"说法：mid 组搜索能解，只有 hard 组所有方法都解不出来，而 hard 组层数爆炸。
- [x] 去掉"反馈和列表效果相加"：逐题解出的集合几乎不重合，单次运行方差大。
- [x] 不写工程意义和商业化；在局限一节写清楚边界（平折、无厚度、模拟环境）。
- [ ] 每个保留的结论都写明样本、分母、计分方式。
- [x] 编译检查，提交（标题改为 CP2Seq: An Exactly Verifiable Benchmark for Long-Horizon Fold-Sequence Planning）。

## 之后
- [ ] v2 结果出来后更新论文里的所有表格。
- [ ] Haiku 排序的混合搜索（可选）。
- [ ] Sonnet 成本优化：直连 API、尾部不写缓存（跑 sonnet20 / haiku20 之前再做）。
- [ ] Freeform 折纸：作为下一篇单独立项，不放进这篇。
