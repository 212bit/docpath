---
id: R-343
title: 路由门禁提示忽略 agent_flow 降级：formatters 调 resolveMajorChangeGateStatus 未传 agentFlow
status: proposed
priority: P2
level: 2
source: docpath backlog add
readiness: shaped
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-09-12
---

## 背景

shouldRouteToMajorChangeGate 依赖 context.majorChangeGate.confirmed，而 loadAgentOutputContext 调用时未传 agentFlow（默认 false），R-334 的 advisory 信号降级在路由端失效。go/done 实际可通过，next --agent 却持续建议 write-spec 补 Decision Brief，误导 Agent 白跑修复轮次。

## 验收

路由与命令端门禁判定一致：agent_flow=true 且全 advisory 信号时，next/status 不再输出重大变更门禁路由；补回归测试锁定 formatters 传参。
