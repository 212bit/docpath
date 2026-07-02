# T-20260701-2-2-adr - 优化记忆层(§2.2)：对齐文档宣称与实现 + 加固 ADR 提取/主动展示

> backlog_id: R-240
> backlog_source: docpath backlog capture

## 1. 背景与动机

## 背景

docs/product-panorama.md §2.2 记忆层宣称与实现存在差距：'新 API 契约'完全未实现；'自动归档'实为命中才归档；ADR 提取靠脆弱双正则(P2 未修)；reveal/context 不主动展示相关 ADR；'高精度检索'实为关键词过滤。详见 analysis/memory-layer-optimization-evidence.md。

## 验收

待分析阶段补齐。初稿：①文档降调删除/对齐过度宣称；②ADR 提取源改用 spec.json decision_brief；③reveal/context 命中主题时附带展示相关 ADR。

## 2. 需求清单

### 功能需求
- [x] FR-1: 文档降调——§2.2 删"新 API 契约"、"自动归档"→"归档"、"高精度检索"→"按主题过滤的检索"、"防止反复争论"→"减少重复争论的风险"
  - 来源 backlog: R-240
- [x] FR-2: ADR 提取源优先 spec.json `decision_brief`（→ spec.md 关键决策表 → breadcrumb 双正则兜底），由 `collectAdrCandidates`（journal.ts:577）编排；本任务前已于 commit `13309a6` 实现，本任务确认其在范围内有效
  - 来源 backlog: R-240
- [x] FR-3: `reveal --topic` / `context --topic` 命中主题时附带展示相关 ADR（`getTopicRelevantDecisions`，同义词+打分+createdAt 降序破平）；reveal 无匹配回退最近 N 条
  - 来源 backlog: R-240
- [x] FR-4: `writeLessonCandidate` 在无 brief/ADR/blocked 时跳过写入，避免空壳 lesson
  - 来源 backlog: R-240

### 非功能需求
- [x] NFR-1: `--agent` YAML 字段 append-only；decisions.jsonl schema 不变，与现有工作流兼容
- [x] NFR-2: 新增行为可通过本地单元测试验证（decisions.test.mjs + backlog-journal.test.mjs）

## 3. 范围界定

### 包含
- §2.2 文档降调（FR-1）
- ADR 提取源优先级链确认（FR-2，已存在于 `collectAdrCandidates`）
- `getTopicRelevantDecisions` + reveal/context 主题相关 ADR 展示（FR-3）
- lesson 候选空壳收敛（FR-4）

### 不包含
- 不实现"新 API 契约"自动提取（删宣称，非实现）
- 不引入 embedding/向量检索
- 不改 decisions.jsonl schema 或老化归档机制
- 不重构 document-index 启发式打分

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [x] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [ ] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: ## 背景
- 目标: 优化记忆层(§2.2)：对齐文档宣称与实现 + 加固 ADR 提取/主动展示
- 背景: 来自 backlog R-240
- 可选方案: 按 backlog 原始范围执行；或先补充分析后再执行
- 推荐方案: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [x] AC-1: §2.2 措辞与实现对齐——无未实现宣称（"新 API 契约"已删，"自动归档"/"高精度检索"已降调）
- [x] AC-2: `collectAdrCandidates` 优先级为 decision_brief > 关键决策表 > breadcrumb 正则；有 brief 时 ADR 来自 brief 而非正则
- [x] AC-3: `reveal --topic X` 输出含与 X 相关的 ADR；无匹配时回退最近 N 条并标注；`context --topic X` 追加主题决策段
- [x] AC-4: `writeLessonCandidate` 在无 brief/ADR/blocked 时不写空壳 lesson
- [x] AC-5: 单元测试覆盖主题查询（含同义词、无匹配、空 topic）+ reveal 集成 + brief-first 提取，全部通过
- [x] AC-6: `--agent` YAML / decisions.jsonl schema 未破坏，现有解析器回归通过
- [x] AC-7: backlog 条目 R-240 与任务 T-20260701-2-2-adr 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
