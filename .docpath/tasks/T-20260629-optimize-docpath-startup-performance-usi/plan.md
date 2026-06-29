## 执行计划

### S1: 重构 check.ts 命令子模块为动态加载
- [x] S1: 重构 check.ts 命令子模块为动态加载
- **描述**: 在 `src/commands/check.ts` 和 `src/commands/check/validators.ts` 中，将静态的 `runProjectChecks`、`runTaskDocumentChecks` 等大块子模块依赖改造为动态引入，将 `execSync` 改造为调用链路内加载。
- **验收条件**: 文件编译成功，静态导入依赖被清除。
- **依赖**: 无

### S2: 重构 agent-output.ts 相关大型输出组件
- [x] S2: 重构 agent-output.ts 相关大型输出组件
- **描述**: 优化 `src/utils/agent-output.ts` 及其内部的格式化输出逻辑，将 yaml、marked 等仅在生成提示或展示格式时才使用的第三方或内部格式化逻辑重构为动态加载。
- **验收条件**: 依赖项延迟按需加载，热路径命令无额外多余模块导入。
- **依赖**: S1

### S3: 自动化单元测试与编译检查
- [x] S3: 自动化单元测试与编译检查
- **描述**: 重新编译整个项目，并运行所有 467 个测试，确保动态加载后的行为和原有工作流完全兼容，无任何 runtime loading 挂起。
- **验收条件**: `npm run build && npm test` 100% 通行。
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [ ] S3

## 依赖关系图
S1 → S2 → S3
