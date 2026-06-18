# T-20260616-optimize-docpath-operational-command-lay - Optimize DocPath operational command layer Phase 1

> backlog_id: R-188
> backlog_source: docpath backlog promote

## 1. 背景与动机

DocPath 的底层状态机、生命周期门禁和 closeout 分类已经足够强：`go` 能按计划步骤推进，`agent done` 会自动执行 check/review/journal，`blocked` 已经是 breadcrumb 和 plan checklist 的合法状态，`changes --agent` 能提供可审计的提交收口视图。

当前主要问题不是门禁不足，而是操作层 DX 偏重底层命令。常用动作需要输入长命令，错误恢复路径缺少语义化入口，`next --agent` 的推荐命令仍偏底层，导致 Agent 和开发者需要记住较多参数组合。

本任务只做 Phase 1：在不削弱门禁、不隐藏状态转换、不自动提交或 staging 的前提下，为已有状态机增加更短、更语义化、更可恢复的操作层命令。

## 2. 需求清单

### 功能需求

- [ ] FR-1: Add short semantic lifecycle commands that wrap existing safe primitives without changing gate semantics.
- [ ] FR-2: Support current-step inference for common step completion and blocking flows when `current_step` is unambiguous.
- [ ] FR-3: Add standardized recovery commands for blocked/failed step workflows.
- [ ] FR-4: Update `next --agent` recommendation logic to prefer the new operation-layer commands where they are clearer and safe.
- [ ] FR-5: Preserve existing `go`, `agent`, `check`, `review`, `journal`, and `changes` command behavior for compatibility.
- [ ] FR-6: Add focused regression tests covering aliases, inferred step behavior, recovery commands, and next-route recommendations.
- [ ] FR-7: Update user-facing and agent-facing docs so the new commands become the recommended primary path while low-level commands remain documented.

### 非功能需求

- [ ] NFR-1: New commands must be auditable: output should state the resolved task/step/status and the underlying lifecycle effect.
- [ ] NFR-2: New commands must be fail-loud when task identity, active step, blocked state, or session ownership is ambiguous.
- [ ] NFR-3: No command in this phase may auto-stage, commit, delete, reset, or otherwise mutate Git index/history.
- [ ] NFR-4: Existing tests for `go`, `agent`, session leases, plan sync, check/review, and changes must continue to pass.
- [ ] NFR-5: CLI command metadata/help should classify the new commands as core workflow commands if they become the recommended path.

## 3. 范围界定

### 包含

- `docpath start S1` as a semantic wrapper for entering/starting a plan step, with clear preflight gates.
- `docpath step done`, `docpath step blocked`, and `docpath step skipped` for current-step or explicit-step completion.
- `docpath done` as the short task-completion command that preserves the existing `agent done` check/review/journal gate sequence.
- `docpath resume S1`, `docpath retry S1`, and `docpath unblock S1` or equivalent recovery verbs after final naming is confirmed in implementation analysis.
- `next --agent` recommendation updates for in-progress, blocked, pending-done, and completed routes.
- Tests and docs for Phase 1 commands and recovery semantics.

### 不包含

- `docpath commit`, `docpath commit --stage`, or any Git index wrapper.
- `docpath act`, `next --execute`, or any command that executes arbitrary recommended commands.
- Weakening `agent done` gates or making check/review/journal optional by default.
- Removing existing low-level `go`, `agent`, or `run` commands.
- Automatically resolving ambiguous task identity, session lease conflicts, or plan drift.

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Optimization layer | Replace existing lifecycle commands / add semantic wrappers | Add semantic wrappers | Existing state machine is reliable; wrappers improve DX without breaking protocols. |
| 2 | Phase scope | Implement all four roadmap areas / only Phase 1 | Only Phase 1 | Short commands and recovery routes are lower risk; commit wrappers and execution mode need separate design. |
| 3 | Current-step inference | Always infer / infer only when unambiguous | Infer only when unambiguous | Prevents incorrect state transitions when plan, breadcrumb, or current state disagree. |
| 4 | Recovery verbs | Treat as aliases only / encode recovery intent | Encode recovery intent while reusing primitives | Recovery should be visible in breadcrumbs and next-route guidance. |
| 5 | Recommended commands | Keep low-level commands / recommend operation-layer commands | Recommend operation-layer commands where safe | Makes the new DX the primary path while retaining low-level compatibility. |

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
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief

- 当前问题: DocPath 的底层生命周期命令严谨但偏冗长，常用操作和错误恢复缺少面向人和 Agent 的短语义入口。
- 目标: 为现有状态机增加短命令和恢复路径标准化，让推荐路径更流畅，同时保持门禁、审计、状态一致性和显式失败。
- 背景: 已确认 `go`、`agent done`、`blocked`、`changes` 等底层能力存在；问题集中在操作层命令契约和 `next --agent` 推荐逻辑。
- 可选方案: 继续仅使用底层命令 / 直接自动执行 recommended command / 添加可审计的语义包装层。
- 推荐方案: Phase 1 只添加语义包装层和恢复推荐逻辑；保留底层命令，禁止 Git staging/commit 自动化和 unrestricted execution。
- 不做什么: 不实现 `docpath commit`、不实现 `docpath act` 或 `next --execute`、不弱化 `agent done` 门禁、不自动处理 ambiguous 状态。
- 成本: 新命令需要注册、帮助元数据、状态推断逻辑、next-route 更新、测试和文档维护。
- 风险: 语义别名过多可能造成命令面膨胀；当前步骤推断若不严格可能误标状态；恢复命令若命名不清可能与 `go`/`agent` 语义重叠。
- 缓解: 命令输出必须解释 resolved task/step/status；推断只在唯一确定时允许；低层命令保留；测试覆盖 ambiguous/fail-loud 分支。
- 回滚方案: 删除新增顶层命令和 next 推荐变更，保留底层 `go`/`agent` 路径不受影响。
- 用户确认: User confirmed: "按这个范围正式立项并进入 DocPath 任务流程".

## 5. 验收标准

- [ ] AC-1: `docpath start S1` starts step S1 through existing lifecycle gates and records an auditable in-progress transition.
- [ ] AC-2: `docpath step done` resolves the active step when unambiguous and records the same durable state as the existing low-level command.
- [ ] AC-3: `docpath step blocked` and `docpath step skipped` update breadcrumb and plan checklist consistently with existing status handling.
- [ ] AC-4: `docpath done` preserves the existing `agent done` gate order: check, review, journal, and task-end lifecycle handling.
- [ ] AC-5: Recovery commands provide a documented path from blocked/failed steps back to execution without losing breadcrumb history.
- [ ] AC-6: `next --agent` recommends short semantic commands for supported routes and remains conservative when state is ambiguous.
- [ ] AC-7: Existing low-level commands remain callable and compatible.
- [ ] AC-8: Focused tests and full validation pass, or any remaining issues are documented before closeout.
