# Code Review Report

**时间**: 2026-06-16T06:44:24.894Z
scope: all
finding_scope: current_changes
**状态**: ✅ PASS
**文件**: 21
✅ 代码审查: 0 错误, 9 警告, 3 提示

- [WARN] src/commands/done.ts: 函数 doneCommand 过长 (54 行)，建议拆分
- [WARN] src/commands/runtime.ts: 函数 runCommand 过长 (56 行)，建议拆分
- [WARN] src/commands/start.ts: 函数 startCommand 过长 (61 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 selectCurrentFocus 过长 (53 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 loadAgentOutputContext 过长 (53 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 inferRouteFromContext 过长 (76 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 generateAgentOutput 过长 (129 行)，建议拆分
- [WARN] src/utils/git-staging.ts: 函数 stageRecommendedFiles 过长 (88 行)，建议拆分
- [WARN] tests/agent-lifecycle.test.mjs: 函数 mkExecWorkspace 过长 (84 行)，建议拆分
- [INFO] tests/check-review.test.mjs: L219: 未处理的 TODO: writeFileSync(join(cwd, 'todo.ts'), '// TODO handle follow-up\n');
- [INFO] tests/check-review.test.mjs: L239: 未处理的 TODO: writeFileSync(join(cwd, 'todo.ts'), '// TODO review current worktree\n');
- [INFO] tests/check-review.test.mjs: L253: 未处理的 TODO: writeFileSync(join(cwd, 'todo.ts'), '// TODO review evidence stays out of ADR\n'