---
id: R-372
title: Agent 输出去噪与高浓度行动护栏重构
status: done
priority: P2
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260923-agent-2/spec.md
  decision_brief: >-
    - 当前问题: 优化 agent-output 结构，剔除时间戳/自指等元数据噪音，将 recent_decisions 升级为简洁高浓度的
    active_guardrails 行动指令

    - 目标: Agent 输出去噪与高浓度行动护栏重构

    - 背景: 来自 backlog R-372

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
  task: T-20260923-agent-2
  spec: tasks/T-20260923-agent-2/spec.md
created_at: 2026-09-23
---

## 背景

优化 agent-output 结构，剔除时间戳/自指等元数据噪音，将 recent_decisions 升级为简洁高浓度的 active_guardrails 行动指令

## 验收

next/status agent 输出完成瘦身，active_guardrails 自动转换为高质量指令，测试全量通过
