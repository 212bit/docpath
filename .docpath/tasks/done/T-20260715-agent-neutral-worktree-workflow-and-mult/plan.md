## 执行计划

### S1: 梳理 Make the primary worktree workflow documentation and generated guidance agent-neutral by default. Codex, Claude Code, and OpenCode examples must be adapter examples, not the core protocol.
- [x] S1: 梳理 Make the primary worktree workflow documentation and generated guidance agent-neutral by default. Codex, Claude Code, and OpenCode examples must be adapter examples, not the core protocol.
- **描述**: 根据 spec 明确 FR-1: Make the primary worktree workflow documentation and generated guidance agent-neutral by default. Codex, Claude Code, and OpenCode examples must be adapter examples, not the core protocol. 的实现边界和验收口径。
- **验收条件**: AC-1: `docpath worktree create feature-a` no longer prints a generic `DOCPATH_SESSION=codex-feature-a` recommendation; generic output uses agent-neutral guidance.
- **依赖**: 无

### S2: 实现 Make the primary worktree workflow documentation and generated guidance agent-neutral by default. Codex, Claude Code, and OpenCode examples must be adapter examples, not the core protocol.
- [x] S2: 实现 Make the primary worktree workflow documentation and generated guidance agent-neutral by default. Codex, Claude Code, and OpenCode examples must be adapter examples, not the core protocol.
- **描述**: 在现有架构内完成 FR-1: Make the primary worktree workflow documentation and generated guidance agent-neutral by default. Codex, Claude Code, and OpenCode examples must be adapter examples, not the core protocol. 的代码与文档更新。
- **验收条件**: FR-1 Make the primary worktree workflow documentation and generated guidance agent-neutral by default. Codex, Claude Code, and OpenCode examples must be adapter examples, not the core protocol. 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 Replace default worktree session guidance from `codex-<slug>` to an agent-neutral pattern, recommended as `agent-<slug>` for generic output and `DOCPATH_SESSION=<tool>-<backlog-id>-<slug>` for tool-specific runs.
- [x] S3: 实现 FR-2 Replace default worktree session guidance from `codex-<slug>` to an agent-neutral pattern, recommended as `agent-<slug>` for generic output and `DOCPATH_SESSION=<tool>-<backlog-id>-<slug>` for tool-specific runs.
- **描述**: 在现有架构内完成 FR-2: Replace default worktree session guidance from `codex-<slug>` to an agent-neutral pattern, recommended as `agent-<slug>` for generic output and `DOCPATH_SESSION=<tool>-<backlog-id>-<slug>` for tool-specific runs.。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 Add `docpath worktree create <name> --backlog <R-id>` so a new worktree can immediately carry target backlog context and avoid `next --agent` recommending an unrelated older backlog item.
- [x] S4: 实现 FR-3 Add `docpath worktree create <name> --backlog <R-id>` so a new worktree can immediately carry target backlog context and avoid `next --agent` recommending an unrelated older backlog item.
- **描述**: 在现有架构内完成 FR-3: Add `docpath worktree create <name> --backlog <R-id>` so a new worktree can immediately carry target backlog context and avoid `next --agent` recommending an unrelated older backlog item.。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 Improve worktree doctor/readiness output so fresh branches distinguish branch merge-base status from whether the branch has unique commits; preserve `merged_to_main` compatibility while adding clearer metadata.
- [x] S5: 实现 FR-4 Improve worktree doctor/readiness output so fresh branches distinguish branch merge-base status from whether the branch has unique commits; preserve `merged_to_main` compatibility while adding clearer metadata.
- **描述**: 在现有架构内完成 FR-4: Improve worktree doctor/readiness output so fresh branches distinguish branch merge-base status from whether the branch has unique commits; preserve `merged_to_main` compatibility while adding clearer metadata.。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 实现 FR-5 Add or document a closeout-oriented worktree readiness path that summarizes check/review/journal/changes expectations without auto-merging or touching main.
- [x] S6: 实现 FR-5 Add or document a closeout-oriented worktree readiness path that summarizes check/review/journal/changes expectations without auto-merging or touching main.
- **描述**: 在现有架构内完成 FR-5: Add or document a closeout-oriented worktree readiness path that summarizes check/review/journal/changes expectations without auto-merging or touching main.。
- **验收条件**: FR-5 已实现，并保持现有工作流兼容。
- **依赖**: S5

### S7: 实现 FR-6 Preserve existing Codex adapter assets and install-health checks where they are explicitly about Codex; do not remove Codex-specific install validation.
- [x] S7: 实现 FR-6 Preserve existing Codex adapter assets and install-health checks where they are explicitly about Codex; do not remove Codex-specific install validation.
- **描述**: 在现有架构内完成 FR-6: Preserve existing Codex adapter assets and install-health checks where they are explicitly about Codex; do not remove Codex-specific install validation.。
- **验收条件**: FR-6 已实现，并保持现有工作流兼容。
- **依赖**: S6

### S8: 实现 FR-7 Add focused regression tests for create guidance, `--backlog` behavior, doctor metadata, and documentation/help strings that previously hard-coded Codex as the generic agent.
- [x] S8: 实现 FR-7 Add focused regression tests for create guidance, `--backlog` behavior, doctor metadata, and documentation/help strings that previously hard-coded Codex as the generic agent.
- **描述**: 在现有架构内完成 FR-7: Add focused regression tests for create guidance, `--backlog` behavior, doctor metadata, and documentation/help strings that previously hard-coded Codex as the generic agent.。
- **验收条件**: FR-7 已实现，并保持现有工作流兼容。
- **依赖**: S7

### S9: 验证验收标准
- [x] S9: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: `docpath worktree create feature-a` no longer prints a generic `DOCPATH_SESSION=codex-feature-a` recommendation; generic output uses agent-neutral guidance.；AC-2: Worktree docs/skill describe DocPath worktrees as agent-neutral and show Codex/Claude/OpenCode as adapter examples.；AC-3: `docpath worktree create feature-a --backlog R-268` records or copies enough target context that the new worktree can act on R-268 without `next --agent` defaulting to an unrelated backlog item.；AC-4: `docpath worktree doctor` output includes clearer branch uniqueness/merge readiness metadata while preserving existing fields.；AC-5: Tests cover default create guidance, `--backlog` behavior, doctor metadata, and the preserved Codex adapter boundary.；AC-6: `docpath check`, `docpath review`, and targeted tests pass before closeout, with any remaining follow-up backlog documented.
- **验收条件**: AC-1: `docpath worktree create feature-a` no longer prints a generic `DOCPATH_SESSION=codex-feature-a` recommendation; generic output uses agent-neutral guidance.；AC-2: Worktree docs/skill describe DocPath worktrees as agent-neutral and show Codex/Claude/OpenCode as adapter examples.；AC-3: `docpath worktree create feature-a --backlog R-268` records or copies enough target context that the new worktree can act on R-268 without `next --agent` defaulting to an unrelated backlog item.；AC-4: `docpath worktree doctor` output includes clearer branch uniqueness/merge readiness metadata while preserving existing fields.；AC-5: Tests cover default create guidance, `--backlog` behavior, doctor metadata, and the preserved Codex adapter boundary.；AC-6: `docpath check`, `docpath review`, and targeted tests pass before closeout, with any remaining follow-up backlog documented.
- **依赖**: S8

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7
- [x] S8
- [x] S9

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9
