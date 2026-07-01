# R-240 记忆层优化 — 分析汇总

## 概述
对齐 `docs/product-panorama.md §2.2 记忆层` 的宣称与实现，并修补三个实现缺口：ADR 提取验证、reveal/context 主题相关 ADR 展示、lesson 候选占位收敛。

## 核心发现

1. **ADR 提取已部分修复**：`collectAdrCandidates()` 已实现三级优先链（decision_brief > 关键决策表 > breadcrumb 双正则），证据文件中"靠脆弱双正则"的描述已部分过时。brief 提取为一级优先源。
2. **reveal 展示 ADR 但非主题相关**：`getRecentDecisions(cwd, 5)` 返回最近 5 条，`--topic X` 不影响 ADR 筛选。标题写"相关决策"实为"最近决策"。
3. **context 完全不展示 ADR**：`context.ts` 不导入任何 decisions 相关函数。
4. **§2.2 有 3 处措辞需降调**："新 API 契约"（未实现）、"自动归档"（命中才归档）、"高精度检索"（子串匹配）。

## 推荐方案（4 个优化点）

| # | 优化点 | 改动范围 | 预估 | 风险 |
|---|---|---|---|---|
| 1 | §2.2 文档降调（3 行文本） | `docs/product-panorama.md` | 10 min | 无 |
| 2 | 验证 ADR 提取链测试覆盖 + 补 brief 提取测试 | `tests/` | 15 min | 无 |
| 3 | 新增 `getTopicRelevantDecisions()` + 改造 reveal/context | `decisions.ts`, `reveal.ts`, `context.ts` | 60 min | 低 |
| 4 | lesson 候选无实质内容时跳过写入 | `journal.ts` | 10 min | 低 |

**总计**：~2 小时

## 必答问题（已回答）

- Q1: 主题匹配粒度 → 推荐全文匹配（category + context + decision），与 document-index 策略一致
- Q2: 无主题时 reveal 行为 → 保持现状（最近 5 条）
- Q3: context 无主题时是否展示 ADR → 不展示（仅 --topic 时展示）
- Q4: 是否新增 topic_tags 字段 → 不新增（不改 schema）

## 详细分析

详见：
- requirements: [R-240-requirements.md](./R-240-requirements.md)
- product: [R-240-product.md](./R-240-product.md)
- ui: [R-240-ui.md](./R-240-ui.md)（N/A）
- technical: [R-240-technical.md](./R-240-technical.md)
- risks: [R-240-risks.md](./R-240-risks.md)
- open-questions: [R-240-open-questions.md](./R-240-open-questions.md)
- 原始证据: [memory-layer-optimization-evidence.md](./memory-layer-optimization-evidence.md)
