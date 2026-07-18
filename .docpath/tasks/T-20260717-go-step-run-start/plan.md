## 执行计划

### S1: 梳理 go --step 认领当前任务下一步被本任务自身脏文件拦截, 需 run start 绕行
- [x] S1: 梳理 go --step 认领当前任务下一步被本任务自身脏文件拦截, 需 run start 绕行
- **描述**: 根据 spec 明确 FR-1: go --step 认领当前任务下一步被本任务自身脏文件拦截, 需 run start 绕行 的实现边界和验收口径。
- **验收条件**: AC-1: 当且仅当在当前活跃任务的执行期（phase=executing）认领该任务的子步骤时，dirty guard 放行该任务范围内的脏文件。 * 在 worktree 模式下，放行工作区所有脏文件（含 untracked 文件，因为 worktree 本身是物理隔离的）。 * 在非 worktree 模式下，放行 tracked 脏文件，对不属于 task canonical 路径 of untracked 文件仍维持拦截，以防混入无关文件。 * 新启动任务或跨任务场景下（目标任务与当前活跃任务不一致，或当前无活跃任务），依然严格拦截所有脏文件。 * 补充对应单元测试验证上述行为。
- **依赖**: 无

### S2: 实现 go --step 认领当前任务下一步被本任务自身脏文件拦截, 需 run start 绕行
- [x] S2: 实现 go --step 认领当前任务下一步被本任务自身脏文件拦截, 需 run start 绕行
- **描述**: 在现有架构内完成 FR-1: go --step 认领当前任务下一步被本任务自身脏文件拦截, 需 run start 绕行 的代码与文档更新。
- **验收条件**: FR-1 go --step 认领当前任务下一步被本任务自身脏文件拦截, 需 run start 绕行 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 当且仅当在当前活跃任务的执行期（phase=executing）认领该任务的子步骤时，dirty guard 放行该任务范围内的脏文件。 * 在 worktree 模式下，放行工作区所有脏文件（含 untracked 文件，因为 worktree 本身是物理隔离的）。 * 在非 worktree 模式下，放行 tracked 脏文件，对不属于 task canonical 路径 of untracked 文件仍维持拦截，以防混入无关文件。 * 新启动任务或跨任务场景下（目标任务与当前活跃任务不一致，或当前无活跃任务），依然严格拦截所有脏文件。 * 补充对应单元测试验证上述行为。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-283 与任务 T-20260717-go-step-run-start 建立双向关联
- **验收条件**: AC-1: 当且仅当在当前活跃任务的执行期（phase=executing）认领该任务的子步骤时，dirty guard 放行该任务范围内的脏文件。 * 在 worktree 模式下，放行工作区所有脏文件（含 untracked 文件，因为 worktree 本身是物理隔离的）。 * 在非 worktree 模式下，放行 tracked 脏文件，对不属于 task canonical 路径 of untracked 文件仍维持拦截，以防混入无关文件。 * 新启动任务或跨任务场景下（目标任务与当前活跃任务不一致，或当前无活跃任务），依然严格拦截所有脏文件。 * 补充对应单元测试验证上述行为。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-283 与任务 T-20260717-go-step-run-start 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
