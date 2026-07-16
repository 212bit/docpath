## 执行计划

### S1: 导出 FSM 建议命令接口
- [x] S1: 导出 FSM 建议命令接口
- **描述**: 在 transitions.ts 导出 workflowEventSuggestedCommand 与 listPreferredWorkflowCommands / isWorkflowGateCommand 辅助，基于 EVENT_TARGETS + EVENT_RECOVERY_COMMAND，不改 phase/gate 矩阵。
- **验收条件**: 可从 phase/gate 列出合法 gate 类 CLI 建议；非法转移错误中的 suggested 与同一映射一致。
- **依赖**: 无

### S2: 约束 inferNextAction 的 gate 路由
- [x] S2: 约束 inferNextAction 的 gate 路由
- **描述**: inferNextAction 返回 check/review/journal/recover/done 等 gate 类命令前，用 FSM 合法候选校验；非法则回退 preferred FSM 命令或 docpath next --agent。保持 backlog/learn/closeout 阶梯不变。
- **验收条件**: AC-1/AC-2 对应路径满足；非 gate 路由行为不变。
- **依赖**: S1

### S3: 统一 lifecycle / project next_hint 出口
- [x] S3: 统一 lifecycle / project next_hint 出口
- **描述**: 确认 lifecycle 命令仅经 emitNextHint；project intake 重复 next_hint 字符串收敛到 nextActionForIntake 单源（若仍有重复）。
- **验收条件**: AC-3/AC-5。
- **依赖**: S2

### S4: 测试与收口
- [x] S4: 测试与收口
- **描述**: 增加/更新单元与集成测试：check→review hint、blocked-only recover、FSM 约束单元；跑相关测试并 check/review。
- **验收条件**: AC-4 通过；docpath check/review 通过。
- **依赖**: S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2 → S3 → S4
