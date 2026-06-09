---
name: docpath-software
description: "Software-engineering quality lens for DocPath work: architecture, implementation, technical analysis, QA, tests, check, review, and journal evidence."
---

# DocPath Software

Use this skill when a DocPath task needs an engineering lens: architecture, implementation, refactoring, debugging, tests, QA, code review, or **technical analysis before implementation**.

This skill complements the main `docpath` lifecycle route. It must not force implementation when the user asked for analysis only.

## First Commands

```bash
docpath status --agent
docpath next --agent
```

Run `docpath agent enter` only when `docpath status --agent` / `docpath next --agent` shows an active executable task or an explicit `go` route. If no active task exists, follow the route from `docpath next --agent` instead of starting from memory.

## Technical analysis quality bar

For pre-development or architecture analysis, cover:

- affected modules, routes, commands, services, components, and ownership boundaries
- data models, API contracts, validation, migrations, backward compatibility, and versioning
- permissions, security boundaries, audit/logging needs, and destructive/write operation risks
- integration points, external dependencies, feature flags, rollout/rollback, and observability
- performance, concurrency, failure modes, and recovery behavior
- test strategy: unit, integration, e2e/manual, fixtures, regression surface, and acceptance evidence
- implementation slicing and risks that should be reflected in spec/plan

Write durable conclusions with:

```bash
docpath write-analysis --section technical --stdin
docpath write-analysis --section risks --stdin
```

## Software Roles

Use the smallest relevant role:

```bash
docpath roles context --role software-architect
docpath roles context --role software-engineer
docpath roles context --role qa-engineer
```

## Engineering Deliverables

Render structured outputs when the task needs evidence beyond code:

```bash
docpath deliverables render --template architecture-brief --output .docpath/tasks/current/deliverables/architecture-brief.md
docpath deliverables render --template qa-report --output .docpath/tasks/current/deliverables/qa-report.md
docpath deliverables check
```

## Completion

Before claiming implementation completion:

```bash
docpath check
docpath review
docpath agent done
```

Use `docpath agent done` as the final route when it is recommended because it records check/review/journal evidence and clears pending completion state.

## Boundaries

- Do not bypass the active plan or DocPath lifecycle commands.
- Do not enter implementation mode for an analysis-only request.
- Do not leave role or technical analysis only in chat; write durable evidence.
- Do not hand-edit generated workspace files such as `.docpath/workspace/current.md`.
