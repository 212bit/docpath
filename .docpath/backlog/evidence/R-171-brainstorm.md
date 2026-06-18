# R-171 Brainstorm: Multi-session Isolation and Concurrency

Date: 2026-06-14
Status: brainstorm evidence, not implementation approval

## Context Checked

- `docpath status --agent` / `docpath next --agent` reported the previous task completed and recommended backlog capture for new ideas.
- `R-171` was captured as raw backlog: "新增多 session 隔离与并发".
- `docpath analyze --dry-run` and `docpath brainstorm --dry-run` were used because there is no active writable analysis task.
- Code facts checked:
  - `transitionWorkflow()` serializes state RMW through `.docpath/workspace/state.lock`.
  - `state.json`, `current.md`, `breadcrumb.*`, `last-check.md`, `review.md`, and `compact-context.md` are project-global workspace artifacts.
  - `tasks/current` is a singleton alias over canonical task dirs.
  - `go` / `agent step` depend on a bound current task and sync the active plan checklist.
  - `backlog promote` rejects promotion while an active task exists.
  - `writeBreadcrumb()` appends global breadcrumb entries and can still race around duplicate detection and truncation unless protected by a broader write lock.
  - Product positioning already names multi-agent/team concurrency as P1, while default worktree parallel execution and automatic multi-agent orchestration are non-goals.

## Problem Decomposition

The requested capability contains two related but separate problems:

1. Multi-session isolation: identify each agent/session, attribute writes, avoid one session overwriting another session's current focus, handoff, compact context, or progress records.
2. Concurrency: allow multiple sessions to work safely, either on the same task, different plan steps, or different tasks, with explicit conflict detection and recovery rules.

These should not be solved as one large rewrite. The existing model is intentionally single-current-task, so the first safe step is conflict-proof session ownership before true multi-active tasks.

## Isolation Boundaries

Recommended ownership model:

| Scope | Examples | Initial rule |
| --- | --- | --- |
| Project shared | backlog, rules, decisions, project config, team status index | Shared, writes locked |
| Task scoped | canonical `tasks/<taskId>/spec.md`, `plan.md`, analysis/design deliverables | Shared per task, writes locked per task |
| Runtime global | `workspace/state.json`, `current.md` | Keep as compatibility view in MVP |
| Session scoped | active focus, compact context, in-progress lease, agent metadata | New `workspace/sessions/<sessionId>.json` |
| Event stream | breadcrumb entries | Shared append-only stream, every event attributed to session |

Longer term, `last-check.md`, `review.md`, and `compact-context.md` should move from project-global to task/session-scoped artifacts if multi-active tasks become supported.

## Option A: Lock-only Hardening

Add locks around breadcrumb, plan sync, backlog edit/refresh, check/review writes, and any read-modify-write sequence.

Pros:
- Lowest migration cost.
- Reduces lost updates immediately.
- Preserves all existing commands and files.

Cons:
- Does not provide true session isolation.
- Still one global current task and current step.
- Users can still confuse ownership because writes are serialized, not attributed.

Usefulness:
- Good prerequisite, insufficient as the named feature.

## Option B: Session + Lease Layer

Add session identity and leases while keeping the current single-active-task FSM.

Possible artifacts:

- `.docpath/workspace/sessions/<sessionId>.json`
- `.docpath/workspace/leases.json` or `.docpath/workspace/leases/<resource>.json`
- Optional lock files near the lease/state files.

Possible commands/options:

- `docpath session start`
- `docpath session status`
- `docpath session end`
- `docpath agent enter --session <id>` or `DOCPATH_SESSION=<id>`
- `docpath go --claim --step S1`
- `docpath status --team`

Core rules:

- A session must own the task/step lease before mutating runtime progress.
- Another session trying to claim the same active step fails loud with holder, age, and recovery command.
- Stale leases are recoverable using TTL + PID/process metadata where available.
- Existing commands keep working by auto-creating a default local session or using a compatibility session.
- Breadcrumb records include `session_id`, `agent`, and optionally `lease_id`.

Pros:
- Adds real isolation and conflict diagnostics without replacing the state model.
- Compatible with current CLI-first / JSON-first protocol.
- Provides a foundation for team status.

Cons:
- Still does not support multiple active tasks in one project.
- Requires careful stale lease UX.
- Needs clear docs so users understand "session safety" is not full orchestration.

Recommendation:
- Use this as MVP.

## Option C: Task-native Multi-active Runtime

Move runtime state from one project-global state into per-task state:

- `tasks/<taskId>/state.json`
- `tasks/<taskId>/breadcrumb.jsonl`
- `tasks/<taskId>/last-check.md`
- `tasks/<taskId>/review.md`
- `tasks/current` becomes a compatibility view or session-specific alias.
- Project-level state becomes an index of active/planned/blocked tasks.

