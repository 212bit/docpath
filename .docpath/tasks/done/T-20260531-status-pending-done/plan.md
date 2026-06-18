## 执行计划

### S1: 明确 status 告警触发条件与输出边界
- [x] S1: 明确 status 告警触发条件与输出边界
- **描述**: 梳理普通 `docpath status` 在 `phase=executing` 且存在匹配当前任务的 `pending-done.md` 时应输出的提醒文案、推荐动作与兼容约束。
- **验收条件**: 告警条件、非告警条件和与 `status --agent` 的职责边界明确，可直接指导实现与测试。
- **依赖**: 无

### S2: 为 status 增加 pending-done 未收尾告警
- [x] S2: 为 status 增加 pending-done 未收尾告警
- **描述**: 在 `src/commands/status.ts` 中接入 `pending-done` 检测，在普通状态输出中提示当前任务存在未收尾哨兵，并建议执行 `docpath agent done`，保持非 agent 输出兼容。
- **验收条件**: executing + matching sentinel 时可见明确提醒；无 sentinel、任务不匹配或 phase 非 executing 时不误报。
- **依赖**: S1

### S3: 补测试并回归验证
- [x] S3: 补测试并回归验证
- **描述**: 为 `status` 的 pending-done 告警与非告警路径补充 CLI 级测试，串行执行构建、目标测试与全量测试。
- **验收条件**: 新增测试通过，`pnpm test` 全绿。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
