# R-252 Analysis: review drift repair guidance

## Requirements

`docpath review` should not continue as if review scope is authoritative when the
active task has `spec.md` / `spec.json` or `plan.md` / `plan.json` structured
truth drift. The command should provide the same actionable repair guidance that
`next --agent` exposes.

## Technical Scope

The existing structured drift primitive is
`detectStructuredMarkdownHashDrift(dir, file)` in `src/utils/structured-docs.ts`.
It already formats repair guidance through `formatStructuredMarkdownHashDrift()`,
including:

- `docpath write-spec --stdin` when Markdown is the intended new spec truth.
- `docpath write-plan --stdin` when Markdown is the intended new plan truth.
- `docpath render --view spec|plan` when JSON truth should re-render Markdown.

Recommended implementation:

- Add a review preflight before collecting changed files.
- Check canonical active task directory first for `spec.md` and `plan.md` drift.
- If drift exists, fail loud with a concise message and the formatted repair
  guidance.
- Keep review read-only; do not implement `review --fix-drift` in this task.

## Non-goals

- Do not add a new drift repair implementation to review.
- Do not change the `check --fix-drift` behavior.
- Do not change the truth source model: `spec.json` / `plan.json` remain machine
  truth and `write-spec` / `write-plan` remain sync sinks.

## Acceptance

- A review run with stale `spec.md` and current `spec.json` exits non-zero before
  review findings.
- The output includes `机器真理源不同步` and an actionable `docpath write-spec
  --stdin` or `docpath render --view spec` repair hint.
- Existing clean review behavior remains unchanged.
