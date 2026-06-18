## 执行计划

### S1: 明确 status --agent 漂移摘要的数据契约
- [x] S1: 明确 status --agent 漂移摘要的数据契约
- **描述**: 梳理 plan/breadcrumb 漂移在 agent YAML 中的字段形态、何时出现、与现有 next_action/recommended_command 的关系。
- **验收条件**: 漂移摘要字段、空值策略和兼容边界明确，可直接指导实现与测试。
- **依赖**: 无

### S2: 在 agent 输出中加入漂移摘要
- [x] S2: 在 agent 输出中加入漂移摘要
- **描述**: 扩展 `generateAgentOutput()` 的输出结构，将 plan/breadcrumb 漂移明细以机器可读字段附加到 `status --agent` 和复用它的命令中。
- **验收条件**: 有漂移时输出具体 step 列表和摘要，无漂移时字段稳定且不误报。
- **依赖**: S1

### S3: 补测试并回归验证
- [x] S3: 补测试并回归验证
- **描述**: 为 `status --agent` 的漂移摘要补测试，并串行执行构建、目标测试与全量测试。
- **验收条件**: 新增测试通过，`pnpm test` 全绿。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
