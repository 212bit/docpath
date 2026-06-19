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
- [ ] FR-1: `docpath worktree create` 在 linked worktree 内执行时，必须把新 worktree 创建到主 checkout 的 `.worktrees/` 下，而不是当前 linked worktree 的嵌套 `.worktrees/` 下。
  - 来源 backlog: R-210
- [ ] FR-2: `docpath plan` 生成的计划必须覆盖 spec 中所有 `FR-*` 与 `AC-*`，否则不得推进状态或写入不合格计划。
  - 来源 backlog: R-210
- [ ] FR-3: `docpath backlog promote` 针对 CLI/工作流/非产品 UI 任务生成 spec 时，必须默认填好重大变更门禁、UI 豁免和 Decision Brief 中已有用户确认。
  - 来源 backlog: R-210
- [ ] FR-4: quick/L0 跳过 review 时，状态与输出必须显式表达 `review_skipped`，不能伪装成 `review_pass`。
  - 来源 backlog: R-210
- [ ] FR-5: `docpath worktree list/gc/doctor` 必须提供 completed/merged/dirty/managed 状态与可执行的清理或修复建议。
  - 来源 backlog: R-210
- [ ] FR-6: `docpath review` 的 CLI 输出与真实参数保持一致；如果提示 `--force`，命令必须支持该参数，否则移除提示。
  - 来源 backlog: R-210

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 修复应包含回归测试，覆盖关键 workflow/CLI 契约。

## 3. 范围界定

### 包含
- worktree 创建路径、列表、doctor/gc 提示
- plan 生成和覆盖校验契约
- backlog promote spec 模板门禁默认值
- quick review skip 状态语义
- review CLI 参数/提示一致性

### 不包含
- 重写 DocPath FSM
- 引入新的外部依赖或改变包管理器
- 改变产品 UI 或设计系统

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 工作树隔离开发 | 主 checkout 直接开发 / 专用 worktree 开发 | 采用专用 worktree | 用户明确要求存在未提交内容时不要在原工作区上开发 |
| 3 | plan 契约 | 仅在 write-plan 阶段拦截 / 生成阶段也保证覆盖 | 生成阶段也保证覆盖 | 不合格 plan 会污染后续所有流程 |

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
- [x] 权限 / 写操作边界
- [x] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: dogfood 暴露出多个 workflow/CLI 契约缺口，影响任务隔离、计划质量、门禁默认值、状态语义和收口体验。
- 目标: 修复这些缺口，让 DocPath 在存在未提交变更、linked worktree、CLI/non-UI 任务和 quick 流程中给出一致、可执行、不会污染状态的行为。
- 背景: 用户明确要求“如果存在未提交的，不要在上面进行开发，利用 worktree 进行”，并多次确认继续修复暴露问题。
- 可选方案: 逐个 quick 修复；或用一个标准任务集中修复 workflow/CLI 契约。
- 推荐方案: 使用标准任务集中修复，并在专用 worktree 中实施。
- 不做什么: 不重写 FSM，不改变 UI，不引入新依赖。
- 成本: 涉及多个 CLI 命令和回归测试，范围中等。
- 风险: 状态机语义变动可能影响既有任务 closeout；通过小步测试和兼容字段降低风险。
- 回滚方案: 回滚本分支提交，或逐个 revert 对应命令模块修改。
- 用户确认: “同意，修复这些问题”；“都进行修复”。

## 5. 验收标准

- [ ] AC-1: 从 linked worktree 内执行 `docpath worktree create child` 时，child 位于主 checkout `.worktrees/child`，且不会创建 nested `.worktrees`。
- [ ] AC-2: `docpath plan` 生成的计划覆盖当前 spec 所有 `FR-*` 与 `AC-*`，并通过现有 plan coverage gate。
- [ ] AC-3: `backlog promote` 对非 UI CLI/工作流任务生成的 spec 默认勾选 UI 豁免、重大变更用户确认和相关变更类型。
- [ ] AC-4: quick review skip 在 `next/status/done` 等输出中不再显示为 `review_pass`。
- [ ] AC-5: `worktree list/gc/doctor` 能识别 completed/merged/dirty/managed，并输出清理或修复建议。
- [ ] AC-6: `docpath review` 不再提示不存在的参数，或实际支持提示中的 `--force`。
- [ ] AC-7: 关键回归测试、类型检查和 DocPath check/review 通过。

---

*此文件由 `docpath backlog promote` 生成。*
