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

## gotcha: check 自动刷新的 docs-index/docs.md 应视为 execution-start 可放行路径
- rationale: 否则 check→go 串联互绊
触发: check 自动刷新 docs-index 后 go/agent enter。期望: dirty guard 放行这两文件。边界: 业务源码脏文件仍阻断。
### Evidence
- src/utils/git-dirty-guard.ts

## gotcha: 会话中断时用 workspace/wip-note.md 记录未验证改动，不要用 breadcrumb done 伪步骤
- rationale: breadcrumb done 会与 plan 漂移检测冲突
触发: agent enter（in_progress+dirty）或 agent handoff。期望: 写 .docpath/workspace/wip-note.md。边界: 不改 plan checklist。
### Evidence
- src/commands/agent.ts
- tests/handoff.test.mjs

## common-mistake: 改动数据契约/共享模型前必须查最近一次用户确认的 ADR, 别信可能过时的 CLAUDE.md
- rationale: R-271 依据 CLAUDE.md 仍写着的 live-shared/gitignored 描述做实现, 但该描述早在 R-238 (用户确认翻回 Option B tracked) 时就已失真; R-271 决策简报未引用 R-238, 于是做出与最近用户裁定相反的实现并引入 P0。
触发: 任务涉及 backlog/tracking/共享/权限等数据或工作流契约。期望行为: 实现前 grep 决策日志 (workspace/decisions*.md) 与相关提交历史 (git log -S <契约关键词> -- .gitignore 等) 找最近一次用户确认的裁定; 文档 (CLAUDE.md/docs) 与代码/gitignore 冲突时以'最近用户确认 + 代码实际行为'为准, 并把文档漂移一并修正。边界: 冲突无法判定归属时停下问用户, 别照最顺手的文档执行。
### Evidence
- R-238 (7b3f9f0) 用户确认 Option B vs R-271 未引用
- 本任务 FR-4 同步修正 CLAUDE.md + docs/features/worktree-workflow.md 文档漂移
