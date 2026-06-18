## 执行计划

### S1: 明确 skipped/blocked 与 plan 标记映射
- [x] S1: 明确 skipped/blocked 与 plan 标记映射
- **描述**: 梳理 `agent step --status skipped|blocked` 在 breadcrumb、plan checklist 和后续路由中的期望表现，确定不与现有 done 同步冲突。
- **验收条件**: skipped/blocked 的 plan 表示、非目标场景行为和测试边界明确。
- **依赖**: 无

### S2: 扩展 plan 同步逻辑以支持 skipped/blocked
- [x] S2: 扩展 plan 同步逻辑以支持 skipped/blocked
- **描述**: 调整 `plan-sync` 与 `agent step`，让 skipped/blocked 状态能同步到 plan，并保持 canonical/current 双写一致。
- **验收条件**: `agent step --status skipped|blocked` 后，plan 与 breadcrumb 不再因未同步而漂移。
- **依赖**: S1

### S3: 补测试并回归验证
- [x] S3: 补测试并回归验证
- **描述**: 为 skipped/blocked 的 plan 同步和漂移检查补测试，串行执行构建、目标测试与全量测试。
- **验收条件**: 新增测试通过，`pnpm test` 全绿。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
