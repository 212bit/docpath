---
id: R-479
title: task stash 与 start 活体租约互斥保护：防跨会话意外挂起与覆盖
kind: feature
status: done
priority: P2
level: 2
source: docpath start
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20261003-task-stash-start/spec.md
  decision_brief: |-
    - 当前问题: task stash 与 start 活体租约互斥保护：防跨会话意外挂起与覆盖
    - 目标: task stash 与 start 活体租约互斥保护：防跨会话意外挂起与覆盖
    - 背景: 来自 backlog R-479
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
  task: T-20261003-task-stash-start
  spec: tasks/T-20261003-task-stash-start/spec.md
created_at: 2026-10-03
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: 防跨会话意外挂起
- [x] FR-2: 覆盖

## 范围

### 包含

- task stash 与 start 活体租约互斥保护：防跨会话意外挂起与覆盖

### 不包含

- 待在后续规划中补充

## 验收

- [x] AC-1: 防跨会话意外挂起 满足功能要求并通过测试
- [x] AC-2: 覆盖 满足功能要求并通过测试
- [x] AC-3: 生成的 spec 可直接进入 `docpath plan`
- [x] AC-4: backlog 条目 R-479 与任务 T-20261003-task-stash-start 建立双向关联

## 决策证据

- 当前问题: task stash 与 start 活体租约互斥保护：防跨会话意外挂起与覆盖
- 目标: task stash 与 start 活体租约互斥保护：防跨会话意外挂起与覆盖
- 背景: 来自 backlog R-479
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
