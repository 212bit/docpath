---
id: R-488
title: 文档图治理三增强：doctor/graph 孤立口径统一、文档警告豁免机制、机器区块过期检测
kind: feature
status: done
priority: P2
level: 2
source: docpath start
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20261006-doctor-graph/spec.md
  decision_brief: |-
    - 当前问题: 文档图治理三增强：doctor/graph 孤立口径统一、文档警告豁免机制、机器区块过期检测
    - 目标: 文档图治理三增强：doctor/graph 孤立口径统一、文档警告豁免机制、机器区块过期检测
    - 背景: 来自 backlog R-488
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
  task: T-20261006-doctor-graph
  spec: tasks/T-20261006-doctor-graph/spec.md
created_at: 2026-10-06
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: doctor/graph 孤立口径统一
- [x] FR-2: 文档警告豁免机制
- [x] FR-3: 机器区块过期检测

## 范围

### 包含

- 文档图治理三增强：doctor/graph 孤立口径统一、文档警告豁免机制、机器区块过期检测

### 不包含

- 待在后续规划中补充

## 验收

- [x] AC-1: doctor/graph 孤立口径统一 满足功能要求并通过测试
- [x] AC-2: 文档警告豁免机制 满足功能要求并通过测试
- [x] AC-3: 机器区块过期检测 满足功能要求并通过测试
- [x] AC-4: 生成的 spec 可直接进入 `docpath plan`
- [x] AC-5: backlog 条目 R-488 与任务 T-20261006-doctor-graph 建立双向关联

## 决策证据

- 当前问题: 文档图治理三增强：doctor/graph 孤立口径统一、文档警告豁免机制、机器区块过期检测
- 目标: 文档图治理三增强：doctor/graph 孤立口径统一、文档警告豁免机制、机器区块过期检测
- 背景: 来自 backlog R-488
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
