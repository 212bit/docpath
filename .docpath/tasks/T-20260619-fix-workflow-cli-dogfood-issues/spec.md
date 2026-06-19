# T-20260619-fix-workflow-cli-dogfood-issues - Fix workflow CLI dogfood issues

> backlog_id: R-210
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

Dogfood exposed several workflow and CLI defects: linked worktree create anchors .worktrees under the current linked worktree, docpath plan generation can write or propose incomplete plans, backlog promote leaves CLI/non-UI gates blank, quick review skip is represented as review_pass, worktree list/gc/doctor lack cleanup and repair guidance, and review suggests unsupported --force.

## 验收

Create worktrees under the main checkout even when invoked from a linked worktree; generated plans cover all FR/AC ids or fail before state mutation; promoted CLI/non-UI specs default safe gate selections; quick review skip is explicit rather than review_pass; worktree list/gc/doctor expose actionable cleanup/repair guidance; review output and supported options are consistent.

## 2. 需求清单

### 功能需求
- [ ] FR-1: Fix workflow CLI dogfood issues
  - 来源 backlog: R-210

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Fix workflow CLI dogfood issues

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [ ] 是，需要用户确认

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
- [ ] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [ ] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题:
- 目标:
- 背景:
- 可选方案:
- 推荐方案:
- 不做什么:
- 成本:
- 风险:
- 回滚方案:
- 用户确认:

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-210 与任务 T-20260619-fix-workflow-cli-dogfood-issues 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
