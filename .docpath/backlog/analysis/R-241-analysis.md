# Backlog Analysis: R-241 (Enforce structured decision brief validation and add plan go reminders)

## Background
Currently, the `decision_brief` in `spec.json` is represented as a plain string, which makes it harder for downstream components to parse structured details. We want to:
1. Validate that the Decision Brief contains `Problem`, `Options`, `Chosen`, and `Rationale` fields when required is true.
2. Store `decision_brief` as a structured object inside `spec.json`.
3. Add proactive reminders in `docpath plan` and `docpath go` to encourage developers to record their decisions.

## Proposed Strategy
1. Type `decision_brief` as `StructuredDecisionBrief` in `StructuredSpecDocument`.
2. Implement parsing logic `parseDecisionBrief(text: string)` to extract fields from markdown.
3. Validate fields in `validateSpecDocument` in `structured-docs.ts`.
4. Output prompts in `plan.ts` and `go.ts`.
