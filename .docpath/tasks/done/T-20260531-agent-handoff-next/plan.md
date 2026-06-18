## 执行计划

### S1: 明确 handoff 当前实现与设计目标的差距
- [x] S1: 明确 handoff 当前实现与设计目标的差距
- **描述**: 梳理 `compact-context.md` 现有结构、handoff 测试和设计文档 G6.1 的要求，确认需要固化的恢复字段与断言边界。
- **验收条件**: 差距、目标结构和测试覆盖范围明确，可直接指导实现。
- **依赖**: 无

### S2: 增强 handoff 结构并补回归测试
- [x] S2: 增强 handoff 结构并补回归测试
- **描述**: 调整 `compact-context.md` 输出结构，使其明确展示状态、目标、进度、失败证据、next route 与必读文件，并更新 handoff 测试。
- **验收条件**: handoff 文件结构稳定、next route 清晰可执行，测试可阻止退化。
- **依赖**: S1

### S3: 串行回归验证并完成 DocPath 闭环
- [x] S3: 串行回归验证并完成 DocPath 闭环
- **描述**: 串行执行构建、目标 handoff 测试与全量测试，并通过 `docpath check` / `docpath agent done` 完成流程闭环。
- **验收条件**: `pnpm build`、目标测试、`pnpm test` 全绿，DocPath 状态回到 completed。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
