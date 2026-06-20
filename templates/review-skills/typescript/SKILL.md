# DocPath Review Skill: TypeScript

## Scope

Use this skill only when `docpath review` emits a Review Skill Router requirement
for `docpath-review-typescript`.

Review every file listed in the Router contract, not only changed diff lines.
Treat the CLI-provided scope, file set, and fingerprint as the review boundary.
Do not add or remove files by judgment; report boundary concerns as findings.

## Review Checklist

- Type safety: unsafe `any`, missing narrowing, unchecked nullable values,
  unsafe casts, generic constraints, and public API type regressions.
- Runtime behavior: async error handling, state mutation, ordering, concurrency,
  resource cleanup, and edge cases around empty or malformed inputs.
- Module contracts: exported types/functions, command options, schema changes,
  backwards compatibility, and call-site expectations.
- Security and safety: path handling, shell execution, file writes, destructive
  operations, user-controlled input, and permission boundaries.
- Maintainability: duplicated logic, unclear ownership, overly broad helpers,
  hidden coupling, and testability.
- Tests: coverage for changed behavior, negative paths, schema validation, and
  workflow gate semantics.

## Evidence Contract

Submit evidence through the CLI command from `review_skill_gate.requirements[]`.
Do not edit `.docpath/workspace/review.json` directly.

Evidence JSON must include:

```json
{
  "status": "pass",
  "files": ["src/example.ts"],
  "findings": [],
  "summary": "Reviewed all required TypeScript files."
}
```

Allowed status values are `pass` and `fail`. Use `severity:error` findings for
blocking defects. A `pass` result must not contain `severity:error` findings.
