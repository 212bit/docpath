# R-269 Analysis: next_hint FSM single-source derivation

## Problem

Field incidents (R-267 S8, project-brief next_hint fix family):

1. `docpath check` body says "下一步: docpath review" while trailing `next_hint` recommended `docpath plan` even though plan existed (8/8 steps done).
2. Hand-written recovery hints (e.g. `docpath recover check`) that are illegal for non-blocked steps.
3. Project intake commands hardcode `next_hint` blocks independent of the main router.

Root cause: routing advice is multi-source.

| Source | Location | Role |
| --- | --- | --- |
| FSM targets + recovery map | `src/engine/transitions.ts` `EVENT_TARGETS`, `EVENT_RECOVERY_COMMAND` | Legal transition truth |
| Semantic router | `src/utils/agent-output/formatters.ts` `inferNextAction` | Rich backlog/step/git closeout routing |
| Hint emitter | `src/utils/next-hint.ts` `emitNextHint` | Re-runs `generateAgentOutput(view=next)` after commands |
| Hand-written project hints | `src/commands/project.ts` | Intake-specific next_hint YAML |
| Inline prose | e.g. `check.ts` "下一步: docpath review" | Human-facing body text |

`emitNextHint` already reuses the agent router, so most lifecycle commands are not inventing commands ad hoc. The remaining gaps are:

- Router heuristics can still disagree with just-applied FSM state / body prose when evidence is stale or priority order is wrong.
- Illegal-transition recovery strings (`EVENT_RECOVERY_COMMAND`) are not validated against `listValidWorkflowEvents`.
- Project intake keeps a parallel hint DSL.

## Goals

1. Single derivation layer for workflow-phase routing: preferred next command must be legal under `listValidWorkflowEvents` when the recommendation is a workflow-gate command (`check` / `review` / `journal` / `go` / `done` / `recover` family).
2. Command bodies may print short human prose, but machine `next_hint` must come from the shared emitter / router, not a second hand-written command string that can diverge.
3. Project intake may keep intake-specific routing (not on the main task FSM), but must not invent unsupported commands.

## Non-goals

- Rewriting the entire backlog priority ladder inside `inferNextAction`.
- Changing FSM transition legality itself (phase/gate matrix).
- Forcing project-intake onto the task FSM.

## Recommended design

### A. Export FSM-derived next candidates

In `transitions.ts`:

- Export `EVENT_RECOVERY_COMMAND` as `workflowEventSuggestedCommand(event)`.
- Add `listPreferredWorkflowCommands(previous)` that maps currently valid events to concrete CLI templates, ordered by gate progression:
  - check.failed → `docpath check`
  - check.passed path → `docpath review` (or quick `docpath done`)
  - review.passed/skipped → `docpath journal`
  - step.started → `docpath go --step ...` only when step id is known externally

### B. Constrain `inferNextAction` gate recommendations

Before returning a workflow-gate `recommended_command` (`docpath check|review|journal|recover|done`), verify it is consistent with current `phase`/`gate` via `listValidWorkflowEvents` or an explicit allowlist derived from that list.

If the heuristic wants an illegal command, fall back to the highest-priority legal FSM command or `docpath next --agent`.

### C. Keep `emitNextHint` as the only machine hint sink for lifecycle commands

- Lifecycle commands already call `emitNextHint`.
- Remove any second machine-facing command string that can disagree with `emitNextHint` when both are present, or ensure body prose is non-machine ("下一步 review") without a competing YAML block.

### D. Project intake

- Keep `nextActionForIntake` as the intake single source.
- Inline `console.log('next_hint:')` blocks must call the same helper, not duplicate command strings.

## Acceptance criteria (draft)

- AC-1: After successful `check` with `gate=check_pass`, `next_hint.recommended_command` is `docpath review` (or profile-equivalent done/journal path), never `docpath plan` when a plan already exists and all steps are done.
- AC-2: Illegal-transition recovery suggestions only recommend commands that are valid from the current phase/gate, or `docpath next --agent`.
- AC-3: Lifecycle commands that emit `next_hint` obtain it via `emitNextHint` / agent router; no parallel hand-written gate command in the same output path that can diverge.
- AC-4: Unit/integration tests cover check→review hint, blocked-only recover, and at least one FSM-constraint unit case.
- AC-5: Project intake next_hint continues to recommend only supported `project` / `backlog` commands.

## Decision Brief

- 当前问题: next_hint 多源手写，与 FSM 合法转移脱节，逐点修不可持续
- 目标: hint 生成统一走 FSM 约束 + agent router 单源
- 可选方案:
  - A: 仅修 check 后 plan 错路由（局部）
  - B: 导出 FSM 候选并约束 gate 类 recommended_command（推荐）
  - C: 完全用 FSM 替换 inferNextAction（过大，丢失 backlog/git 语义）
- 推荐方案: B
- 不做什么: 不重写 backlog 优先级；不把 project-intake 并入 task FSM
- 成本: 中
- 风险: 过度约束可能挡住合法的 backlog/learn 路由；仅约束 gate 命令族
- 回滚: 回滚本任务提交
- 用户确认: 目标「完成剩余所有 backlog」下按方案 B 推进
