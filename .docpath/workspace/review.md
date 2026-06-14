# Code Review Report

**时间**: 2026-06-14T02:14:33.644Z
**文件**: 17

- [WARN] src/commands/changes.ts: 函数 buildChangesReport 过长 (51 行)，建议拆分
- [WARN] src/commands/check.ts: 函数 validateTaskDocuments 过长 (54 行)，建议拆分
- [WARN] src/commands/check.ts: 函数 checkUiUxDesignGate 过长 (122 行)，建议拆分
- [WARN] src/commands/check.ts: 函数 checkContextIndexHealth 过长 (51 行)，建议拆分
- [WARN] src/commands/tasks.ts: 函数 tasksCommand 过长 (52 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 selectCurrentFocus 过长 (53 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 generateAgentOutput 过长 (67 行)，建议拆分
- [WARN] src/utils/structured-docs.ts: 函数 renderSpecMarkdownFromDocument 过长 (59 行)，建议拆分
- [WARN] src/utils/task-files.ts: 函数 detectActiveTaskFileDrift 过长 (52 行)，建议拆分
- [INFO] tests/check-review.test.mjs: L189: 未处理的 TODO: writeFileSync(join(cwd, 'todo.ts'), '// TODO handle follow-up\n');
- [INFO] tests/check-review.test.mjs: L209: 未处理的 TODO: writeFileSync(join(cwd, 'todo.ts'), '// TODO review current worktree\n');
- [INFO] tests/check-review.test.mjs: L222: 未处理的 TODO: writeFileSync(join(cwd, 'todo.ts'), '// TODO review evidence stays out of ADR\n'