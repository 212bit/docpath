# R-262 Analysis: changes --agent task-aware grouping

## Requirements

R-262 should make `docpath changes --agent` useful when one git worktree contains
changes from more than one task. The command remains read-only: it should not
stage, commit, mutate task state, or infer ownership silently. It should expose
enough grouping information for an agent to create separate commits with the
right task identity.

Required behavior:

- Current-task mode continues to work for ordinary closeout.
- Canonical task evidence under `.docpath/tasks/<task_id>/` is recognized as
  belonging to that task, not generically assigned to the active task title.
- Files outside the selected task evidence boundary are listed separately and
  marked as possibly outside the current task.
- `--task <id>` lets an agent request a closeout view for a non-current task.
- `--scope <file-list>` lets an agent ask for a report over an explicit file
  set without changing the underlying git status.

## Product / Workflow Impact

This targets agent closeout reliability. The user value is fewer mixed commits
and fewer manual commit-message corrections after parallel worktree or recovery
sessions. It should complement, not replace, the existing `docpath changes
--agent` readiness checks.

The command should keep the current YAML shape stable and add append-only fields
where possible. Existing consumers that read `groups`, `ready_to_commit`,
`blocking_reasons`, and `suggested_commit_message` should continue to work.

## Technical Analysis

Primary implementation location is `src/utils/changes-report.ts`; `src/commands/changes.ts`
should stay mostly a renderer/CLI option adapter.

Existing facts:

- `ChangesReportOptions` currently only accepts `since`.
- `buildChangesReport()` reads the current state and all git changes, then
  classifies files by coarse groups: source, tests, docpath, templates_docs,
  other.
- Worktree isolation already splits expected `.docpath` noise from
  commit-relevant files.
- Dirty worktree utilities from R-249 already distinguish DocPath-managed paths
  from business files; R-262 should reuse the same boundary concept instead of
  adding a second unrelated classifier.

Recommended design:

- Add `task?: string` and `scope?: string[]` to `ChangesReportOptions`.
- Keep git collection unchanged by default.
- When `scope` is present, filter the changed file list to exact normalized
  repo-relative paths and annotate the report mode or a new `selection` field.
- When `task` is present, resolve task metadata from `.docpath/tasks/<task_id>/`
  where available, falling back to the task id for the title.
- Add task-aware grouping as an additive report section, e.g. `task_grouping`,
  with selected task files and outside-selected-task files.
- Treat `.docpath/tasks/<selected_task_id>/...` as selected task evidence.
  Treat `.docpath/tasks/<other_task_id>/...`, unrelated backlog rows, and
  ordinary source/test/doc files as outside-selected-task unless explicitly
  included by `--scope`.
- Let `suggested_commit_message` use the selected task title when `--task` is
  provided; keep current behavior without `--task`.

## Risks

- Over-inference risk: source/test files do not encode task ownership. The report
  must not claim they belong to a task unless selected explicitly or supported
  by current task closeout context.
- Output compatibility risk: existing agent consumers parse YAML fields. New
  fields should be append-only and existing fields should keep their meaning.
- Scope parsing risk: shell parsing for file lists can be ambiguous. Prefer a
  repeatable `--scope <path>` option or comma-separated parsing that is covered
  by tests.
- Review scope coupling: R-254/R-255 changed review scope behavior. R-262 should
  not alter review directly; it should provide stable upstream file selection
  that future review commands may consume.

## Acceptance Evidence To Add

- Unit/E2E tests for mixed current-task evidence plus unrelated files.
- Tests for `changes --agent --task <id>` using a non-current task directory.
- Tests for `changes --agent --scope <file>` limiting output to the selected
  file set.
- Regression test for the current single-task clean/ready closeout output.
