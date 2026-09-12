---
id: R-343
title: 路由门禁提示忽略 agent_flow 降级：formatters 调 resolveMajorChangeGateStatus 未传 agentFlow
status: done
priority: P2
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260912-agent-flow-formatters-resolvemajorchange/spec.md
  decision_brief: >-
    - 当前问题: shouldRouteToMajorChangeGate 依赖 context.majorChangeGate.confirmed，而
    loadAgentOutputContext 调用时未传 agentFlow（默认 false），R-334 的 advisory
    信号降级在路由端失效。go/done 实际可通过，next --agent 却持续建议 write-spec 补 Decision Brief，误导
    Agent 白跑修复轮次。

    - 目标: 路由门禁提示忽略 agent_flow 降级：formatters 调 resolveMajorChangeGateStatus 未传
    agentFlow

    - 背景: 来自 backlog R-343

    - 可选方案:
      - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
      - 方案 B: 补充分析，扩展本任务范围
    - 推荐方案: 方案 A

    - 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险

    - 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围

    - 成本: 中等，按 plan 拆分后逐步验证

    - 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移

    - 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed

    - 用户确认: 待确认
  user_confirmed: 待确认
links:
  task: T-20260912-agent-flow-formatters-resolvemajorchange
  spec: tasks/T-20260912-agent-flow-formatters-resolvemajorchange/spec.md
created_at: 2026-09-12
---

## 背景

shouldRouteToMajorChangeGate 依赖 context.majorChangeGate.confirmed，而 loadAgentOutputContext 调用时未传 agentFlow（默认 false），R-334 的 advisory 信号降级在路由端失效。go/done 实际可通过，next --agent 却持续建议 write-spec 补 Decision Brief，误导 Agent 白跑修复轮次。

## 验收

路由与命令端门禁判定一致：agent_flow=true 且全 advisory 信号时，next/status 不再输出重大变更门禁路由；补回归测试锁定 formatters 传参。
