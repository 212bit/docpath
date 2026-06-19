## 执行计划

### S1: 梳理 `docpath worktree create` 在 linked worktree 内执行时，必须把新 worktree 创建到主 checkout 的 `.worktrees/` 下，而不是当前 linked worktree 的嵌套 `.worktrees/` 下。
- **描述**: 根据 spec 明确 FR-1: `docpath worktree create` 在 linked worktree 内执行时，必须把新 worktree 创建到主 checkout 的 `.worktrees/` 下，而不是当前 linked worktree 的嵌套 `.worktrees/` 下。 的实现边界和验收口径。
- **验收条件**: AC-1: 从 linked worktree 内执行 `docpath worktree create child` 时，child 位于主 checkout `.worktrees/child`，且不会创建 nested `.worktrees`。
- **依赖**: 无

### S2: 实现 `docpath worktree create` 在 linked worktree 内执行时，必须把新 worktree 创建到主 checkout 的 `.worktrees/` 下，而不是当前 linked worktree 的嵌套 `.worktrees/` 下。
- **描述**: 在现有架构内完成 FR-1: `docpath worktree create` 在 linked worktree 内执行时，必须把新 worktree 创建到主 checkout 的 `.worktrees/` 下，而不是当前 linked worktree 的嵌套 `.worktrees/` 下。 的代码与文档更新。
- **验收条件**: FR-1 `docpath worktree create` 在 linked worktree 内执行时，必须把新 worktree 创建到主 checkout 的 `.worktrees/` 下，而不是当前 linked worktree 的嵌套 `.worktrees/` 下。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 `docpath plan` 生成的计划必须覆盖 spec 中所有 `FR-*` 与 `AC-*`，否则不得推进状态或写入不合格计划。
- **描述**: 在现有架构内完成 FR-2: `docpath plan` 生成的计划必须覆盖 spec 中所有 `FR-*` 与 `AC-*`，否则不得推进状态或写入不合格计划。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 `docpath backlog promote` 针对 CLI/工作流/非产品 UI 任务生成 spec 时，必须默认填好重大变更门禁、UI 豁免和 Decision Brief 中已有用户确认。
- **描述**: 在现有架构内完成 FR-3: `docpath backlog promote` 针对 CLI/工作流/非产品 UI 任务生成 spec 时，必须默认填好重大变更门禁、UI 豁免和 Decision Brief 中已有用户确认。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 quick/L0 跳过 review 时，状态与输出必须显式表达 `review_skipped`，不能伪装成 `review_pass`。
- **描述**: 在现有架构内完成 FR-4: quick/L0 跳过 review 时，状态与输出必须显式表达 `review_skipped`，不能伪装成 `review_pass`。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 实现 FR-5 `docpath worktree list/gc/doctor` 必须提供 completed/merged/dirty/managed 状态与可执行的清理或修复建议。
- **描述**: 在现有架构内完成 FR-5: `docpath worktree list/gc/doctor` 必须提供 completed/merged/dirty/managed 状态与可执行的清理或修复建议。。
- **验收条件**: FR-5 已实现，并保持现有工作流兼容。
- **依赖**: S5

### S7: 实现 FR-6 `docpath review` 的 CLI 输出与真实参数保持一致；如果提示 `--force`，命令必须支持该参数，否则移除提示。
- **描述**: 在现有架构内完成 FR-6: `docpath review` 的 CLI 输出与真实参数保持一致；如果提示 `--force`，命令必须支持该参数，否则移除提示。。
- **验收条件**: FR-6 已实现，并保持现有工作流兼容。
- **依赖**: S6

### S8: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 从 linked worktree 内执行 `docpath worktree create child` 时，child 位于主 checkout `.worktrees/child`，且不会创建 nested `.worktrees`。；AC-2: `docpath plan` 生成的计划覆盖当前 spec 所有 `FR-*` 与 `AC-*`，并通过现有 plan coverage gate。；AC-3: `backlog promote` 对非 UI CLI/工作流任务生成的 spec 默认勾选 UI 豁免、重大变更用户确认和相关变更类型。；AC-4: quick review skip 在 `next/status/done` 等输出中不再显示为 `review_pass`。；AC-5: `worktree list/gc/doctor` 能识别 completed/merged/dirty/managed，并输出清理或修复建议。；AC-6: `docpath review` 不再提示不存在的参数，或实际支持提示中的 `--force`。；AC-7: 关键回归测试、类型检查和 DocPath check/review 通过。
- **验收条件**: AC-1: 从 linked worktree 内执行 `docpath worktree create child` 时，child 位于主 checkout `.worktrees/child`，且不会创建 nested `.worktrees`。；AC-2: `docpath plan` 生成的计划覆盖当前 spec 所有 `FR-*` 与 `AC-*`，并通过现有 plan coverage gate。；AC-3: `backlog promote` 对非 UI CLI/工作流任务生成的 spec 默认勾选 UI 豁免、重大变更用户确认和相关变更类型。；AC-4: quick review skip 在 `next/status/done` 等输出中不再显示为 `review_pass`。；AC-5: `worktree list/gc/doctor` 能识别 completed/merged/dirty/managed，并输出清理或修复建议。；AC-6: `docpath review` 不再提示不存在的参数，或实际支持提示中的 `--force`。；AC-7: 关键回归测试、类型检查和 DocPath check/review 通过。
- **依赖**: S7

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7
- [x] S8

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8
