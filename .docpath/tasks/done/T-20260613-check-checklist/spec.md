# T-20260613-check-checklist - 修正 check checklist 同步门禁语义

> backlog_id: R-162
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

当前 docpath check 将 current.md 渲染出的执行 checklist 作为 blocking 门禁，导致 plan.md 全部完成后如果 current.md 渲染未同步会误报 Checklist 同步失败。current.md 是派生视图，不应作为完成真源；完成态归档后再次 check 还可能因 tasks/current 缺失污染 completed 状态。

## 验收

1. 子任务完成度统计使用 parsePlanTasks 统一口径，不再全局 regex 统计重复 checkbox。2. current.md checklist 不一致不再导致 check fail。3. completed/review_pass 且任务已归档时，check 不因 tasks/current 缺失回写 check_fail。4. 增加针对重复 checklist、current 派生视图、完成态归档后 check 的测试。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 修正 check checklist 同步门禁语义
  - 来源 backlog: R-162

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 修正 check checklist 同步门禁语义

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

### Decision Brief
- 当前问题: `docpath check` 当前把 `current.md` 的执行 checklist 当作 blocking 门禁，并用全局 checkbox regex 统计 plan 完成度，导致重复 checklist 或渲染未同步时误报 `Checklist 同步` / `子任务完成度`。
- 目标: 让 `docpath check` 只基于真源判断任务完成状态，避免派生视图或归档后上下文清理污染 FSM。
- 背景: `current.md` 是由 `state.json`、`plan.md`、`breadcrumb.md`、`last-check.md` 渲染出的视图；`plan.md` 和 `breadcrumb.md` 才是执行计划与执行事件真源。
- 可选方案: 1) 直接移除 checklist 同步检查；2) 改为检查 breadcrumb 与 plan 一致性；3) 保留现状但修提示。
- 推荐方案: 采用方案 2.5：完成度统计统一走 `parsePlanTasks()`；`current.md` checklist 只做派生视图，不参与 hard gate；归档完成态不因 `tasks/current` 缺失回写 `check_fail`。
- 不做什么: 不新增新的任务状态；不让 `check` 自动修改 plan 的完成标记；不把 current.md 提升为状态真源。
- 成本: 需要调整 `check` 门禁逻辑并补充回归测试。
- 风险: 降级 current.md 检查后，渲染器 bug 不再通过集成门禁暴露，需要用单元测试覆盖渲染逻辑。
- 回滚方案: 恢复 `checkCurrentChecklist()` 的 blocking 行为和 regex 完成度统计。
- 用户确认: 用户已在 2026-06-13 对“方案 2.5：真源只保留 plan + breadcrumb，current 只做视图”明确回复“同意，进行修复”。

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-162 与任务 T-20260613-check-checklist 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
