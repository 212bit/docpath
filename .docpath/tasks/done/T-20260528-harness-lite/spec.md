# Spec: Harness Lite for DocPath

> Task ID: T-20260528-harness-lite
> Status: check_pass
> Active design: `docs/design/harness-lite.md`
> Created: 2026-05-28

## 1. Problem

DocPath already treats documents as workflow state, but task completion still lacks a lightweight proof mechanism.

For AI-assisted development, the common failure mode is:

```text
Agent says "done" → no clear evidence of what was checked → next agent/user must re-investigate
```

The goal is to add a small verification loop without turning DocPath into a heavy eval platform.

## 2. Product Direction

DocPath should absorb ideas from:

| Source | Absorb into DocPath |
|---|---|
| Superpowers | agent-facing workflow habits, reusable commands, recovery/context patterns |
| Trellis | structured workspace and document/task tree |
| GSD | lifecycle pressure from idea/spec/plan/action/check/done |
| Harness | minimal verification evidence before state transition |

## 3. Harness Lite Definition

Harness Lite means:

> Minimal verification evidence required before DocPath can trust a task transition.

It is not:

- a full eval platform
- a CI replacement
- a complex YAML/DSL framework
- a project-management system
- a document CMS

## 4. Core Loop

```text
State → Context → Action → Check → Evidence → State
```

## 5. MVP Scope

The first implementation should be small:

1. Enhance `docpath check` to discover and run safe, project-local verification commands.
2. Write the latest check result to `.docpath/workspace/last-check.md`.
3. Make `docpath context` surface recent check evidence.
4. Add progressive context levels later, preferably through existing `context` behavior first.

## 6. Initial Acceptance Criteria

Phase 1 is acceptable when:

- `docpath check` can detect common scripts such as `build`, `test`, `typecheck`, `lint` when available.
- Check output records command, status, timestamp, and short summary.
- `.docpath/workspace/last-check.md` is created or updated.
- A failed check is visible to the next agent/user.
- Existing build remains green.

## 7. Non-Goals for MVP

- no registry database
- no separate `docpath harness` command by default
- no separate `docpath reveal` command by default
- no complicated config schema
- no mandatory project-wide regression suite

## 8. Current Decision

Design approved. Next step is to implement Phase 1 only after the task has been registered in DocPath state.
