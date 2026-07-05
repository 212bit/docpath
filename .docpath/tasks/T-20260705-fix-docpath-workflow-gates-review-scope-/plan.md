## 执行计划

### S1: 梳理 Resolve the check/agent-enter/dirty-worktree deadlock. `docpath check` must support the valid contexts needed by the workflow, including pre-task/intake review and dirty pre-commit closeout, without requiring an impossible active-task state.
- [x] S1: 梳理 Resolve the check/agent-enter/dirty-worktree deadlock. `docpath check` must support the valid contexts needed by the workflow, including pre-task/intake review and dirty pre-commit closeout, without requiring an impossible active-task state.
- **描述**: 根据 spec 明确 FR-1: Resolve the check/agent-enter/dirty-worktree deadlock. `docpath check` must support the valid contexts needed by the workflow, including pre-task/intake review and dirty pre-commit closeout, without requiring an impossible active-task state. 的实现边界和验收口径。
- **验收条件**: AC-1: A dirty pre-commit worktree with task changes has a valid `docpath check` / `docpath changes --agent` path and no longer requires an impossible `agent enter` transition.
- **依赖**: 无

### S2: 实现 Resolve the check/agent-enter/dirty-worktree deadlock. `docpath check` must support the valid contexts needed by the workflow, including pre-task/intake review and dirty pre-commit closeout, without requiring an impossible active-task state.
- [x] S2: 实现 Resolve the check/agent-enter/dirty-worktree deadlock. `docpath check` must support the valid contexts needed by the workflow, including pre-task/intake review and dirty pre-commit closeout, without requiring an impossible active-task state.
- **描述**: 在现有架构内完成 FR-1: Resolve the check/agent-enter/dirty-worktree deadlock. `docpath check` must support the valid contexts needed by the workflow, including pre-task/intake review and dirty pre-commit closeout, without requiring an impossible active-task state. 的代码与文档更新。
- **验收条件**: FR-1 Resolve the check/agent-enter/dirty-worktree deadlock. `docpath check` must support the valid contexts needed by the workflow, including pre-task/intake review and dirty pre-commit closeout, without requiring an impossible active-task state. 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 Make `docpath review` capable of reviewing the task cumulative diff, not only the current working-tree diff. A committed step sequence must still be reviewable before task closeout.
- [x] S3: 实现 FR-2 Make `docpath review` capable of reviewing the task cumulative diff, not only the current working-tree diff. A committed step sequence must still be reviewable before task closeout.
- **描述**: 在现有架构内完成 FR-2: Make `docpath review` capable of reviewing the task cumulative diff, not only the current working-tree diff. A committed step sequence must still be reviewable before task closeout.。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 Make `docpath backlog promote` safe when target task specs already exist. It must not silently overwrite hand-written specs; it should merge, warn and abort, or preserve a backup with explicit recovery guidance.
- [x] S4: 实现 FR-3 Make `docpath backlog promote` safe when target task specs already exist. It must not silently overwrite hand-written specs; it should merge, warn and abort, or preserve a backup with explicit recovery guidance.
- **描述**: 在现有架构内完成 FR-3: Make `docpath backlog promote` safe when target task specs already exist. It must not silently overwrite hand-written specs; it should merge, warn and abort, or preserve a backup with explicit recovery guidance.。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 Clarify canonical task artifact versus `current` alias behavior in closeout guidance. `docpath changes --agent` and related commit guidance should prefer canonical evidence paths and identify alias files as pointers/views unless they are intentionally required.
- [ ] S5: 实现 FR-4 Clarify canonical task artifact versus `current` alias behavior in closeout guidance. `docpath changes --agent` and related commit guidance should prefer canonical evidence paths and identify alias files as pointers/views unless they are intentionally required.
- **描述**: 在现有架构内完成 FR-4: Clarify canonical task artifact versus `current` alias behavior in closeout guidance. `docpath changes --agent` and related commit guidance should prefer canonical evidence paths and identify alias files as pointers/views unless they are intentionally required.。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 实现 FR-5 Add journal/learn quality gates so seed boilerplate, placeholder options, and mechanical implementation details are not persisted as ADRs or reusable lessons.
- [ ] S6: 实现 FR-5 Add journal/learn quality gates so seed boilerplate, placeholder options, and mechanical implementation details are not persisted as ADRs or reusable lessons.
- **描述**: 在现有架构内完成 FR-5: Add journal/learn quality gates so seed boilerplate, placeholder options, and mechanical implementation details are not persisted as ADRs or reusable lessons.。
- **验收条件**: FR-5 已实现，并保持现有工作流兼容。
- **依赖**: S5

### S7: 实现 FR-6 Add regression tests for each defect class and for the intended closeout path.
- [ ] S7: 实现 FR-6 Add regression tests for each defect class and for the intended closeout path.
- **描述**: 在现有架构内完成 FR-6: Add regression tests for each defect class and for the intended closeout path.。
- **验收条件**: FR-6 已实现，并保持现有工作流兼容。
- **依赖**: S6

### S8: 验证验收标准
- [ ] S8: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: A dirty pre-commit worktree with task changes has a valid `docpath check` / `docpath changes --agent` path and no longer requires an impossible `agent enter` transition.；AC-2: A pre-task or intake/review context can run the appropriate check gate, or receives a precise command-specific explanation that does not deadlock the workflow.；AC-3: `docpath review` can review cumulative task changes after intermediate commits; tests cover the clean-working-tree-after-commit case.；AC-4: `docpath backlog promote` refuses, merges, or backs up when an existing user-authored spec would be overwritten; tests cover the data-loss scenario.；AC-5: `docpath changes --agent` identifies canonical evidence paths versus `current` alias paths and recommends staging canonical artifacts by default.；AC-6: `journal` / `learn` filters reject seed-spec boilerplate, placeholder option text, and mechanical implementation details; tests cover the examples reported by the user.；AC-7: Existing quick/standard happy-path tests continue to pass.；AC-8: The task completes with `docpath check`, `docpath review`, and journal evidence without manual state-file edits.
- **验收条件**: AC-1: A dirty pre-commit worktree with task changes has a valid `docpath check` / `docpath changes --agent` path and no longer requires an impossible `agent enter` transition.；AC-2: A pre-task or intake/review context can run the appropriate check gate, or receives a precise command-specific explanation that does not deadlock the workflow.；AC-3: `docpath review` can review cumulative task changes after intermediate commits; tests cover the clean-working-tree-after-commit case.；AC-4: `docpath backlog promote` refuses, merges, or backs up when an existing user-authored spec would be overwritten; tests cover the data-loss scenario.；AC-5: `docpath changes --agent` identifies canonical evidence paths versus `current` alias paths and recommends staging canonical artifacts by default.；AC-6: `journal` / `learn` filters reject seed-spec boilerplate, placeholder option text, and mechanical implementation details; tests cover the examples reported by the user.；AC-7: Existing quick/standard happy-path tests continue to pass.；AC-8: The task completes with `docpath check`, `docpath review`, and journal evidence without manual state-file edits.
- **依赖**: S7

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [ ] S4
- [ ] S5
- [ ] S6
- [ ] S7
- [ ] S8

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8
