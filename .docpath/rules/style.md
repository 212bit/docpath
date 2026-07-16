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

## gotcha: 手改 spec.md 后用 write-spec --stdin 重同步会把 phase 重置回 drafting
- rationale: write-spec 落盘触发 task.created 转移 (from 含 executing)，勾选验收复选框这类小编辑经 --stdin 重同步后任务从 executing 回退 drafting；其提示的 recover check 并不适用 (recover 仅限 blocked 步骤)。
触发: executing 阶段编辑 spec.md (含仅勾复选框) 且 agent step 提示 content_sha256 不同步。期望行为: 用 write-spec --stdin 重同步后，立即用 docpath run start --step <当前步> 记录归属并合法回到 executing (step.started 的宽松 from 即为漂移恢复设计)，再 agent step done + check。边界: 不适用于任务身份漂移 (heading/task_id 变化)，那类必须走 restore/reset/capture/promote。
### Evidence
- T-20260715-docpath-init-scan-existing S8: write-spec 后 phase=drafting, run start --step S8 恢复
- src/engine/transitions.ts:72-74 from 列表

## gotcha: check 通过后 next_hint 必须读 gate=check_pass，不能再走 allPlanDone→check
- rationale: 仅看 plan 全完成会在 check 已通过时仍推荐 plan/check，与正文 review 分叉
触发: phase=checking gate=check_pass 且 plan 全完成。期望: recommended_command=docpath review（或 profile 等价）。边界: plan/breadcrumb drift 与 blocked 仍可优先。
### Evidence
- src/utils/agent-output/formatters.ts
- tests/next.test.mjs
