# DocPath Review Skill: JavaScript

## Scope

Use this skill only when `docpath review` emits a Review Skill Router requirement
for `docpath-review-javascript`.

Review every file listed in the Router contract, not only changed diff lines.
Treat the CLI-provided scope, file set, and fingerprint as the review boundary.
Do not add or remove files by judgment; report boundary concerns as findings.

## Review Checklist

- Runtime correctness: control flow, async handling, thrown errors, promise
  handling, mutation, edge cases, and compatibility with supported Node/runtime
  versions.
- Data contracts: object shapes, optional fields, JSON parsing, schema changes,
  command inputs, and output stability.
- Security and safety: shell execution, filesystem paths, destructive writes,
  user-controlled input, escaping, and permission boundaries.
- Module boundaries: exported functions, side effects, dependency direction,
  initialization order, and backwards compatibility.
- Maintainability: duplicated logic, unclear branching, hidden global state,
  overly broad helpers, and testability.
- Tests: coverage for changed behavior, negative paths, CLI output contracts,
  and workflow gate semantics.

## Evidence Contract

Submit evidence through the CLI command from `review_skill_gate.requirements[]`.
Do not edit `.docpath/workspace/review.json` directly.

Evidence JSON must include:

```json
{
  "status": "pass",
  "files": ["src/example.js"],
  "findings": [],
  "summary": "Reviewed all required JavaScript files."
}
```

Allowed status values are `pass` and `fail`. Use `severity:error` findings for
blocking defects. A `pass` result must not contain `severity:error` findings.
