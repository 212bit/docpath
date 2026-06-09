---
name: docpath-software
description: Software engineering DocPath adapter for architecture, implementation, QA, tests, check, review, and journal evidence in Codex.
---

# DocPath Software

Use this skill for architecture, implementation, refactoring, tests, QA, debugging, or code review in a DocPath repository.

## First Commands

```bash
docpath status --agent
docpath next --agent
docpath agent enter
```

Follow the active task plan. If no active task exists, use the route from `docpath next --agent` instead of starting from memory.

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

Before claiming completion:

```bash
docpath check
docpath review
docpath agent done
```

Use `docpath agent done` as the final route because it records check/review/journal evidence and clears pending completion state.

## Boundaries

- Do not bypass the active plan or DocPath lifecycle commands.
- Do not leave role analysis only in chat; write durable evidence.
- Do not hand-edit generated workspace files such as `.docpath/workspace/current.md`.
