# T-20260705-fix-docpath-workflow-gates-review-scope- - Fix DocPath workflow gates, review scope, promote safety, and knowledge extraction quality

> backlog_id: R-244
> backlog_source: docpath backlog add

## 1. 背景与动机

On 2026-07-05 the user confirmed five concrete DocPath defects exposed by real usage:

1. `docpath check` and `docpath agent enter` can form a hard deadlock with dirty worktree closeout: `agent enter` rejects dirty worktrees, `check` expects an active task, commit requires passing check, and entering a task expects clean state.
2. `journal` / `learn` extraction can persist noisy ADR or lesson candidates, including mechanical seed-spec decisions such as `spec.json rendering: JSON` and placeholder option text such as `方案 A / 方案 A`.
3. `backlog promote` can overwrite a hand-written spec with a seed spec without merge, warning, or backup.
4. `review` only examines the current working-tree diff, so after step commits it reports no changes and cannot satisfy a task-level review gate.
5. `.docpath/tasks/current/*` aliases and canonical `.docpath/tasks/<task_id>/*` artifacts are confusing during staging and closeout, with inconsistent guidance about what should be committed.

These are DocPath architecture and workflow defects, not agent usage mistakes. The task changes workflow/agent behavior, write boundaries, review/check semantics, and evidence guidance, so it requires standard gates and explicit Decision Brief evidence.

## 2. 需求清单

### 功能需求

- [ ] FR-1: Resolve the check/agent-enter/dirty-worktree deadlock. `docpath check` must support the valid contexts needed by the workflow, including pre-task/intake review and dirty pre-commit closeout, without requiring an impossible active-task state.
- [ ] FR-2: Make `docpath review` capable of reviewing the task cumulative diff, not only the current working-tree diff. A committed step sequence must still be reviewable before task closeout.
- [ ] FR-3: Make `docpath backlog promote` safe when target task specs already exist. It must not silently overwrite hand-written specs; it should merge, warn and abort, or preserve a backup with explicit recovery guidance.
- [ ] FR-4: Clarify canonical task artifact versus `current` alias behavior in closeout guidance. `docpath changes --agent` and related commit guidance should prefer canonical evidence paths and identify alias files as pointers/views unless they are intentionally required.
- [ ] FR-5: Add journal/learn quality gates so seed boilerplate, placeholder options, and mechanical implementation details are not persisted as ADRs or reusable lessons.
- [ ] FR-6: Add regression tests for each defect class and for the intended closeout path.

### 非功能需求

- [ ] NFR-1: Preserve compatibility for normal quick and standard task flows.
- [ ] NFR-2: Keep all behavior deterministic and locally testable; do not introduce external LLM or network dependencies.
- [ ] NFR-3: Error messages and `--agent` output must explain the next valid command when a gate blocks progress.
- [ ] NFR-4: Avoid broad refactors outside the modules that own workflow state, backlog promotion, review/change diff calculation, and journal/learn extraction.

## 3. 范围界定

### 包含

- Workflow gate semantics for `check`, `agent enter`, `changes`, and commit readiness.
- Review diff-base semantics for task-level review after intermediate commits.
- Safe promote behavior for existing task/spec artifacts.
- Closeout guidance for canonical task files and `current` aliases.
- Journal/learn extraction filters for seed specs, placeholders, and non-reusable mechanical details.
- Automated tests and updated command output expectations.

### 不包含

- Replacing the DocPath workflow model wholesale.
- Adding a database, remote service, or network-dependent review/learn system.
- Product UI changes.
- Migrating historical task artifacts except where tests need fixtures.

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Repair strategy | Patch symptoms / Define command contexts and evidence ownership / Suspend strict gates | Define command contexts and evidence ownership | The failures share a command-context mismatch; explicit contexts make fixes testable without weakening gates. |

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

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: DocPath treats several lifecycle gates as if there is only one valid execution context: clean worktree, active task, and uncommitted local diffs. Real usage has shaping/promoting work before a task exists, step-level commits during a task, and closeout evidence after changes already exist. Generated seed content can also overwrite or pollute durable artifacts.
- 目标: Make DocPath lifecycle gates composable across intake, task execution, and closeout while protecting user-authored artifacts and keeping durable knowledge extraction trustworthy.
- 背景: User reported and confirmed the five defects on 2026-07-05.
- 可选方案:
  - 方案 A: Patch each symptom independently.
  - 方案 B: Define explicit command contexts and evidence ownership rules, then implement targeted fixes in each affected command.
  - 方案 C: Suspend strict gates when conflicts occur.
- 推荐方案: 方案 B
- 决策理由: Explicit contexts make the behavior testable and reduce future contradictions without weakening gates. Option A risks repeated local exceptions. Option C would make DocPath less trustworthy.
- 不做什么: Do not remove standard gates, bypass review/check, or teach agents to ignore DocPath. The framework itself must provide a valid route.
- 成本: Medium to high; likely touches workflow state/routing, check/review/change closeout logic, backlog promotion, journal/learn extraction, and tests.
- 风险: Check could become over-permissive; cumulative review could include unrelated commits if the task base is wrong; promote safety could break existing flows; journal filters could suppress valid lessons if too aggressive.
- 回滚方案: Revert the task commits. Command-level changes should restore previous behavior without data migration.
- 用户确认: User replied `同意` on 2026-07-05 after the major-change direction was summarized.

## 5. 验收标准

- [ ] AC-1: A dirty pre-commit worktree with task changes has a valid `docpath check` / `docpath changes --agent` path and no longer requires an impossible `agent enter` transition.
- [ ] AC-2: A pre-task or intake/review context can run the appropriate check gate, or receives a precise command-specific explanation that does not deadlock the workflow.
- [ ] AC-3: `docpath review` can review cumulative task changes after intermediate commits; tests cover the clean-working-tree-after-commit case.
- [ ] AC-4: `docpath backlog promote` refuses, merges, or backs up when an existing user-authored spec would be overwritten; tests cover the data-loss scenario.
- [ ] AC-5: `docpath changes --agent` identifies canonical evidence paths versus `current` alias paths and recommends staging canonical artifacts by default.
- [ ] AC-6: `journal` / `learn` filters reject seed-spec boilerplate, placeholder option text, and mechanical implementation details; tests cover the examples reported by the user.
- [ ] AC-7: Existing quick/standard happy-path tests continue to pass.
- [ ] AC-8: The task completes with `docpath check`, `docpath review`, and journal evidence without manual state-file edits.
