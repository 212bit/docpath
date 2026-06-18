## 执行计划

### S1: 明确 go 收尾模式的命令语义
- [x] S1: 明确 go 收尾模式的命令语义
- **描述**: 梳理 `go --status done|skipped|blocked` 的输入参数、默认目标步骤选择、breadcrumb 记录和与现有预览模式的边界。
- **验收条件**: 命令入口、状态映射和兼容行为明确，可直接支撑实现与测试。
- **依赖**: 无

### S2: 实现 go 收尾并同步 plan/breadcrumb
- [x] S2: 实现 go 收尾并同步 plan/breadcrumb
- **描述**: 扩展 `go` 命令与 CLI 注册，支持显式收尾步骤并调用现有 plan 同步逻辑，确保 plan 与 breadcrumb 一致。
- **验收条件**: `go --step S1 --status done|skipped|blocked` 能正确更新 breadcrumb、plan 和工作流状态。
- **依赖**: S1

### S3: 补测试并回归验证
- [x] S3: 补测试并回归验证
- **描述**: 为 `go --status` 的 done/skipped/blocked 路径补 CLI 测试，串行执行构建、目标测试与全量测试。
- **验收条件**: 新增测试通过，`pnpm test` 全绿。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
