## 执行计划

### S1: Map Current Workflow Touchpoints
- **描述**: Inspect the command and utility paths for start/go/step/current_step, done gate execution, next routing, docs-index stale checks, changes/commit staging, review/install reporting, and quick guard policy.
- **验收条件**: Identify concrete files/functions to change and confirm no runtime state file needs hand editing.
- **依赖**: 无

### S2: Fix Step Routing And Pending-Done Priority
- **描述**: Align current-step handling between `start`, `go --step`, and `step done`; adjust next-route selection so pending-done is secondary until all plan steps are complete.
- **验收条件**: Focused tests cover multi-step start/done/next transitions and fail before the fix.
- **依赖**: S1

### S3: Improve Done Gate Reuse And Profile Visibility
- **描述**: Add bounded reuse of fresh successful check/review evidence in `done`; expose active workflow profile and gate policy in status/done machine output.
- **验收条件**: Tests verify safe evidence reuse, rejection reason output, and profile/gate policy fields.
- **依赖**: S1

### S4: Reduce Generated-Artifact And Drift Noise
- **描述**: Exclude volatile workspace rendered Markdown from docs-index stale warnings; make install/review drift output distinguish baseline/pre-existing noise from current-task regressions where practical.
- **验收条件**: Tests show generated runtime views do not trigger stale docs-index warnings and reporting carries baseline/current classification fields or clear labels.
- **依赖**: S1

### S5: Consume Canonical Evidence Staging Plans
- **描述**: Let closeout/staging tooling apply the canonical evidence plan produced by `changes --agent`, force-add canonical ignored evidence, and exclude `.docpath/tasks/current/*` aliases by default.
- **验收条件**: Tests cover staging ignored canonical evidence and excluding alias evidence; CLI output explains what was staged.
- **依赖**: S1

### S6: Clarify Quick Scope Guard Policy
- **描述**: Improve quick guard configurability and document-only allowances while retaining conservative defaults for broad source changes.
- **验收条件**: Tests cover allowed document-only edits, configured allowlists, and broad source edit rejection.
- **依赖**: S1

### S7: Run Full Verification And Close Task
- **描述**: Run project tests/typecheck plus DocPath check/review/done; document any residual warning and close the workflow task.
- **验收条件**: `pnpm test`, `pnpm run typecheck`, `docpath check`, `docpath review`, and `docpath done` pass or residuals are explicitly documented.
- **依赖**: S2, S3, S4, S5, S6

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7

## 依赖关系图
S1 → S2 → S7
S1 → S3 → S7
S1 → S4 → S7
S1 → S5 → S7
S1 → S6 → S7
