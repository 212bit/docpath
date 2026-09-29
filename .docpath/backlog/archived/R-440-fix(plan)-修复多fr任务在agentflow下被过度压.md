---
id: R-440
title: "fix(plan): 修复多FR任务在agentFlow下被过度压缩为单步S1的缺陷"
kind: feature
status: done
priority: P2
level: 2
source: docpath start
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260929-fix-plan-fr-agentflow-s1/spec.md
  decision_brief: >-
    - 当前问题: 当开启 agentFlow 且 level <= 2 时，renderDraftPlan 无条件将包含多个 FR（如 6 个
    FR、删插件、前端 UI）的任务强行压缩为单步 S1，破坏了「小步快跑」与「架构守卫分层兜底」原则。

    - 目标: 优化 renderDraftPlan 判定条件，使多 FR (features.length > 1) 且 level >= 2
    的标准任务保持 S1..Sn 模块级多步拆解，单目标 (<= 1 FR) 或 level <= 1 保持单步 S1 压缩。

    - 背景: 来自用户真实开发反馈与协议一致性对齐。

    - 可选方案:
      - 方案 A (推荐): 修正 `renderDraftPlan` 中的压缩条件为 `level <= 1 || features.length <= 1`，区分单目标极简与多 FR 小步拆解。
      - 方案 B: 废弃整个 agentFlow 计划压缩机制。
    - 推荐方案: 方案 A

    - 决策理由: 方案 A 既保留了单目标任务的极简体验，又彻底治愈了多模块/跨层任务被粗暴压为单步的架构风险。

    - 不做什么: 不修改底层 FSM 状态机转移逻辑。

    - 成本: 低，仅修改 plan 渲染逻辑与定向测试。

    - 风险: 极低，向下兼容现有单步与多步规范。

    - 回滚方案: Git revert 提交。

    - 用户确认: 用户已在会话中明确同意优化。
  user_confirmed: 用户已在会话中明确同意优化。
links:
  task: T-20260929-fix-plan-fr-agentflow-s1
  spec: tasks/T-20260929-fix-plan-fr-agentflow-s1/spec.md
created_at: 2026-09-29
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: fix(plan): 修复多FR任务在agentFlow下被过度压缩为单步S1的缺陷

## 范围

### 包含

- fix(plan): 修复多FR任务在agentFlow下被过度压缩为单步S1的缺陷

### 不包含

- 待在后续规划中补充

## 验收

- [x] AC-1: fix(plan): 修复多FR任务在agentFlow下被过度压缩为单步S1的缺陷 满足需求并通过门禁
- [x] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [x] AC-3: backlog 条目 R-440 与任务 T-20260929-fix-plan-fr-agentflow-s1 建立双向关联

## 决策证据

- 当前问题: 当开启 agentFlow 且 level <= 2 时，renderDraftPlan 无条件将包含多个 FR（如 6 个 FR、删插件、前端 UI）的任务强行压缩为单步 S1，破坏了「小步快跑」与「架构守卫分层兜底」原则。
- 目标: 优化 renderDraftPlan 判定条件，使多 FR (features.length > 1) 且 level >= 2 的标准任务保持 S1..Sn 模块级多步拆解，单目标 (<= 1 FR) 或 level <= 1 保持单步 S1 压缩。
- 背景: 来自用户真实开发反馈与协议一致性对齐。
- 可选方案:
  - 方案 A (推荐): 修正 `renderDraftPlan` 中的压缩条件为 `level <= 1 || features.length <= 1`，区分单目标极简与多 FR 小步拆解。
  - 方案 B: 废弃整个 agentFlow 计划压缩机制。
- 推荐方案: 方案 A
- 决策理由: 方案 A 既保留了单目标任务的极简体验，又彻底治愈了多模块/跨层任务被粗暴压为单步的架构风险。
- 不做什么: 不修改底层 FSM 状态机转移逻辑。
- 成本: 低，仅修改 plan 渲染逻辑与定向测试。
- 风险: 极低，向下兼容现有单步与多步规范。
- 回滚方案: Git revert 提交。
- 用户确认: 用户已在会话中明确同意优化。
