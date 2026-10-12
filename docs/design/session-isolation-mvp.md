---
related:
  - features/worktree-workflow.md
  - design/command-boundaries.md
---

# Session Isolation MVP

> Status: Implemented MVP direction
> Date: 2026-06-14
> Scope: Multi-session safety for one active DocPath task; not a multi-task scheduler.

## Goal

The MVP makes multiple agent sessions safer in one DocPath project without
changing the core single-active-task workflow.

It adds:

- session identity for lifecycle commands
- task/step leases for conflict detection
- session attribution in breadcrumb events
- locks around breadcrumb and plan checklist read-modify-write paths

It does not add:

- multiple active tasks
- automatic multi-agent orchestration
- default Git worktree parallelism
- `status --team`
- RBAC or permission management

## Session Identity

Commands accept a session id through either:

```bash
docpath go --step S1 --session codex-a
docpath agent step --step S1 --session codex-a
```

or:

```bash
DOCPATH_SESSION=codex-a docpath go --step S1
DOCPATH_SESSION=codex-a docpath agent step --step S1
```

When no explicit session or `DOCPATH_SESSION` is provided, DocPath auto-detects
supported agent environments (`ANTIGRAVITY_CONVERSATION_ID`, `CLAUDE_CONVERSATION_ID`,
`OPENCODE_SESSION_ID`, `CODEX_SESSION_ID`) to assign unique session names (e.g., `agy-...`),
falling back to the compatibility session `default`.

Session metadata is recorded as JSON truth under:

```text
.docpath/workspace/sessions/<sessionId>.json
```

It records both `pid` (the ephemeral CLI invocation) and `ppid` (the persistent
parent Agent / IDE / Shell process) so that liveness checks survive short CLI process exit.

## Preemption & Lease Guard

Destructive commands (`docpath task stash`, `task abort`, `task reset`, and `start` over active tasks)
strictly enforce live session ownership. If an active task is leased by another live session
(verified by persistent parent PPID survival and unexpired TTL), the operation is blocked:
`--force` is strictly required to override.

## Lease Model

`docpath go` and `docpath run start/end` claim execution leases under:

```text
.docpath/workspace/leases/
```

The MVP claims both:

- `task:<taskId>`
- `task:<taskId>:step:<stepId>`

The task-level lease is intentional. It blocks same-task different-step
parallelism for now because `state.json`, `current.md`, `last-check.md`,
`review.md`, `compact-context.md`, and `tasks/current` are still project-global
or current-task oriented.

If another session tries to claim a live lease, the command fails loud and
prints the holder session and resource. The same session may renew its own
lease across short CLI processes.

Stale recovery is TTL-based. Process ids are recorded for diagnostics, but a
dead CLI process is not enough to make a lease stale because normal DocPath
commands are short-lived and the lease must survive from `go` to `agent step`.

## Breadcrumb Attribution

New breadcrumb JSONL records may include:

```json
{"sessionId":"codex-a"}
```

The Markdown view renders the same value as:

```markdown
sessionId: codex-a
- **Session**: codex-a
```

Older breadcrumb records without `sessionId` remain valid.

## Recovery Rules

If a command fails with a lease conflict:

1. Continue with the holder session id if that session is still active.
2. Wait for the lease TTL if the holder is abandoned.
3. Only manually remove lease files when the team has confirmed there is no
   active session still working on that task.

The MVP deliberately avoids automatic cross-session takeover for fresh leases.

## Phase 2

Phase 2 should add a team/status view over the same JSON truth sources:

- active sessions
- claimed resources
- stale leases
- blocked steps
- suggested recovery commands

True multi-active-task runtime requires task-scoped `state`, `check`, `review`,
`handoff`, and current-alias semantics and is outside this MVP.
