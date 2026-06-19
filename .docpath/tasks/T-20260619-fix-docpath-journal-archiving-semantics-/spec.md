# T-20260619-fix-docpath-journal-archiving-semantics- - Fix docpath journal archiving semantics (P1+P2+P3)

> backlog_id: R-213
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

docpath journal 名实不符：P1 standalone journal 同次发 prompt+归档导致 write-journal 产生僵尸任务目录；P2 ADR 提取关键词门控过严多数跳过；P3 lesson 候选是固定模板无真实内容；--skip-ai 是死 flag。

## 验收

1) standalone journal 默认不物理归档(对齐 agent done)，归档交 gc --force；2) write-journal 检测已归档任务 fail-loud 不重建僵尸目录；3) --optional-archive=always 保留老行为；4) P2 ADR 优先从 structured decision_brief + spec 关键决策表提取，breadcrumb 兜底；5) P3 lesson 候选含 ADR 摘要+decision_brief+blocked 步骤；6) 移除 --skip-ai 死 flag；7) 更新 CLAUDE.md/docs；8) 测试覆盖新行为。

## 2. 需求清单

### 功能需求
- [ ] FR-1: Fix docpath journal archiving semantics (P1+P2+P3)
  - 来源 backlog: R-213

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Fix docpath journal archiving semantics (P1+P2+P3)

### 不包含
- 待在后续规划中补充

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
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: ## 背景
- 目标: Fix docpath journal archiving semantics (P1+P2+P3)
- 背景: 来自 backlog R-213，Decision Brief 证据: docs/design/journal-archiving-semantics-brief.md
- 可选方案: 按 backlog 原始范围执行；或先补充分析后再执行
- 推荐方案: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-06-19: P1 对齐 agent done；移除 --skip-ai；P2 ADR 来源优先级 decision_brief>spec关键决策表>breadcrumb；走完整流程

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-213 与任务 T-20260619-fix-docpath-journal-archiving-semantics- 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*

## Journal Record

### 任务摘要
修复 docpath journal 的归档时序/ADR 提取/lesson 候选三处名实不符。

### 架构决策
- standalone journal 不再同次归档，对齐 agent done；物理归档交 gc --force。
- ADR 提取优先级: decision_brief > spec 关键决策表 > breadcrumb 关键词。
- lesson 候选引用真实决策与 blocked 步骤，不再只是模板。

### 经验教训
- write-journal 必须在归档前运行，否则会重建僵尸任务目录。
