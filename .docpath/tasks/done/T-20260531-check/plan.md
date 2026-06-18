## 执行计划

### S1: 明确 check_fail 与 TDD 恢复语义
- [x] S1: 明确 check_fail 与 TDD 恢复语义
- **描述**: 梳理 `check_fail` 场景下 TDD/非 TDD 的推荐差异、所需上下文文件和不应回归的 blocked/debug 行为。
- **验收条件**: 分支边界、命令推荐和测试场景明确，可直接指导实现。
- **依赖**: 无

### S2: 为 next --agent 增加 TDD 感知恢复路由
- [x] S2: 为 next --agent 增加 TDD 感知恢复路由
- **描述**: 在 `check_fail` 路由中读取 `workspace/tdd-state.json`，对活跃 TDD check 阶段优先推荐 `docpath tdd next`，其余场景保持 debug 兜底。
- **验收条件**: TDD/非 TDD 场景推荐正确，blocked/debug 现有语义不回归。
- **依赖**: S1

### S3: 补测试并回归验证
- [x] S3: 补测试并回归验证
- **描述**: 为 `check_fail` 的 TDD/非 TDD 两类恢复路由补测试，并串行执行构建、目标测试与全量测试。
- **验收条件**: 新增测试通过，`pnpm build`、目标测试、`pnpm test` 全绿。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
