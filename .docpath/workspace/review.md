# Code Review Report

**时间**: 2026-06-16T08:20:09.141Z
scope: all
finding_scope: mixed
current_diff: 0 errors, 0 warnings, 0 infos
baseline_or_whole_file: 0 errors, 11 warnings, 0 infos
**状态**: ✅ PASS
**文件**: 16
✅ 代码审查: 0 错误, 11 警告, 0 提示

- [WARN] src/commands/changes.ts: 函数 buildChangesReport 过长 (53 行)，建议拆分 (baseline_or_whole_file)
- [WARN] src/commands/changes.ts: 函数 renderAgentYaml 过长 (52 行)，建议拆分 (baseline_or_whole_file)
- [WARN] src/commands/changes.ts: 函数 renderHuman 过长 (64 行)，建议拆分 (baseline_or_whole_file)
- [WARN] src/commands/context.ts: 函数 contextCommand 过长 (98 行)，建议拆分 (baseline_or_whole_file)
- [WARN] src/commands/register/docs-install.ts: 函数 registerDocsInstallCommands 过长 (52 行)，建议拆分 (baseline_or_whole_file)
- [WARN] src/commands/reveal.ts: 函数 revealCommand 过长 (204 行)，建议拆分 (baseline_or_whole_file)
- [WARN] src/commands/runtime.ts: 函数 runCommand 过长 (56 行)，建议拆分 (baseline_or_whole_file)
- [WARN] src/utils/agent-output.ts: 函数 selectCurrentFocus 过长 (53 行)，建议拆分 (baseline_or_whole_file)
- [WARN] src/utils/agent-output.ts: 函数 loadAgentOutputContext 过长 (53 行)，建议拆分 (baseline_or_whole_file)
- [WARN] src/utils/agent-output.ts: 函数 inferRouteFromContext 过长 (76 行)，建议拆分 (baseline_or_whole_file)
- [WARN] src/utils/agent-output.ts: 函数 generateAgentOutput 过长 (140 行)，建议拆分 (baseline_or_whole_file)