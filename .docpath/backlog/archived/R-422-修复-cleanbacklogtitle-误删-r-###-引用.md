---
id: R-422
title: 修复 cleanBacklogTitle 误删 R-### 引用前缀问题
kind: feature
status: done
priority: P2
level: 2
source: docpath start
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260927-cleanbacklogtitle-r/spec.md
  decision_brief: |-
    - 当前问题: 修复 cleanBacklogTitle 误删 R-### 引用前缀问题
    - 目标: 修复 cleanBacklogTitle 误删 R-### 引用前缀问题
    - 背景: 来自 backlog R-422
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
  task: T-20260927-cleanbacklogtitle-r
  spec: tasks/T-20260927-cleanbacklogtitle-r/spec.md
created_at: 2026-09-27
---

## 背景

- 修复 cleanBacklogTitle 误删 R-### 引用前缀问题

## 验收

- 满足需求并通过门禁
