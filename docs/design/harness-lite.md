# DocPath 2.0 Design: Harness Lite

> Status: Draft  
> Date: 2026-05-28  
> Scope: Product/design note only. This document does not define an immediate implementation contract.

## 1. Motivation

DocPath already has a strong base idea:

> Document as FSM — documents are not passive notes; they are workflow state.

The next step is not to turn DocPath into a heavy project-management system or a full testing platform. The goal is to make DocPath more useful for AI coding agents such as Claude Code, OpenCode, Cursor, Aider, GenericAgent, and similar tools.

The desired direction combines four families of ideas:

| Source | What DocPath should absorb |
|---|---|
| Superpowers | Agent-facing workflow enhancements: reusable commands, habits, context packs, and recovery flows. |
| Trellis | Structured workspace scaffolding: task tree, document tree, project context, and navigation. |
| GSD | Lifecycle pressure: idea → spec → plan → action → check → done. |
| Harness | Lightweight proof that a task is safe to advance: verification, evidence, and regression awareness. |

The key risk is overbuilding. If DocPath requires too many files, too many YAML contracts, or too much ceremony for small changes, it will stop being useful.

Therefore this proposal defines **Harness Lite**.

---

## 2. Product Positioning

DocPath should become:

> A lightweight document-driven workflow and verification protocol for AI coding agents.

More concretely:

> DocPath helps an agent know where it is, what context it needs, what action to take next, and what minimal verification proves the work can move forward.

DocPath should not be tied to one agent runtime. Claude Code, OpenCode, Cursor, Aider, and GenericAgent are execution surfaces. DocPath is the workflow/context/verification layer beneath them.

---

## 3. Harness Lite Definition

Harness Lite is **not** a full eval platform.

Harness Lite is:

> The minimal verification loop required before DocPath can trust a task transition.

It answers one practical question:

> You say the work is done. What did you run, and did it pass?

The default user-facing command does not need to be `docpath harness`. In the early product shape, Harness Lite should likely appear through existing commands such as:

```bash
docpath check
docpath context
```

This keeps the mental model small.

---

## 4. Core Loop

DocPath 2.0 should optimize for this loop:

```text
State → Context → Action → Check → Evidence → State
```

Meaning:

1. **State** — Where are we in the workflow?
2. **Context** — What is the smallest useful context for the agent?
3. **Action** — What should be changed or decided?
4. **Check** — What minimal verification should run?
5. **Evidence** — What proof was recorded?
6. **State** — Can the workflow safely advance?

This turns DocPath from a passive state tracker into an active progress loop.

---

## 5. Design Principles

### 5.1 Proportional Verification

Harness must be proportional.

> Small tasks get small checks. Large tasks may opt into deeper regression. No task should require more verification ceremony than the change itself.

### 5.2 Prefer Discovery Over Configuration

DocPath should first discover existing project commands before asking users to configure anything.

Examples:

- `package.json` scripts
- `Makefile` targets
- `pytest.ini`
- `pyproject.toml`
- `go.mod`
- `Cargo.toml`

MVP can begin with Node/TypeScript discovery only, because DocPath itself is a Node/TS project.

### 5.3 Reuse Existing Commands

Do not introduce new CLI surface unless necessary.

Prefer enhancing:

```bash
docpath check
docpath context
docpath init
```

before adding:

```bash
docpath harness
docpath eval
docpath regression
docpath docs
docpath reveal
```

### 5.4 Evidence Should Be Lightweight

A successful check should leave a small, readable artifact, not a database.

Early target:

```text
.docpath/workspace/last-check.md
```

This file should be easy for both humans and agents to read.

### 5.5 Progressive Disclosure Before Full Context

DocPath should not dump all project documents into the agent context by default.

The default should be:

- current state
- active task / plan pointer
- last check result
- immediate next step

Only reveal deeper specs, architecture, style, and history when the task requires it.

---

## 6. Non-Goals

Harness Lite explicitly does **not** aim to be:

- a replacement for CI
- a replacement for Jest/Vitest/Pytest/Playwright/etc.
- a full eval platform
- a benchmark framework
- a regression database
- a complex quality gate DSL
- a mandatory task-level YAML contract system
- a full project-management platform
- a documentation CMS

These may be future extensions, but they are not the first useful product shape.

---

## 7. Minimal User Experience

### 7.1 `docpath check`

A future lightweight check should feel like:

```text
DocPath
✓ current state valid
✓ plan exists

Project Verification
✓ npm run build
✓ npm run typecheck
- npm test skipped: not configured

Decision
Ready to continue.

Evidence
.docpath/workspace/last-check.md
```

If verification fails:

```text
DocPath
✓ current state valid

Project Verification
✗ npm run build failed

Decision
Do not mark task as done.
Next: fix build failure.

Evidence
.docpath/workspace/last-check.md
```

### 7.2 `last-check.md`

Example:

```md
# Last Check

- Time: 2026-05-28 20:30
- Result: PASS
- Duration: 3.1s

## Commands

| Command | Result | Duration |
|---|---:|---:|
| npm run build | PASS | 1.2s |
| npm run typecheck | PASS | 1.9s |

## Decision

Ready to continue.
```

