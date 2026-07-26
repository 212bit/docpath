## 执行计划

### S1: 梳理 plan 命令写盘先于 FSM 校验: completed 任务 plan.json 被改写后才报 Illegal transition, 半执行污染 canonical 证据
- [x] S1: 梳理 plan 命令写盘先于 FSM 校验: completed 任务 plan.json 被改写后才报 Illegal transition, 半执行污染 canonical 证据
- **描述**: 根据 spec 明确 FR-1: plan 命令写盘先于 FSM 校验: completed 任务 plan.json 被改写后才报 Illegal transition, 半执行污染 canonical 证据 的实现边界和验收口径。
- **验收条件**: AC-1: 非法阶段（completed 等）运行 docpath plan 退出码非零，plan.md/plan.json 与运行前逐字节一致（零写入）。
- **依赖**: 无

### S2: 实现 plan 命令写盘先于 FSM 校验: completed 任务 plan.json 被改写后才报 Illegal transition, 半执行污染 canonical 证据
- [x] S2: 实现 plan 命令写盘先于 FSM 校验: completed 任务 plan.json 被改写后才报 Illegal transition, 半执行污染 canonical 证据
- **描述**: 在现有架构内完成 FR-1: plan 命令写盘先于 FSM 校验: completed 任务 plan.json 被改写后才报 Illegal transition, 半执行污染 canonical 证据 的代码与文档更新。
- **验收条件**: FR-1 plan 命令写盘先于 FSM 校验: completed 任务 plan.json 被改写后才报 Illegal transition, 半执行污染 canonical 证据 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 非法阶段（completed 等）运行 docpath plan 退出码非零，plan.md/plan.json 与运行前逐字节一致（零写入）。；AC-2: 错误信息含非法原因与 FSM 派生的建议下一步命令。；AC-3: 合法阶段 plan 行为不变，--dry-run 不受影响；现有测试全绿并新增回归测试。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-291 与任务 T-20260726-plan-fsm-completed-plan-json-illegal-tra 建立双向关联
- **验收条件**: AC-1: 非法阶段（completed 等）运行 docpath plan 退出码非零，plan.md/plan.json 与运行前逐字节一致（零写入）。；AC-2: 错误信息含非法原因与 FSM 派生的建议下一步命令。；AC-3: 合法阶段 plan 行为不变，--dry-run 不受影响；现有测试全绿并新增回归测试。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-291 与任务 T-20260726-plan-fsm-completed-plan-json-illegal-tra 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
