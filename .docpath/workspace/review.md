# Code Review Report

**时间**: 2026-06-14T17:28:35.819Z
**文件**: 25

- [WARN] src/commands/backlog.ts: 函数 inspectBacklogItem 过长 (90 行)，建议拆分
- [WARN] src/commands/check.ts: 函数 validateTaskDocuments 过长 (54 行)，建议拆分
- [WARN] src/commands/check.ts: 函数 checkUiUxDesignGate 过长 (122 行)，建议拆分
- [WARN] src/commands/check.ts: 函数 checkContextIndexHealth 过长 (51 行)，建议拆分
- [WARN] src/commands/go.ts: 函数 goCommand 过长 (74 行)，建议拆分
- [WARN] src/commands/runtime.ts: 函数 runCommand 过长 (54 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 selectCurrentFocus 过长 (53 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 loadAgentOutputContext 过长 (51 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 inferRouteFromContext 过长 (60 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 generateAgentOutput 过长 (81 行)，建议拆分
- [WARN] tests/agent-lifecycle.test.mjs: 函数 mkExecWorkspace 过长 (84 行)，建议拆分
- [WARN] tests/backlog-journal.test.mjs: 函数 mkWorkspace 过长 (57 行)，建议拆分
- [INFO] tests/check-review.test.mjs: L200: 未处理的 TODO: writeFileSync(join(cwd, 'todo.ts'), '// TODO handle follow-up\n');
- [INFO] tests/check-review.test.mjs: L220: 未处理的 TODO: writeFileSync(join(cwd, 'todo.ts'), '// TODO review current worktree\n');
- [INFO] tests/check-review.test.mjs: L234: 未处理的 TODO: writeFileSync(join(cwd, 'todo.ts'), '// TODO review evidence stays out of ADR\n'
- [WARN] tests/handoff.test.mjs: 函数 mkWorkspace 过长 (62 行)，建议拆分
- [WARN] tests/handoff.test.mjs: 函数 mkPassingWorkspace 过长 (59 行)，建议拆分
- [WARN] src/utils/next-hint.ts: L35: 生产代码中的 console.log
- [WARN] src/utils/next-hint.ts: L36: 生产代码中的 console.log
- [WARN] src/utils/next-hint.ts: L37: 生产代码中的 console.log
- [WARN] tests/major-change-gate.test.mjs: 函数 spec 过长 (68 行)，建议拆分