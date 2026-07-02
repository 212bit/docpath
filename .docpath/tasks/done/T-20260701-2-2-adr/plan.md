## 执行计划

### S1: 文档降调（FR-1）
- [x] S1: 文档降调（FR-1）
- **描述**: docs/product-panorama.md §2.2 删"新 API 契约"，"自动归档"→"归档"，"高精度检索"→"按主题过滤的检索"，"防止反复争论"→"减少重复争论的风险"。对应 FR-1。
- **验收条件**: AC-1 §2.2 措辞与实现对齐，无未实现宣称
- **依赖**: 无

### S2: ADR 提取源优先级链确认（FR-2）
- [x] S2: ADR 提取源优先级链确认（FR-2）
- **描述**: 确认 collectAdrCandidates（journal.ts:577）优先级为 decision_brief > spec 关键决策表 > breadcrumb 双正则兜底；FR-2 已于 commit 13309a6 实现，本任务确认其在范围内有效。对应 FR-2。
- **验收条件**: AC-2 有 brief 时 ADR 来自 brief 而非正则
- **依赖**: S1

### S3: reveal/context 主题相关 ADR 展示（FR-3）
- [x] S3: reveal/context 主题相关 ADR 展示（FR-3）
- **描述**: 新增 getTopicRelevantDecisions（decisions.ts，同义词集+命中打分+createdAt 降序破平）；reveal --topic 命中展示相关 ADR，无匹配回退最近 N 条；context --topic 追加主题决策段。对应 FR-3。
- **验收条件**: AC-3 reveal/context --topic 输出主题相关 ADR
- **依赖**: S2

### S4: lesson 候选空壳收敛（FR-4）
- [x] S4: lesson 候选空壳收敛（FR-4）
- **描述**: writeLessonCandidate（journal.ts:514）在无 brief/ADR/blocked 时跳过写入，避免空壳 lesson。对应 FR-4。
- **验收条件**: AC-4 无实质内容时不写空壳 lesson
- **依赖**: S3

### S5: 测试与回归验证
- [x] S5: 测试与回归验证
- **描述**: decisions.test.mjs 新增 3 测试（主题查询/无 decisions.jsonl/reveal 集成）；backlog-journal.test.mjs 覆盖 brief-first 提取；全量回归。对应 NFR-1/NFR-2。
- **验收条件**: AC-5 单元测试覆盖三场景 + brief-first 提取全通过；AC-6 --agent YAML / decisions.jsonl schema 未破坏
- **依赖**: S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
