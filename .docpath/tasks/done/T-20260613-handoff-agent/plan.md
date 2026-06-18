## 执行计划

### S1: 梳理 新增 `src/commands/prompt.ts`，导出 `promptAction(options)` 函数，支持 `--style omx` 参数（默认），复用 `src/utils/agent-output.ts` 的 `generateAgentOutput()` 和 `AgentOutput` 类型
- **描述**: 根据 spec 明确 新增 `src/commands/prompt.ts`，导出 `promptAction(options)` 函数，支持 `--style omx` 参数（默认），复用 `src/utils/agent-output.ts` 的 `generateAgentOutput()` 和 `AgentOutput` 类型 的实现边界和验收口径。
- **验收条件**: 命令可执行：`docpath prompt --style omx`
- **依赖**: 无

### S2: 实现 新增 `src/commands/prompt.ts`，导出 `promptAction(options)` 函数，支持 `--style omx` 参数（默认），复用 `src/utils/agent-output.ts` 的 `generateAgentOutput()` 和 `AgentOutput` 类型
- **描述**: 在现有架构内完成 新增 `src/commands/prompt.ts`，导出 `promptAction(options)` 函数，支持 `--style omx` 参数（默认），复用 `src/utils/agent-output.ts` 的 `generateAgentOutput()` 和 `AgentOutput` 类型 的代码与文档更新。
- **验收条件**: 新增 `src/commands/prompt.ts`，导出 `promptAction(options)` 函数，支持 `--style omx` 参数（默认），复用 `src/utils/agent-output.ts` 的 `generateAgentOutput()` 和 `AgentOutput` 类型 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证门禁并归档
- **描述**: 运行相关测试、docpath check/review/journal，完成任务归档。
- **验收条件**: 质量门禁通过，任务状态进入 completed。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
