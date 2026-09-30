## 执行计划

### S1: 实现并验证 FR-1 基于 Agent 会话日志的流程合规审计
- [x] S1: 实现并验证 FR-1 基于 Agent 会话日志的流程合规审计
- **描述**: 落地 FR-1: 基于 Agent 会话日志的流程合规审计，并完成模块定向自验。
- **验收条件**: AC-1: 设计统一 Agent 会话遥测接口（AgentTelemetryAdapter），首发支持 Antigravity 与标准环境变量适配
- **依赖**: 无

### S2: 实现并验证 FR-2 Token 消耗漂移监控体系
- [x] S2: 实现并验证 FR-2 Token 消耗漂移监控体系
- **描述**: 落地 FR-2: Token 消耗漂移监控体系，并完成模块定向自验。
- **验收条件**: AC-2: 实现会话级合规行为审计引擎（检测违规 quick、大文件滥读、死循环卡点、跨任务长会话未轮转）；AC-3: 实现 Token 漂移与突增告警机制（基线偏离预警、协议膨胀率计算）；AC-4: 提供 docpath monitor 监控大盘（含人类交互视图、--agent 紧凑视图及 --strict 门禁检测）；AC-1: 基于 Agent 会话日志的流程合规审计 满足功能要求并通过测试；AC-2: Token 消耗漂移监控体系 满足功能要求并通过测试；AC-3: 生成的 spec 可直接进入 `docpath plan`；AC-4: backlog 条目 R-450 与任务 T-20260930-agent-token 建立双向关联
- **依赖**: S1

## Checklist
- [x] S1
- [x] S2

## 依赖关系图
S1 → S2
