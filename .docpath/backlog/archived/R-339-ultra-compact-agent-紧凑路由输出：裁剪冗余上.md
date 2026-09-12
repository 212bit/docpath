---
id: R-339
title: Ultra-compact --agent 紧凑路由输出：裁剪冗余上下文，将单次状态视图压至 200 Token 以内
status: done
priority: P2
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260912-ultra-compact-agent-200-token/spec.md
  decision_brief: >-
    - 当前问题: Agent 频繁调用 next --agent 累加上下文，当前输出约 500+
    Token，包含非核心元数据。需支持超紧凑机器模式，非关键信息通过 reveal 按需查询。

    - 目标: Ultra-compact --agent 紧凑路由输出：裁剪冗余上下文，将单次状态视图压至 200 Token 以内

    - 背景: 来自 backlog R-339

    - 可选方案:
      - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
      - 方案 B: 补充分析，扩展本任务范围
    - 推荐方案: 方案 A

    - 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险

    - 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围

    - 成本: 中等，按 plan 拆分后逐步验证

    - 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移

    - 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed

    - 用户确认: 待确认
  user_confirmed: 待确认
links:
  task: T-20260912-ultra-compact-agent-200-token
  spec: tasks/T-20260912-ultra-compact-agent-200-token/spec.md
created_at: 2026-09-12
---

## 背景

Agent 频繁调用 next --agent 累加上下文，当前输出约 500+ Token，包含非核心元数据。需支持超紧凑机器模式，非关键信息通过 reveal 按需查询。

## 验收

next --agent 输出精简到核心路由字段（state, next_action, recommended_command, step_id），token 消耗减少 60% 以上。
