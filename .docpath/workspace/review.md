# Code Review Report

**时间**: 2026-06-15T08:29:33.466Z
**文件**: 25

- [WARN] src/commands/backlog.ts: 函数 inspectBacklogItem 过长 (90 行)，建议拆分
- [WARN] src/commands/brainstorm.ts: 函数 buildSpecDraftSection 过长 (84 行)，建议拆分
- [WARN] src/commands/check.ts: 函数 validateTaskDocuments 过长 (54 行)，建议拆分
- [WARN] src/commands/check.ts: 函数 checkUiUxDesignGate 过长 (122 行)，建议拆分
- [WARN] src/commands/check.ts: 函数 checkContextIndexHealth 过长 (51 行)，建议拆分
- [WARN] src/commands/diff.ts: L104: 使用了 any 类型
- [WARN] src/commands/diff.ts: 函数 diffCommand 过长 (90 行)，建议拆分
- [WARN] src/commands/go.ts: 函数 goCommand 过长 (74 行)，建议拆分
- [WARN] src/commands/stats.ts: 函数 statsCommand 过长 (108 行)，建议拆分
- [WARN] src/commands/tdd.ts: 函数 tddNext 过长 (55 行)，建议拆分
- [WARN] src/engine/escalation.ts: 函数 fuseSignals 过长 (58 行)，建议拆分
- [WARN] src/governance/decisions.ts: 函数 gcDecisions 过长 (60 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 selectCurrentFocus 过长 (53 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 loadAgentOutputContext 过长 (53 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 inferRouteFromContext 过长 (76 行)，建议拆分
- [WARN] src/utils/agent-output.ts: 函数 generateAgentOutput 过长 (117 行)，建议拆分
- [WARN] src/utils/context.ts: L140: 生产代码中的 console.log
- [WARN] src/utils/context.ts: L149: 生产代码中的 console.log
- [WARN] src/utils/context.ts: L153: 生产代码中的 console.log
- [WARN] src/utils/context.ts: L154: 生产代码中的 console.log
- [WARN] src/utils/context.ts: L155: 生产代码中的 console.log
- [WARN] src/utils/context.ts: L156: 生产代码中的 console.log
- [WARN] src/utils/context.ts: L159: 生产代码中的 console.log
- [WARN] src/utils/detect.ts: L112: 使用了 any 类型
- [WARN] src/utils/detect.ts: L145: 使用了 any 类型
- [WARN] src/utils/detect.ts: 函数 detectMonorepo 过长 (64 行)，建议拆分
- [WARN] src/utils/workspace-cleanup.ts: 函数 planCheckHistory 过长 (51 行)，建议拆分
- [WARN] src/utils/workspace-cleanup.ts: 函数 planBreadcrumb 过长 (71 行)，建议拆分