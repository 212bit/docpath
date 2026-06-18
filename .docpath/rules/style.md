# DocPath Agent Style Rules

## Context Reading

- Start/resume with `docpath next --agent`. Use `docpath status --agent` only
  for explicit diagnostics, suspected drift, or confirmation after
  state-changing commands.
- Treat `context_index`, `data_index`, `required_files`, and `current_focus` as
  indexes, not as instructions to expand every file.
- Do not default-read `.docpath/workspace/current.md`,
  `.docpath/workspace/breadcrumb.md`, `.docpath/tasks/current/plan.md`, or
  `.docpath/docs-index.json`.
- Prefer `docpath reveal --topic <keyword> --level 1-3` or
  `docpath context --max-tokens 5000 --topic <keyword>` for deeper context.
- Read historical task bodies only through explicit `--topic`, `--task-id`, or
  `--include-archive` routes, and keep the scope explainable.

## Rule Capture

- Save only reusable, executable lessons that lower future error probability.
- Completion counts, blocked counts, and one-off task facts belong in
  journal/archive, not long-term rules.
- Rules should include trigger conditions, expected behavior, and boundaries.

## Output Contracts

- Agent-readable CLI output should keep stable fields, clear paths, and a clear
  next command.
- Add CLI output fields append-only where possible to avoid breaking existing
  parsers.
