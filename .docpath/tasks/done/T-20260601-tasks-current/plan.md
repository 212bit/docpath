## 执行计划

### S1: 定位 current/canonical 任务文件链路
- [x] S1: 定位 current/canonical 任务文件链路
- **描述**: 梳理 active task 文件读写、check 门禁、命令注册和现有同步工具，确认漂移检测与同步命令的最小接入点。
- **验收条件**: 明确需要改造的模块、命令名和测试入口。
- **依赖**: 无

### S2: 实现任务文件漂移检测与同步修复
- [x] S2: 实现任务文件漂移检测与同步修复
- **描述**: 在 `docpath check` 中检测 current 与 canonical 的 spec/plan 漂移，并提供明确同步命令支持 canonical->current 与 current->canonical。
- **验收条件**: 漂移时 check fail-loud 并显示两边实际路径；同步命令能修复漂移并清晰输出结果。
- **依赖**: S1

### S3: 补充回归测试并完成门禁
- [x] S3: 补充回归测试并完成门禁
- **描述**: 覆盖漂移检测、同步修复、无漂移兼容场景，运行完整测试和 DocPath 门禁后归档。
- **验收条件**: 聚焦测试通过、`pnpm test` 通过、`docpath check` 通过、任务归档完成。
- **依赖**: S2

## 依赖关系图
S1 -> S2 -> S3
