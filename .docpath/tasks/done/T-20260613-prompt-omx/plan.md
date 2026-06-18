## 执行计划

### S1: 修复 plan 生成格式
- **描述**: 修改 `src/commands/plan.ts`，生成 plan.md 时自动追加 `## Checklist` section，格式为 `- [ ] S1` `- [ ] S2` 等
- **验收条件**: 运行 `docpath plan` 后，生成的 plan.md 包含 checklist section，`docpath check` 不再报 checklist 缺失
- **依赖**: 无

### S2: breadcrumb 自动去重
- **描述**: 修改 `src/engine/breadcrumb.ts`，添加步骤名归一化和去重逻辑，重复调用 `agent step` 时跳过已完成的步骤
- **验收条件**: 重复执行 `docpath agent step --step S1 --status done` 时，第二次输出警告并跳过
- **依赖**: 无

### S3: check 输出分级
- **描述**: 修改 `src/commands/check.ts`，默认只显示失败和警告项，添加 `--verbose` 选项显示所有检查项
- **验收条件**: `docpath check` 失败时只显示失败项，`docpath check --verbose` 显示所有项
- **依赖**: 无

### S4: 快速修复建议
- **描述**: 修改 `src/utils/agent-output.ts`，在检测到常见错误时输出 `quick_fix` 字段，包含可执行的修复命令
- **验收条件**: 当检测到 plan 缺少 checklist 时，`docpath status --agent` 输出包含 `quick_fix` 字段
- **依赖**: 无

### S5: 验证所有优化
- **描述**: 运行完整测试，验证 4 个优化点都工作正常，运行 check/review/journal 完成归档
- **验收条件**: 所有测试通过，质量门禁通过
- **依赖**: S1, S2, S3, S4

## Checklist
- [ ] S1
- [ ] S2
- [ ] S3
- [ ] S4
- [ ] S5

## 依赖关系图
S1 → S5
S2 → S5
S3 → S5
S4 → S5
