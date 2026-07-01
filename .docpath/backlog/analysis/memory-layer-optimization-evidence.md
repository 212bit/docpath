# 记忆层（Spec Memory Layer, §2.2）优化 - 核对证据

> 来源：docs/product-panorama.md §2.2 "记忆层 — 固化项目知识"
> 核对日期：2026-07-01
> 性质：raw 调研证据，待 backlog 分析

## 一、文档 vs 实现差距（过度宣称）

| 宣称（§2.2） | 实现现状（核对到代码行） | 差距 |
|---|---|---|
| 知识沉淀：自动归档"最终决策、踩坑教训和**新 API 契约**" | journal.ts 无任何 API 契约提取代码（grep 仅命中正则里的"接口"二字） | ❌ "新 API 契约"完全未实现，最该删 |
| **自动**归档 | journal 默认 `archiveMode:'skip'`（journal.ts:221），物理归档交给 `gc --force`；ADR 提取靠脆弱双正则（journal.ts:70 `架构\|architecture\|...` AND `决策\|采用\|...`），多数任务 breadcrumb 不命中 → 提取为空 | ⚠️ "自动"言过其实，实际是"命中才归档" |
| 防止漂移：记录 ADR 防止反复争论 | ADR 有记录（decisions.jsonl 75 条），但 `reveal`/`context` **不主动展示相关 ADR**——Agent 得自己知道去查 | ⚠️ "防止反复争论"是愿望，非强制 |
| 高精度局部上下文检索 | `reveal`/`context` = 关键词+同义词+启发式打分的子串匹配（document-index.ts:402-418；同义词映射 b4157f7 近期加），无相关性排序、无 query 理解 | ⚠️ "高精度"夸大，实际是"可用过滤" |

## 二、实现层优化点（按性价比）

1. **删/实现"新 API 契约"**（文档准确性，零代码）
   - 直接删 docs 宣称，或把"从 spec 提取 API 契约"作为后续子项。

2. **加固 ADR 提取（P2，未修）**
   - 现状：`extractArchitectureDecisionCandidates`（journal.ts:70）用脆弱双正则扫 breadcrumb。
   - 修复：优先用 `spec.json` 里**已结构化**的 `decision_brief` 作数据源，breadcrumb 正则仅兜底。
   - 依据：`docs/design/journal-archiving-semantics-brief.md` 早就诊断的 P2，至今未修。

3. **让"防止漂移"真正生效**
   - 现状：reveal/context 命中主题时不展示相关 ADR。
   - 修复：命中主题时附带从 `decisions.jsonl` 按 category/topic 查并展示相关 ADR，让 Agent 触碰已有 ADR 的设计点时立刻看到历史决策。
   - 把"防止反复争论"从被动变主动。

4. **降调措辞**
   - "高精度局部上下文检索" → "按主题过滤的上下文检索"
   - "自动归档" → "任务收尾时归档"

## 三、建议拆分

- 文档降调（点 1+4）：低风险文档修改，可直接做。
- 实现优化（点 2+3）：工作流/Agent 行为变更，需 backlog → Decision Brief → 确认。

## 四、相关代码位置（核对用）

- journal.ts:70 `extractArchitectureDecisionCandidates`（双正则，P2 未修）
- journal.ts:221 `archiveMode` 默认 `'skip'`（P1 已修）
- journal.ts:488 `writeLessonCandidate`（P3 部分修，含 ADR 摘要+brief 推荐+blocked 步骤，但开头仍是"完成 X/Y 步"占位）
- document-index.ts:402-418 启发式打分；document-index.ts:4 `normalizeTopic`（同义词映射）
- agent-output.ts:153-174（R-231 并发会话感知，已 ship）
- decisions.jsonl 75 条 ADR；decisions.md / decisions-YYYY-MM.md 老化归档
