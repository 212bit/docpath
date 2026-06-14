---
name: docpath-software
description: Software engineering quality lens for architecture implementation technical analysis QA and code review
---

# DocPath Software

Use this skill when a DocPath task needs **engineering analysis or implementation**: architecture, technical analysis, refactoring, debugging, tests, QA, or code review.

This is a **quality lens** that integrates with the main `docpath` workflow. Use the main `docpath` skill for lifecycle routing (`next`, `go`, `check`, `done`; `status` for diagnostics).

## When to Use

- User asks for technical analysis, architecture review, or implementation approach
- Task requires refactoring, debugging, performance optimization
- Tests, QA, or code review are needed
- **Pre-implementation technical analysis** is required before writing code

**Important**: This skill complements the DocPath lifecycle. It must not force implementation when the user asked for analysis only.

## First Commands

Always start with:

```bash
docpath next --agent
```

Only run `docpath agent enter` when `docpath next --agent` shows an **active executable task** or explicit `go` route. If no active task exists, follow the route from `docpath next --agent` instead of starting from memory. Use `docpath status --agent` only for explicit status/debug snapshots, suspected drift, or confirmation after state-changing commands. Treat `next --agent` as advisory, not as a lock or permission grant; state-changing commands still enforce their own gates.

## Technical Analysis Quality Bar

For **pre-development or architecture analysis**, cover:

- **Affected modules**: routes, commands, services, components, ownership boundaries
- **Data models**: API contracts, validation, migrations, backward compatibility, versioning
- **Security**: permissions, audit/logging, destructive operation risks, input validation
- **Integration**: external dependencies, feature flags, rollout/rollback, observability
- **Performance**: concurrency, caching, failure modes, recovery behavior
- **Test strategy**: unit, integration, e2e/manual, fixtures, regression surface, acceptance evidence
- **Implementation slicing**: how to break down the work, risks that should be reflected in spec/plan

## DocPath Integration

### Analysis Input
Use `docpath analyze` as the structured payload source:

```bash
docpath analyze --mode deep --content "<requirement>"
```

The returned `technical` and `risks` sections provide the mandatory structure.

### Analysis Output
Persist technical conclusions through DocPath:

```bash
docpath write-analysis --section technical --stdin
docpath write-analysis --section risks --stdin
```

### Role Context
Load engineering role profiles when deeper expertise is needed:

```bash
docpath roles context --role software-architect
docpath roles context --role software-engineer
docpath roles context --role qa-engineer
```

Use the **smallest relevant role**. Role output must land in analysis sections or deliverables, not stay in chat only.

### Deliverables
Render structured engineering artifacts:

```bash
docpath deliverables render --template architecture-brief --output .docpath/tasks/current/deliverables/architecture-brief.md
docpath deliverables render --template qa-report --output .docpath/tasks/current/deliverables/qa-report.md
docpath deliverables check
```

## Implementation Lifecycle

When implementing (not just analyzing), follow the DocPath execution lifecycle:

```bash
docpath agent enter              # Enter execution mode
docpath go --step <id>           # Atomically claim/start a plan step
# ... make changes, write tests ...
docpath agent step --step "<id>" --status done
docpath check                    # Run quality gates
docpath review                   # Review changes
docpath agent done               # Record completion
```

## Completion Gates

Before claiming implementation completion:

```bash
docpath check     # Runs build, tests, plan/breadcrumb validation
docpath review    # Review code changes
docpath agent done
```

Use `docpath agent done` as the final route when recommended—it records check/review/journal evidence and clears pending completion state.

## Boundaries

- Don't bypass the active plan or DocPath lifecycle commands
- Don't enter implementation mode for an analysis-only request
- Don't leave role or technical analysis only in chat—write durable evidence
- Don't hand-edit generated workspace files like `.docpath/workspace/current.md`
- Technical analysis ≠ permission to code—implementation requires spec/plan/go route