This file is the first evidence artifact. It is intentionally simple.

### 7.3 `docpath context`

A future context package should include the last check summary by default:

```text
Current State: executing
Active Task: improve docpath check
Last Check: PASS at 2026-05-28 20:30
Next Step: continue implementation or review result
```

This helps agents avoid false completion.

---

## 8. Progressive Disclosure Lite

The first version does not need a full document registry.

Instead, define three practical context levels:

| Level | Contents | Use case |
|---|---|---|
| 0 | current state + last check + next step | quick resume, simple tasks |
| 1 | level 0 + active plan/task + nearby journal | normal implementation |
| 2 | level 1 + architecture/style/spec summaries | design, refactor, cross-module work |

Level 3 can be reserved for future full-context or multi-agent operation.

Progressive disclosure should initially be implemented through `docpath context`, not a separate `docpath reveal` command.

---

## 9. Trellis Lite: Workspace Index

Before building a document registry, create a simple workspace index:

```text
.docpath/workspace/index.md
```

Example:

```md
# Workspace Index

## State
- `.docpath/workspace/current.md`
- `.docpath/workspace/breadcrumb.md`

## Planning
- `.docpath/tasks/plan.md`

## Specs
- `.docpath/spec/architecture.md`
- `.docpath/spec/style.md`

## Verification
- `.docpath/workspace/last-check.md`
```

This is the lightest Trellis-like scaffold. It helps agents navigate without introducing a registry system too early.

A formal `docs/registry.yaml` should only be introduced after `index.md` becomes insufficient.

---

## 10. Relationship to Superpowers, Trellis, GSD, and Harness

DocPath should not copy these systems directly. It should absorb their smallest useful ideas.

```text
Superpowers → agent-facing workflow habits and command ergonomics
Trellis     → lightweight workspace and context scaffold
GSD         → lifecycle pressure toward completion
Harness     → minimal verification before state advancement
DocPath     → document-driven FSM tying them together
```

The integrated model:

```text
State     from GSD/FSM
Context   from Trellis/progressive disclosure
Action    from agent workflow/Superpowers
Check     from Harness Lite
Evidence  from last-check and future run records
State     advances only when checks make it safe
```

---

## 11. MVP Roadmap

### Phase 0 — Design Agreement

Produce and review this design document.

Decision needed:

- Is Harness Lite the right product direction?
- Should the first implementation enhance `docpath check` rather than add new commands?
- Is `last-check.md` enough for initial evidence?

### Phase 1 — Minimal Check Loop

Enhance `docpath check`:

- inspect current DocPath state
- discover Node/TS verification scripts from `package.json`
- run the minimal available set
- print concise pass/fail summary
- write `.docpath/workspace/last-check.md`

Initial script priority:

1. `typecheck`
2. `build`
3. `test`

Exact command mapping should be conservative:

| package script | command |
|---|---|
| `typecheck` | `npm run typecheck` |
| `build` | `npm run build` |
| `test` | `npm test` |

### Phase 2 — Context Includes Verification State

Enhance `docpath context`:

- read `.docpath/workspace/last-check.md` if present
- include a compact verification summary
- warn if no check has been run yet

### Phase 3 — Progressive Context Levels

Add or refine context levels:

```bash
docpath context --level 0
docpath context --level 1
docpath context --level 2
```

Keep level behavior simple and predictable.

### Phase 4 — Workspace Index

Enhance `docpath init` to generate:

```text
.docpath/workspace/index.md
```

This is the first Trellis-like structure.

### Phase 5 — Optional Registry and Regression

Only after the lightweight loop proves useful, consider:

- `docs/registry.yaml`
- regression case capture
- historical run archive
- configurable check profiles
- stronger quality gates

These are explicitly not MVP requirements.

---

## 12. Open Questions

1. Should `docpath check` run project commands by default, or require a flag such as `--verify`?
2. Should failed checks block state transitions, or only warn at first?
3. Should `last-check.md` be overwritten each time, or should history be retained later?
4. Should discovery support only npm initially, or also pnpm/yarn detection?
5. Should `docpath context --level` reuse the existing complexity level model or define a separate context level model?

Suggested defaults for MVP:

- `docpath check` may run discovered safe commands by default.
- Failures should warn strongly, not block, until state transitions are wired in.
- `last-check.md` should be overwritten each time.
- Start with package manager detection later; use npm-compatible commands first.
- Reuse 0/1/2/3 vocabulary, but document that complexity level and context level are related, not identical.

---

## 13. Success Criteria

Harness Lite is successful if:

- a developer can run one command and know whether the project is minimally healthy
- an agent can read context and know the latest verification state
- simple tasks do not require extra configuration
- failed verification reduces false “done” claims
- the system feels lighter than CI and lighter than a full eval framework
- the design leaves room for deeper regression later without requiring it now

---

## 14. Summary

The right direction is not:

```text
DocPath = full testing/eval/regression platform
```

The right direction is:

```text
DocPath = document-driven workflow + progressive context + minimal verification evidence
```

Harness Lite gives DocPath a practical completion signal while preserving its lightweight workflow nature.
