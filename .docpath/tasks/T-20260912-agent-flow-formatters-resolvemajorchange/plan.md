## 执行计划

### S1: 实现并验证 路由门禁提示忽略 agent_flow 降级：formatters 调 resolveMajorChangeGateStatus 未传 agentFlow
- [x] S1: 实现并验证 路由门禁提示忽略 agent_flow 降级：formatters 调 resolveMajorChangeGateStatus 未传 agentFlow
- **描述**: 完成 FR-1: 路由门禁提示忽略 agent_flow 降级：formatters 调 resolveMajorChangeGateStatus 未传 agentFlow，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: 路由与命令端门禁判定一致：agent_flow=true 且全 advisory 信号时，next/status 不再输出重大变更门禁路由；补回归测试锁定 formatters 传参。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-343 与任务 T-20260912-agent-flow-formatters-resolvemajorchange 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
