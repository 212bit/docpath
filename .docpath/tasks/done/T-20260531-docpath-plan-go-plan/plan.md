## 执行计划

### S1: 明确 plan→go 断点的文件契约与复现边界
- [x] S1: 明确 plan→go 断点的文件契约与复现边界
- **描述**: 梳理 `plan.ts`、`write-plan.ts`、`go.ts` 对 `.docpath/tasks/current/plan.md` 的依赖关系，明确当前失败路径和目标契约。
- **验收条件**: 断点成因、修复边界与测试场景明确，可直接指导实现。
- **依赖**: 无

### S2: 修复 plan 写入契约并补主路径回归测试
- [x] S2: 修复 plan 写入契约并补主路径回归测试
- **描述**: 修改 `docpath plan`，确保 active task plan alias 与 canonical plan 同步；补充“plan 后可直接 go”的自动化测试。
- **验收条件**: `plan` 与 `go` 的文件契约一致，测试可阻止该断点回归。
- **依赖**: S1

### S3: 串行回归验证并完成 DocPath 闭环
- [x] S3: 串行回归验证并完成 DocPath 闭环
- **描述**: 串行执行构建、目标测试与全量测试，并通过 `docpath check` / `docpath agent done` 完成流程闭环。
- **验收条件**: `pnpm build`、目标测试、`pnpm test` 全绿，DocPath 状态回到 completed。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
