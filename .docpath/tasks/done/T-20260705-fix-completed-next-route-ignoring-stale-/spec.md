# T-20260705-fix-completed-next-route-ignoring-stale- - Fix completed next route ignoring stale in-progress plan step

> backlog_id: R-246
> backlog_source: docpath backlog capture

## 1. 背景与动机

After T-20260705-docpath-intake completed, docpath next --agent still recommended docpath agent step --step S4 --status done despite phase=completed/gate=review_pass. The transition is illegal, creating a route/state-machine contradiction.

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-246-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: Fix completed next route ignoring stale in-progress plan step
  - 来源 backlog: R-246

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Fix completed next route ignoring stale in-progress plan step

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
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: ## 背景
- 目标: Fix completed next route ignoring stale in-progress plan step
- 背景: 来自 backlog R-246，Decision Brief 证据: .docpath/backlog/analysis/R-246-decision-brief.md
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: User explicitly requested fixing the residual completed/review_pass next-route contradiction on 2026-07-05.

### 已有 Decision Brief (来自 backlog evidence)

.docpath/backlog/analysis/R-246-decision-brief.md

## 5. 验收标准

- [ ] AC-1: completed/review_pass tasks do not route to docpath agent step/go based on stale in-progress plan or breadcrumb evidence. 2. completed route still recommends closeout/next-work flows such as changes, learn, accepted backlog, gc, or backlog capture. 3. executing/checking tasks with a real in-progress step still route to agent step. 4. Regression tests cover the completed stale-step case.
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-246 与任务 T-20260705-fix-completed-next-route-ignoring-stale- 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
