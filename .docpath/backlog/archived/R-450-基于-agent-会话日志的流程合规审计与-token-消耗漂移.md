---
id: R-450
title: 基于 Agent 会话日志的流程合规审计与 Token 消耗漂移监控体系
kind: feature
status: done
priority: P1
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260930-agent-token/spec.md
  decision_brief: |-
    - 当前问题: 基于 Agent 会话日志的流程合规审计与 Token 消耗漂移监控体系
    - 目标: 基于 Agent 会话日志的流程合规审计与 Token 消耗漂移监控体系
    - 背景: 来自 backlog R-450
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
  task: T-20260930-agent-token
  spec: tasks/T-20260930-agent-token/spec.md
created_at: 2026-09-30
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: 基于 Agent 会话日志的流程合规审计
- [x] FR-2: Token 消耗漂移监控体系

## 范围

### 包含

- 基于 Agent 会话日志的流程合规审计与 Token 消耗漂移监控体系

### 不包含

- 待在后续规划中补充

## 验收

- [x] AC-1: 设计统一 Agent 会话遥测接口（AgentTelemetryAdapter），首发支持 Antigravity 与标准环境变量适配
- [x] AC-2: 实现会话级合规行为审计引擎（检测违规 quick、大文件滥读、死循环卡点、跨任务长会话未轮转）
- [x] AC-3: 实现 Token 漂移与突增告警机制（基线偏离预警、协议膨胀率计算）
- [x] AC-4: 提供 docpath monitor 监控大盘（含人类交互视图、--agent 紧凑视图及 --strict 门禁检测）
- [x] AC-1: 基于 Agent 会话日志的流程合规审计 满足功能要求并通过测试
- [x] AC-2: Token 消耗漂移监控体系 满足功能要求并通过测试
- [x] AC-3: 生成的 spec 可直接进入 `docpath plan`
- [x] AC-4: backlog 条目 R-450 与任务 T-20260930-agent-token 建立双向关联

## 决策证据

- 当前问题: 基于 Agent 会话日志的流程合规审计与 Token 消耗漂移监控体系
- 目标: 基于 Agent 会话日志的流程合规审计与 Token 消耗漂移监控体系
- 背景: 来自 backlog R-450
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
