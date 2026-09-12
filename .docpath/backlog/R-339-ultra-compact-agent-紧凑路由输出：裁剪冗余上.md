---
id: R-339
title: Ultra-compact --agent 紧凑路由输出：裁剪冗余上下文，将单次状态视图压至 200 Token 以内
status: proposed
priority: P2
level: 1
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

Agent 频繁调用 next --agent 累加上下文，当前输出约 500+ Token，包含非核心元数据。需支持超紧凑机器模式，非关键信息通过 reveal 按需查询。

## 验收

next --agent 输出精简到核心路由字段（state, next_action, recommended_command, step_id），token 消耗减少 60% 以上。
