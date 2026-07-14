## 执行计划

### S1: 梳理 write-spec --stdin 成功写入后误报未预期错误，退出码 1 误导 agent
- [x] S1: 梳理 write-spec --stdin 成功写入后误报未预期错误，退出码 1 误导 agent
- **描述**: 根据 spec 明确 FR-1: write-spec --stdin 成功写入后误报未预期错误，退出码 1 误导 agent 的实现边界和验收口径。
- **验收条件**: AC-1: write-spec 在文件写入成功后，若后续状态转换/next 计算失败，不得以退出码 1 结束；应打印明确警告并退出 0（或独立的非致命退出码），保留成功信号。
- **依赖**: 无

### S2: 实现 write-spec --stdin 成功写入后误报未预期错误，退出码 1 误导 agent
- [x] S2: 实现 write-spec --stdin 成功写入后误报未预期错误，退出码 1 误导 agent
- **描述**: 在现有架构内完成 FR-1: write-spec --stdin 成功写入后误报未预期错误，退出码 1 误导 agent 的代码与文档更新。
- **验收条件**: FR-1 write-spec --stdin 成功写入后误报未预期错误，退出码 1 误导 agent 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: write-spec 在文件写入成功后，若后续状态转换/next 计算失败，不得以退出码 1 结束；应打印明确警告并退出 0（或独立的非致命退出码），保留成功信号。；AC-2: 顶层 catch 对"成功后继步骤失败"应区分于"写入本身失败"，给出具体错误信息（哪个后续步骤、为什么），而非笼统的"未预期的错误"。；AC-3: 回归: 构造一个 transitionWorkflow 会抛错的场景，确认 write-spec 退出码为 0 且 spec.md 已写入、日志含成功 + 警告两段。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-248 与任务 T-20260706-write-spec-stdin-1-agent 建立双向关联
- **验收条件**: AC-1: write-spec 在文件写入成功后，若后续状态转换/next 计算失败，不得以退出码 1 结束；应打印明确警告并退出 0（或独立的非致命退出码），保留成功信号。；AC-2: 顶层 catch 对"成功后继步骤失败"应区分于"写入本身失败"，给出具体错误信息（哪个后续步骤、为什么），而非笼统的"未预期的错误"。；AC-3: 回归: 构造一个 transitionWorkflow 会抛错的场景，确认 write-spec 退出码为 0 且 spec.md 已写入、日志含成功 + 警告两段。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-248 与任务 T-20260706-write-spec-stdin-1-agent 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [ ] S3

## 依赖关系图
S1 → S2 → S3
