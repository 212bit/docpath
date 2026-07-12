## 执行计划

### S1: 梳理 新任务启动时，任务身份和 canonical 任务目录必须能从单一入口稳定绑定，避免写入 spec 后仍停留在半绑定状态。
- [x] S1: 梳理 新任务启动时，任务身份和 canonical 任务目录必须能从单一入口稳定绑定，避免写入 spec 后仍停留在半绑定状态。
- **描述**: 根据 spec 明确 FR-1: 新任务启动时，任务身份和 canonical 任务目录必须能从单一入口稳定绑定，避免写入 spec 后仍停留在半绑定状态。 的实现边界和验收口径。
- **验收条件**: AC-1: 新任务在 spec 写入后能稳定绑定 canonical task_id，不再停留在半绑定状态。
- **依赖**: 无

### S2: 实现 新任务启动时，任务身份和 canonical 任务目录必须能从单一入口稳定绑定，避免写入 spec 后仍停留在半绑定状态。
- [x] S2: 实现 新任务启动时，任务身份和 canonical 任务目录必须能从单一入口稳定绑定，避免写入 spec 后仍停留在半绑定状态。
- **描述**: 在现有架构内完成 FR-1: 新任务启动时，任务身份和 canonical 任务目录必须能从单一入口稳定绑定，避免写入 spec 后仍停留在半绑定状态。 的代码与文档更新。
- **验收条件**: FR-1 新任务启动时，任务身份和 canonical 任务目录必须能从单一入口稳定绑定，避免写入 spec 后仍停留在半绑定状态。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 dirty guard 在进入执行步骤时能区分“当前任务相关的工作区变更”和“与当前任务无关的脏文件”，只对后者继续拦截。
- [x] S3: 实现 FR-2 dirty guard 在进入执行步骤时能区分“当前任务相关的工作区变更”和“与当前任务无关的脏文件”，只对后者继续拦截。
- **描述**: 在现有架构内完成 FR-2: dirty guard 在进入执行步骤时能区分“当前任务相关的工作区变更”和“与当前任务无关的脏文件”，只对后者继续拦截。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 `go`/`agent enter`/相关恢复路径在拒绝时给出更具体的恢复建议，明确何时应使用 `go --step`、何时应使用 `run start`、何时需要清理 dirty worktree。
- [x] S4: 实现 FR-3 `go`/`agent enter`/相关恢复路径在拒绝时给出更具体的恢复建议，明确何时应使用 `go --step`、何时应使用 `run start`、何时需要清理 dirty worktree。
- **描述**: 在现有架构内完成 FR-3: `go`/`agent enter`/相关恢复路径在拒绝时给出更具体的恢复建议，明确何时应使用 `go --step`、何时应使用 `run start`、何时需要清理 dirty worktree。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 增加回归测试覆盖新任务启动、dirty guard specificity、恢复提示以及相关 failure path。
- [x] S5: 实现 FR-4 增加回归测试覆盖新任务启动、dirty guard specificity、恢复提示以及相关 failure path。
- **描述**: 在现有架构内完成 FR-4: 增加回归测试覆盖新任务启动、dirty guard specificity、恢复提示以及相关 failure path。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 验证验收标准
- [x] S6: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 新任务在 spec 写入后能稳定绑定 canonical task_id，不再停留在半绑定状态。；AC-2: dirty guard 对当前任务相关改动与无关脏文件的处理差异化，避免把当前任务有效改动误判为新任务启动风险。；AC-3: `go`/`agent enter`/恢复提示在被拒绝时给出明确恢复路径，能区分 `go --step`、`run start` 和 worktree 清理建议。；AC-4: 目标测试与全量测试通过，`docpath check` 和 `docpath review` 通过。
- **验收条件**: AC-1: 新任务在 spec 写入后能稳定绑定 canonical task_id，不再停留在半绑定状态。；AC-2: dirty guard 对当前任务相关改动与无关脏文件的处理差异化，避免把当前任务有效改动误判为新任务启动风险。；AC-3: `go`/`agent enter`/恢复提示在被拒绝时给出明确恢复路径，能区分 `go --step`、`run start` 和 worktree 清理建议。；AC-4: 目标测试与全量测试通过，`docpath check` 和 `docpath review` 通过。
- **依赖**: S5

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6
