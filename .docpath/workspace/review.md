# Code Review Report

**时间**: 2026-06-15T09:17:43.012Z
**状态**: ✅ PASS
**文件**: 27
✅ 代码审查: 0 错误, 24 警告, 3 提示

- [WARN] src/commands/check.ts: 函数 validateTaskDocuments 过长 (54 行)，建议拆分
- [WARN] src/commands/check.ts: 函数 checkUiUxDesignGate 过长 (122 行)，建议拆分
- [WARN] src/commands/check.ts: 函数 checkContextIndexHealth 过长 (51 行)，建议拆分
- [WARN] src/commands/context.ts: 函数 contextCommand 过长 (98 行)，建议拆分
- [WARN] src/commands/runtime.ts: 函数 runCommand 过长 (54 行)，建议拆分
- [WARN] src/commands/tdd.ts: 函数 tddNext 过长 (52 行)，建议拆分
- [WARN] src/governance/continuation.ts: L105: 生产代码中的 console.log
- [WARN] src/governance/continuation.ts: L106: 生产代码中的 console.log
- [WARN] src/governance/continuation.ts: L109: 生产代码中的 console.log
- [WARN] src/governance/continuation.ts: L110: 生产代码中的 console.log
- [WARN] src/governance/continuation.ts: L114: 生产代码中的 console.log
- [WARN] src/governance/continuation.ts: L115: 生产代码中的 console.log
- [WARN] src/governance/continuation.ts: L118: 生产代码中的 console.log
- [WARN] src/governance/continuation.ts: 函数 analyzeContinuation 过长 (69 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 selectCurrentFocus 过长 (53 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 loadAgentOutputContext 过长 (53 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 inferRouteFromContext 过长 (76 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 generateAgentOutput 过长 (117 行)，建议拆分
- [WARN] src/utils/context-index.ts: 函数 buildHybridContextIndex 过长 (77 行)，建议拆分
- [WARN] src/utils/disclosure.ts: L193: 生产代码中的 console.log
- [WARN] src/utils/disclosure.ts: 函数 collectDisclosureItems 过长 (76 行)，建议拆分
- [WARN] src/utils/structured-docs.ts: 函数 renderSpecMarkdownFromDocument 过长 (59 行)，建议拆分
- [WARN] tests/agent-lifecycle.test.mjs: 函数 mkExecWorkspace 过长 (84 行)，建议拆分
- [INFO] tests/check-review.test.mjs: L219: 未处理的 TODO: writeFileSync(join(cwd, 'todo.ts'), '// TODO handle follow-up\n');
- [INFO] tests/check-review.test.mjs: L239: 未处理的 TODO: writeFileSync(join(cwd, 'todo.ts'), '// TODO review current worktree\n');
- [INFO] tests/check-review.test.mjs: L253: 未处理的 TODO: writeFileSync(join(cwd, 'todo.ts'), '// TODO review evidence stays out of ADR\n'
- [WARN] tests/render.test.mjs: 函数 mkJsonOnlyWorkspace 过长 (107 行)，建议拆分