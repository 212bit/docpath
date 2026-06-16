# Compact Output Contract

## Purpose

Reduce default token cost for high-frequency DocPath agent commands while
preserving fail-loud diagnostics and explicit expansion paths.

This task must not change state-machine semantics, gate requirements, canonical
evidence rules, or JSON truth sources. It changes only default rendering and
routing priority for low-value informational noise.

## Lifecycle Decision

This task must use the standard lifecycle, not `quick`.

- Mechanical result: `docpath quick` would allow task creation when the current
  workflow phase is `idle` or `completed`.
- Governance result: this task changes workflow and Agent behavior, including
  CLI output contracts, document index presentation, and completed-state routing.
  That is outside quick boundaries.
- Required behavior: keep full spec, plan, check, review, and journal gates.

## Output Modes

### Compact Default

Default agent-facing output should include only fields needed for the next
action, commit readiness, or document selection.

Applies to:

- `docpath next --agent`
- `docpath status --agent`
- `docpath changes --agent`
- `docpath context`
- `docpath reveal`
- `docpath docs list`

Rules:

- Omit empty diagnostic collections.
- Collapse healthy subsystems to a short status.
- Prefer counts over full lists when the list is not immediately actionable.
- Show detailed file lists only when there is work to do.
- Keep suggested next command and exit criteria visible.

### Automatic Expansion

Default output must expand when the user or agent needs actionable diagnostics.

Expand when:

- plan/breadcrumb drift is present
- task identity drift is present
- install health fails or warns
- canonical ignored evidence exists
- worktree contains staged, unstaged, or untracked files
- check/review evidence is missing or failing
- explicit topic/task document selection is requested

### Explicit Diagnostic Modes

Detailed output remains available through existing or new explicit modes.

Allowed expansion surfaces:

- `--json` for automation and full machine detail
- `--verbose` for human diagnostic detail
- `--full` for full human document index output
- `--topic`, `--task-id`, and `--include-archive` for document body expansion

## Command Contracts

### `next --agent` and `status --agent`

Compact healthy output should include:

- route identity: `agent_view`, `agent_contract`
- workflow state: `state`, `phase`, `gate`, `workflow_profile`
- task identity: `task_id`, `task_title`
- route: `next_action`, `recommended_command`, `exit_criteria`
- required files and must-update paths for the current route
- progress counts
- health summaries as compact values

Conditional fields:

- `drift_details`: include only when drift exists
- `identity_drift_details`: include only when identity drift exists
- `lesson_summary.pending_keys`: include only in verbose/diagnostic output or
  when keys are required for an immediate command
- `install_health.issue_ids`: include only when install health is not passed
- `current_focus`: include only when it adds information not already present in
  route/progress fields

Healthy install summary:

```yaml
install_health:
  passed: true
```

Low-value lesson behavior:

- Low-value lesson candidates should not dominate completed-state routing.
- If all pending lesson candidates would be archived or skipped by `learn`,
  completed-state routing may continue to backlog/closeout guidance.
- `learn --dry-run` remains available for explicit review.

### `changes --agent`

Compact clean output should include:

```yaml
ready_to_commit: false
worktree: clean
canonical_evidence: ok
alias_evidence_ignored: <count>
blocking_reasons:
  - 当前工作树没有可提交变更
```

Automatic expansion is required when:

- any changed file exists
- canonical ignored evidence exists
- worktree isolation is active and has expected noise
- last check or review evidence is missing/failing

Expanded output must still include:

- grouped changed files
- canonical evidence paths and add/stage recommendation
- blocking reasons
- suggested commit message

### `docs list`

Default output should be a compact human summary, not the full generated table.

Default summary should include:

- total docs
- default_read docs and token estimate
- archive docs
- generated/index-only docs
- top high-signal entries, capped to a small number
- instruction for full output

Full table output must require an explicit flag such as `--full`.

### `context` and `reveal`

Default document index summaries should prioritize selection guidance over
metadata exhaustiveness.

Default index entry format should include at most:

- `path`
- compact flags
- `tokens`
- `summary` when useful

Avoid repeating equivalent booleans such as both `index_only` and
`budget_excluded`.

Default entry caps:

- `context`: no more than 5 entries without explicit selection
- `reveal --level 2`: no more than 5 entries without explicit selection
- `reveal --level 3`: may show more, but should still prefer compact rows

When `--topic`, `--task-id`, or `--include-archive` is used, the command may
show matching entries and body snippets within the existing token budget.

## Test Contract

Update or add tests to cover:

- healthy `next --agent` omits empty drift and identity details
- healthy `next/status --agent` collapses install health
- low-value lesson candidates do not steal the completed route
- `changes --agent` clean state uses compact output
- `changes --agent` dirty/canonical-evidence states still expand
- `docs list` default does not print the full table
- full/verbose/json paths preserve diagnostic detail
- `context` and `reveal` compact document index fields and entry caps

## Non-Goals

- Do not remove `.docpath/docs-index.json`.
- Do not remove canonical task evidence.
- Do not change check/review/journal gate policy.
- Do not delete historical task directories or workspace logs.
- Do not make quick profile apply to workflow or Agent behavior changes.
