## 执行计划

### S1: 明确 OpenCode 协议模板的漂移点与测试边界
- [x] S1: 明确 OpenCode 协议模板的漂移点与测试边界
- **描述**: 梳理 `templates/OPENCODE.md`、OpenCode install 输出与当前统一生命周期协议之间的差异，确定需要修正的命令语义和回归断言。
- **验收条件**: 漂移点、目标文案与测试覆盖边界明确，可直接指导修复。
- **依赖**: 无

### S2: 统一 OpenCode 协议文案并补安装回归测试
- [x] S2: 统一 OpenCode 协议文案并补安装回归测试
- **描述**: 更新 `templates/OPENCODE.md` 的入口协议，移除旧流程示例，并为 `install --target opencode` 生成物补关键断言。
- **验收条件**: OpenCode 入口文案与当前 CLI 一致，测试可阻止旧协议语义回归。
- **依赖**: S1

### S3: 串行回归验证并完成 DocPath 闭环
- [x] S3: 串行回归验证并完成 DocPath 闭环
- **描述**: 串行执行构建、目标 install 测试与全量测试，并通过 `docpath check` / `docpath agent done` 完成流程闭环。
- **验收条件**: `pnpm build`、目标测试、`pnpm test` 全绿，DocPath 状态回到 completed。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
