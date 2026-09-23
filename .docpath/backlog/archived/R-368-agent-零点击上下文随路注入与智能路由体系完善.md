---
id: R-368
title: Agent 零点击上下文随路注入与智能路由体系完善
status: done
priority: P2
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260923-agent/spec.md
  decision_brief: |-
    - 当前问题: 完善 Agent 上下文注入机制与文档
    - 目标: Agent 零点击上下文随路注入与智能路由体系完善
    - 背景: 来自 backlog R-368
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
  task: T-20260923-agent
  spec: tasks/T-20260923-agent/spec.md
created_at: 2026-09-23
---

## 背景

完善 Agent 上下文注入机制与文档

## 验收

完成文档落盘并确保索引与门禁全部通过
