## 执行计划

### S1: 明确 abort/reset 语义和命令边界
- [x] S1: 明确 abort/reset 语义和命令边界
- **描述**: 梳理当前任务状态机、任务文件归档、backlog 回填和 current 视图清理路径，确定 abort 与 reset 的最小可用语义。
- **验收条件**: 明确命令入口、状态归位、文件处理和 backlog 联动策略。
- **依赖**: 无

### S2: 实现 task abort/reset 命令
- [x] S2: 实现 task abort/reset 命令
- **描述**: 新增任务级命令，支持废弃当前任务并归档，或仅清空 current 视图并回到 idle。
- **验收条件**: 命令通过唯一状态写入口更新 workspace，安全处理 tasks/current、canonical 任务目录和 backlog 状态。
- **依赖**: S1

### S3: 补充回归测试并完成门禁
- [x] S3: 补充回归测试并完成门禁
- **描述**: 覆盖 abort/reset 的成功路径、空任务保护和文件归档行为，运行相关测试与质量检查。
- **验收条件**: 新增测试通过，`docpath check` 通过，任务可进入 review/journal。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
