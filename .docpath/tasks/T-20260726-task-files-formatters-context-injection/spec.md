# T-20260726-task-files-formatters-context-injection - 模块拆分: task-files 漂移消解域迁出 + formatters Context Injection 迁出 (机械)

> backlog_id: R-304
> backlog_source: docpath backlog add

## 1. 背景与动机

二次 review P2-d：task-files.ts 452→563 行集齐别名管理/身份漂移/heal 四象限/3-way merge 多职责；formatters.ts 1207 行含 Context Injection 独立域。单文件多职责重演 utils 大杂烩模式。

纯机械拆分（零行为变更）：1) task-files 的 healStructuredMarkdownDrift/StructuredHealResult 与 tryThreeWayMerge 迁出至 utils/structured-heal.ts（漂移消解域），调用方与测试导入路径同步；2) formatters 的 Context Injection 段（DecisionEntry/SpecSummary/loadRecentDecisions/extractSpecSummary/selectCurrentFocus）迁出至 agent-output/context-injection.ts，formatters 保留 re-export 兼容。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 模块拆分: task-files 漂移消解域迁出 + formatters Context Injection 迁出 (机械)
  - 来源 backlog: R-304

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 模块拆分: task-files 漂移消解域迁出 + formatters Context Injection 迁出 (机械)

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
- [x] 架构 / 模块边界
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
- 当前问题: 二次 review P2-d：task-files.ts 452→563 行集齐别名管理/身份漂移/heal 四象限/3-way merge 多职责；formatters.ts 1207 行含 Context Injection 独立域。单文件多职责重演 utils 大杂烩模式。
- 目标: 模块拆分: task-files 漂移消解域迁出 + formatters Context Injection 迁出 (机械)
- 背景: 来自 backlog R-304
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-07-27 用户「全部推进」授权二次 review 全部候选含本项(P3 拆分); 纯机械移动零行为变更, formatters 保留 re-export 兼容

## 5. 验收标准

- [ ] AC-1: 迁移后各文件行数下降且职责单一化；无循环依赖（structured-heal→task-files 单向）。
- [ ] AC-2: 全量套件绿，零行为变更；导入路径全链更新（含 dist 测试导入）。
- [ ] AC-3: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-4: backlog 条目 R-304 与任务 T-20260726-task-files-formatters-context-injection 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