Pros:
- True cross-task concurrency.
- Cleaner long-term model for `status --team`.
- Avoids one task's check/review/handoff overwriting another's evidence.

Cons:
- High migration and compatibility cost.
- Touches most lifecycle commands and tests.
- Needs a decision on what "current" means for older agents.

Recommendation:
- Design now, implement after Option B proves stable.

## Option D: Worktree-backed Isolation

Run each session in a Git worktree with a session-local `.docpath` workspace or workspace overlay.

Pros:
- Strong code and generated-file isolation.
- Useful for risky parallel implementation.

Cons:
- Existing roadmap explicitly says default worktree parallel execution is not a current goal.
- Adds git/worktree lifecycle complexity.
- Does not replace DocPath's need for shared state and team visibility.

Recommendation:
- Keep optional later, not MVP.

## Option E: SQLite / Transaction Store

Replace file-based JSON/JSONL state with a transactional store.

Pros:
- Stronger concurrency primitives.
- Easier indexed queries for team status.

Cons:
- Storage model change and dependency cost.
- Higher operational complexity for a CLI-first tool.
- Overkill before session semantics are settled.

Recommendation:
- Not now.

## Recommended Phased Plan

Phase 1: Session attribution and lock hardening

- Introduce `session_id` generation and propagation.
- Add session metadata to `agent enter`, `go`, `agent step`, `handoff`, and breadcrumb entries.
- Protect breadcrumb write/truncate and plan sync with locks.
- Add fail-loud diagnostics when two sessions attempt to mutate the same current task/step.
- Keep one active task.

Phase 2: Explicit step leases

- Add task/step lease resources such as `task:T-...` and `task:T-...:step:S1`.
- Let `go --claim` claim a step before execution.
- Track holder, created_at, updated_at, heartbeat, command, and optional PID.
- Add `docpath session status` and lease recovery guidance.
- Same-task parallel steps should remain opt-in and blocked unless the plan declares no dependency or user confirms manual coordination.

Phase 3: Team status view

- Add `status --team` showing sessions, claimed resources, stale leases, active task, blocked steps, and next actions.
- Do not make the dashboard the source of truth; it should read the same JSON truth sources.

Phase 4: Multi-active task runtime

- Move check/review/handoff and task phase state into task-scoped artifacts.
- Convert project-global `state.json` into a compatibility/default-focus view or project index.
- Deprecate singleton `tasks/current` as write target, keeping it as a rendered alias for older agents.

## Decision Brief

Current problem:

- DocPath has project-global runtime files and a singleton current task. Multiple agent sessions can overwrite current focus, progress evidence, and generated views unless commands fully serialize and attribute writes.

Goal:

- Make multiple agent sessions safe to run in one project, with clear ownership, conflict detection, recovery, and compatibility with existing CLI-first/JSON-first protocol.

Recommended decision:

- Build a phased MVP around session identity + leases + lock hardening first. Do not jump directly to task-native multi-active runtime.

Why:

- The existing architecture already has canonical task dirs and a project-global FSM. A lease layer fits current boundaries and gives immediate user value: attribution, conflict detection, and safe handoff. Full per-task runtime should follow only after session semantics are proven.

Do not do in MVP:

- Automatic multi-agent orchestration.
- Default Git worktree parallel execution.
- RBAC / enterprise permission controls.
- SQLite/DB storage migration.
- True multi-active tasks that can independently run check/review/journal.

Cost:

- Medium. Expected touch points include `lock.ts`, `breadcrumb.ts`, `runtime.ts`, `agent.ts`, `go.ts`, `plan-sync.ts`, `agent-output.ts`, status/next output, and tests.

Risks:

- Compatibility confusion around default session behavior.
- Stale leases blocking legitimate work.
- Breadcrumb schema migration.
- Overpromising concurrency before check/review/handoff become task-scoped.

Rollback:

- Keep session metadata additive.
- Allow existing commands to run under a default compatibility session.
- If leases cause issues, disable enforcement while retaining attribution and locks.

User confirmation needed before implementation:

1. Is MVP allowed to keep only one active task while adding session isolation and same-step conflict detection?
2. Should same-task different-step concurrency be blocked by default until explicit `go --claim` support exists?
3. Should `status --team` be part of MVP or phase 2?

User confirmation on 2026-06-14:

- MVP keeps one active task while adding session isolation and same-step conflict detection.
- Same-task different-step concurrency is blocked by default until explicit claim/dependency rules exist.
- `status --team` is deferred to Phase 2, not MVP.

## Acceptance Candidates

- Two concurrent sessions writing breadcrumb/plan progress do not lose updates or corrupt JSONL/Markdown views.
- A second session trying to mutate a claimed task/step gets a fail-loud error with holder/session details and a recovery command.
- Existing single-session commands continue to work without requiring new flags.
- `status --agent` includes enough session/lease context to avoid ambiguous handoff.
- Session and lease artifacts are JSON truth sources; rendered Markdown remains a view.
