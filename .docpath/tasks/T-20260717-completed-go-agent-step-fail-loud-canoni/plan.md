## 执行计划

### S1: 梳理 completed 任务上 go/agent step 应 fail-loud 拒绝, 而非半执行污染 canonical breadcrumb
- [x] S1: 梳理 completed 任务上 go/agent step 应 fail-loud 拒绝, 而非半执行污染 canonical breadcrumb
- **描述**: 根据 spec 明确 FR-1: completed 任务上 go/agent step 应 fail-loud 拒绝, 而非半执行污染 canonical breadcrumb 的实现边界和验收口径。
- **验收条件**: AC-1: 当任务已处于 completed 状态时，执行 `docpath go` 应以非零状态码（fail-loud）退出，报错信息包含引导说明，且没有任何写入或状态更新。
- **依赖**: 无

### S2: 实现 completed 任务上 go/agent step 应 fail-loud 拒绝, 而非半执行污染 canonical breadcrumb
- [x] S2: 实现 completed 任务上 go/agent step 应 fail-loud 拒绝, 而非半执行污染 canonical breadcrumb
- **描述**: 在现有架构内完成 FR-1: completed 任务上 go/agent step 应 fail-loud 拒绝, 而非半执行污染 canonical breadcrumb 的代码与文档更新。
- **验收条件**: FR-1 completed 任务上 go/agent step 应 fail-loud 拒绝, 而非半执行污染 canonical breadcrumb 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 当任务已处于 completed 状态时，执行 `docpath go` 应以非零状态码（fail-loud）退出，报错信息包含引导说明，且没有任何写入或状态更新。；AC-2: 当任务已处于 completed 状态时，执行 `docpath agent step` 应以非零状态码（fail-loud）退出，报错信息包含引导说明，且没有任何写入或状态更新。；AC-3: 全套测试通过且新增针对 completed 任务拒绝推进的单元/端到端测试用例。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-280 与任务 T-20260717-completed-go-agent-step-fail-loud-canoni 建立双向关联
- **验收条件**: AC-1: 当任务已处于 completed 状态时，执行 `docpath go` 应以非零状态码（fail-loud）退出，报错信息包含引导说明，且没有任何写入或状态更新。；AC-2: 当任务已处于 completed 状态时，执行 `docpath agent step` 应以非零状态码（fail-loud）退出，报错信息包含引导说明，且没有任何写入或状态更新。；AC-3: 全套测试通过且新增针对 completed 任务拒绝推进的单元/端到端测试用例。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-280 与任务 T-20260717-completed-go-agent-step-fail-loud-canoni 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
