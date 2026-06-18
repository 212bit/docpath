# T-20260616-add-quick-fast-track-workflow-profile - Add quick fast-track workflow profile

> backlog_id: R-191
> backlog_source: docpath backlog add

## 1. 背景与动机

DocPath currently behaves like a heavy, one-size-fits-all workflow for both large feature work and tiny maintenance edits. That is valuable for protocol, architecture, and multi-session work, but it creates poor DX for typo fixes, one-line bugs, and small safe adjustments.

The confirmed product direction is to add an explicit fast-track entry point: `docpath quick`. Quick tasks should stay inside DocPath for auditability while using proportional gates: minimal task metadata, no full spec/plan ceremony, check evidence by default, skipped full review by profile, and minimal closeout evidence.

## 2. 需求清单

### 功能需求
- [ ] FR-1: Add a `docpath quick <title>` command that creates a lightweight active task for tiny work without requiring backlog promote, full spec, or full plan.
- [ ] FR-2: Persist an explicit workflow profile for quick tasks so downstream commands can apply profile-aware routing and gates.
- [ ] FR-3: Update `next --agent` output for quick tasks so it routes agents directly to making the change and completing with `docpath done`, not to spec/plan generation.
- [ ] FR-4: Update completion policy and `done` behavior so quick tasks require successful check evidence by default, skip full review by profile, and record the skip reason/audit output.
- [ ] FR-5: Write minimal quick task evidence in task files or workspace evidence so `changes --agent` and future sessions can understand why review was not required.
- [ ] FR-6: Add escalation safeguards so quick tasks fail loud or instruct upgrade when scope/risk exceeds the quick profile boundary.
- [ ] FR-7: Update command registration/help/docs/agent guidance so humans and agents know when to use quick versus the standard lifecycle.

### 非功能需求
- [ ] NFR-1: Preserve current standard/strict workflow semantics for existing tasks.
- [ ] NFR-2: Do not weaken check/review behavior for Level 2/3 tasks.
- [ ] NFR-3: Keep the implementation JSON-first/CLI-first and avoid hand-editing runtime views.
- [ ] NFR-4: Keep command behavior fail-loud when active state is ambiguous or a quick task exceeds boundaries.
- [ ] NFR-5: Cover new command and policy behavior with focused tests.

## 3. 范围界定

### 包含
- New operational CLI command for quick tasks.
- Workflow profile/policy model sufficient for quick vs standard completion behavior.
- Runtime route changes for quick active tasks.
- Profile-aware done/agent done behavior.
- Minimal quick task evidence and audit output.
- Tests and documentation for the new lifecycle.

### 不包含
- Fully automatic task size classification for all tasks.
- Replacing backlog/spec/plan for standard tasks.
- New UI/dashboard work beyond displaying existing state if already automatic.
- Broad refactors of state storage unrelated to quick profile support.
- Network or external service integrations.

### 待确认
- None blocking. User confirmed the quick + profile/dynamic gate approach in conversation on 2026-06-16.

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Fast-track shape | Pure bypass / quick command / invisible dynamic gating | `docpath quick` backed by explicit profile | Keeps auditability while reducing ceremony and avoids hidden automatic gate changes. |
| 2 | Quick gates | Skip all gates / require check / require review | Require check by default, skip full review by profile | Check has high value and low ceremony; full review is disproportionate for tiny work. |
| 3 | Escalation | Allow any quick task / warn only / fail loud on risky scope | Add fail-loud upgrade guidance for high-risk or oversized quick tasks | Prevents quick from becoming a loophole for protocol or architectural work. |

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
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: DocPath 对微型任务和大型任务使用同样重的生命周期，治理成本和任务规模不匹配。
- 目标: 为微型任务提供低摩擦但仍可审计的快车道。
- 背景: 用户明确指出治理成本与任务规模匹配问题，并确认采用 quick + profile/dynamic gating 方案。
- 可选方案: 纯 bypass；`docpath quick` 压缩生命周期；完全动态降级门禁。
- 推荐方案: 对外新增 `docpath quick`，对内用 workflow profile/gate policy 驱动路由和完成门禁。
- 不做什么: 不让标准任务绕过 spec/plan/check/review/journal；不做不可见的全自动降级。
- 成本: 增加一个命令、profile 字段/策略、路由分支、测试和文档维护。
- 风险: quick 被滥用绕过治理；现有 done/agent done 路径出现 profile 回归；历史任务缺少 profile 字段时兼容问题。
- 回滚方案: 移除 quick 命令和 profile-aware routing；保留现有 standard done/check/review 行为。
- 用户确认: 2026-06-16 用户回复“同意，帮我按照这个方案进行开发”。

## 5. 验收标准

- [ ] AC-1: `docpath quick "Fix typo"` creates an active quick task with a real task id and minimal durable evidence.
- [ ] AC-2: `docpath next --agent` for an active quick task recommends editing/check/done flow instead of `docpath plan`.
- [ ] AC-3: `docpath done` for quick tasks requires passing check evidence by default and does not require `review_pass`.
- [ ] AC-4: Completion output/evidence records that review was skipped by quick profile.
- [ ] AC-5: Standard Level 2/3 tasks still require the existing lifecycle and review behavior.
- [ ] AC-6: Quick escalation guard detects oversized/risky changes and reports a clear upgrade path.
- [ ] AC-7: Focused tests pass for quick command creation, profile policy, routing, and standard-task regression.

## 6. 风险与依赖

- Existing state readers may ignore unknown profile fields; implementation must keep backward compatibility.
- `done` delegates to `agent done`; profile policy may need changes in the lower-level command, not only the wrapper.
- `check` has existing level-based behavior; quick tasks should avoid triggering standard task document gates.
- Workspace has an existing install manifest drift unrelated to this task; do not mix that into the implementation scope.

## 7. 后续工作流

- Run `docpath write-plan --stdin` with an implementation plan.
- Run `docpath start S1` and use `docpath step done` after meaningful steps.
- Run `docpath check`, `docpath review`, and `docpath done` before completion.
