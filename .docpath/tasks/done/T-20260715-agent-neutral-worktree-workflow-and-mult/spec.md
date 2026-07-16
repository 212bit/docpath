# T-20260715-agent-neutral-worktree-workflow-and-mult - Agent-neutral worktree workflow and multi-tool adapter support

> backlog_id: R-268
> backlog_source: docpath backlog add

## 1. 背景与动机

The 2026-07-15 worktree dogfood run showed that DocPath worktree support is useful for isolating active backlog work, but the current surface is too Codex-shaped and leaves several workflow gaps for future multi-tool usage. The CLI create output recommends `DOCPATH_SESSION=codex-...`, the bundled worktree skill is named `codex-worktree`, examples center Codex as the protocol rather than as one adapter, `worktree create` cannot bind the new worktree to the intended backlog item, `worktree doctor` reports ambiguous merge readiness such as `merged_to_main: true` on fresh branches, and closeout requires agents to stitch together multiple commands manually.

The user confirmed the direction on 2026-07-15 and explicitly wants DocPath to support Codex, Claude Code, OpenCode, and compatible tools without making Codex the generic worktree contract.

## 2. 需求清单

### 功能需求

- [ ] FR-1: Make the primary worktree workflow documentation and generated guidance agent-neutral by default. Codex, Claude Code, and OpenCode examples must be adapter examples, not the core protocol.
- [ ] FR-2: Replace default worktree session guidance from `codex-<slug>` to an agent-neutral pattern, recommended as `agent-<slug>` for generic output and `DOCPATH_SESSION=<tool>-<backlog-id>-<slug>` for tool-specific runs.
- [ ] FR-3: Add `docpath worktree create <name> --backlog <R-id>` so a new worktree can immediately carry target backlog context and avoid `next --agent` recommending an unrelated older backlog item.
- [ ] FR-4: Improve worktree doctor/readiness output so fresh branches distinguish branch merge-base status from whether the branch has unique commits; preserve `merged_to_main` compatibility while adding clearer metadata.
- [ ] FR-5: Add or document a closeout-oriented worktree readiness path that summarizes check/review/journal/changes expectations without auto-merging or touching main.
- [ ] FR-6: Preserve existing Codex adapter assets and install-health checks where they are explicitly about Codex; do not remove Codex-specific install validation.
- [ ] FR-7: Add focused regression tests for create guidance, `--backlog` behavior, doctor metadata, and documentation/help strings that previously hard-coded Codex as the generic agent.

### 非功能需求

- [ ] NFR-1: Keep existing `docpath worktree create <name>` behavior backward compatible when `--backlog` is omitted.
- [ ] NFR-2: Do not mutate main checkout state or active R-267 task state from this task; all implementation work happens in the R-268 worktree.
- [ ] NFR-3: Avoid broad renames that break installed Codex skills in this phase; compatibility aliases or transitional naming are acceptable.
- [ ] NFR-4: CLI output fields should be append-only where practical so existing agent parsers do not break.

## 3. 范围界定

### 包含

- `src/commands/worktree.ts` and command registration/help updates for `--backlog`, session guidance, and doctor metadata.
- Worktree workflow docs and the local worktree skill wording, with an agent-neutral primary contract and adapter-specific examples.
- Tests around worktree create/doctor/help and target backlog routing.

### 不包含

- Automatic merge into main.
- Automatic git staging/commit wrappers beyond existing `changes --agent` guidance.
- Full dirty-guard redesign, `write-spec --preserve-phase`, or stacked-worktree merge orchestration beyond plan-level documentation; those remain follow-up backlog items if needed.
- Removing Codex install-health assets or changing `.codex/config.toml` semantics.

## 4. 关键决策

| # | Decision | Options | Conclusion | Rationale |
|---|---|---|---|---|
| 1 | Primary worktree language | Codex-first / agent-neutral with adapter examples | Agent-neutral with adapter examples | Worktree isolation is a DocPath protocol capability, not a Codex-only feature. |
| 2 | Session default | `codex-<slug>` / `agent-<slug>` / require explicit tool | `agent-<slug>` in generic CLI output, `<tool>-<backlog-id>-<slug>` in docs | Keeps generic guidance usable while supporting audited multi-tool sessions. |
| 3 | Backlog targeting | Rely on global next priority / add `--backlog` | Add `--backlog` | Dogfood showed unrelated backlog recommendations after worktree creation. |
| 4 | Compatibility | Rename/remove Codex skill immediately / keep compatibility and neutralize wording | Keep compatibility in this phase | Installed Codex adapter behavior must keep working while the protocol becomes tool-neutral. |

## 4.1 重大变更门禁

### 是否涉及重大变更

- [ ] No
- [x] Yes, user confirmation required

### 变更类型

- [x] Workflow / Agent behavior
- [x] Permission / write-operation boundaries
- [x] Long-term maintenance cost
- [ ] Technology stack / framework
- [ ] API / data contract
- [ ] Deployment / runtime mode
- [ ] Removing or replacing existing capability

### Decision Brief

- Current problem: DocPath worktree UX and guidance are partially Codex-bound, which makes multi-tool adoption confusing and caused real dogfood friction when trying to target a specific backlog from an isolated worktree.
- Goal: Make worktree workflow guidance and the minimum CLI create/doctor path agent-neutral while preserving Codex adapter compatibility.
- Background: The completed R-254/R-243/R-255 worktree run exposed Codex-specific session naming, target backlog mismatch, manual closeout stitching, ambiguous doctor merge readiness, and git index permission diagnosis gaps.
- Options: (A) only update docs; (B) update docs plus minimal create/doctor CLI support; (C) redesign all worktree lifecycle and merge automation now.
- Recommended option: B.
- Rationale: B fixes the highest-friction and multi-tool-blocking issues without expanding into merge automation or dirty-guard redesign.
- Non-goals: Do not merge R-267, do not auto-merge worktrees, do not delete Codex adapter checks, do not solve all follow-up dogfood issues in one task.
- Cost: Moderate; command parser/help/tests plus docs/skill updates.
- Risks: Existing users may rely on `codex-` examples; `--backlog` may be confused with immediate promote; doctor metadata could be misread by parsers.
- Mitigation: Preserve old create behavior, keep Codex examples as adapter examples, make new fields append-only, and make `--backlog` output explicit about copied backlog context vs task ownership.
- Rollback: Revert worktree command/doc changes; existing low-level worktree create/doctor/remove behavior remains unchanged.
- User confirmation: User agreed on 2026-07-15 after reviewing the worktree retrospective and multi-tool concern.

### UI 设计门禁

- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

## 5. 验收标准

- [ ] AC-1: `docpath worktree create feature-a` no longer prints a generic `DOCPATH_SESSION=codex-feature-a` recommendation; generic output uses agent-neutral guidance.
- [ ] AC-2: Worktree docs/skill describe DocPath worktrees as agent-neutral and show Codex/Claude/OpenCode as adapter examples.
- [ ] AC-3: `docpath worktree create feature-a --backlog R-268` records or copies enough target context that the new worktree can act on R-268 without `next --agent` defaulting to an unrelated backlog item.
- [ ] AC-4: `docpath worktree doctor` output includes clearer branch uniqueness/merge readiness metadata while preserving existing fields.
- [ ] AC-5: Tests cover default create guidance, `--backlog` behavior, doctor metadata, and the preserved Codex adapter boundary.
- [ ] AC-6: `docpath check`, `docpath review`, and targeted tests pass before closeout, with any remaining follow-up backlog documented.
