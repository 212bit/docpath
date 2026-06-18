## 执行计划

### S1: 明确 stale pending-done 的统一触发语义
- [x] S1: 明确 stale pending-done 的统一触发语义
- **描述**: 梳理 stale warning 的触发前提、幂等边界，以及 `status` 与 `next --agent` 共享逻辑后的行为约束。
- **验收条件**: 触发条件、误报边界和测试场景明确，可直接指导实现。
- **依赖**: 无

### S2: 抽取共享 stale-warning 逻辑并接入 status
- [x] S2: 抽取共享 stale-warning 逻辑并接入 status
- **描述**: 抽取 stale `pending-done` 检测与 breadcrumb warning 逻辑，供 `status` 与 `generateAgentOutput()` 复用，并保持 existing route 不回归。
- **验收条件**: `status` 和 `next --agent` 对 stale 哨兵行为一致，warning 只写一次。
- **依赖**: S1

### S3: 补测试并回归验证
- [x] S3: 补测试并回归验证
- **描述**: 为 `status` stale warning、幂等行为和 `next --agent` 回归补测试，并串行执行构建、目标测试与全量测试。
- **验收条件**: 新增测试通过，`pnpm build`、目标测试、`pnpm test` 全绿。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
