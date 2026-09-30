---
id: R-452
title: 基于真实工具调用的深度 Token 归因与低效诊断引擎
kind: feature
status: done
priority: P1
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260930-token/spec.md
  decision_brief: |-
    - 当前问题: 基于真实工具调用的深度 Token 归因与低效诊断引擎
    - 目标: 基于真实工具调用的深度 Token 归因与低效诊断引擎
    - 背景: 来自 backlog R-452
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
  task: T-20260930-token
  spec: tasks/T-20260930-token/spec.md
created_at: 2026-09-30
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: 基于真实工具调用的深度 Token 归因
- [x] FR-2: 低效诊断引擎

## 范围

### 包含

- 基于真实工具调用的深度 Token 归因与低效诊断引擎

### 不包含

- 待在后续规划中补充

## 验收

- [x] AC-1: 实现工具级真实 Token 归因分析（统计每个工具的调用频次、参数及输出真实 Token 消耗、占比分布与错误率）
- [x] AC-2: 实现真实工具低效与失真诊断器（检测重复读取相同文件、超长命令输出污染、代码编辑失败反复重试、无并发子代理直接深改等）
- [x] AC-3: 在 `docpath monitor` 全局与 `--current` 实时看板中置入「🛠️ 真实工具调用与消耗剖析」与「⚠️ 工具低效诊断」模块，并提供 `--agent` 与 `--json`
- [x] AC-4: 完成单元测试覆盖并在全量门禁中通过验证
- [x] AC-1: 基于真实工具调用的深度 Token 归因 满足功能要求并通过测试
- [x] AC-2: 低效诊断引擎 满足功能要求并通过测试
- [x] AC-3: 生成的 spec 可直接进入 `docpath plan`
- [x] AC-4: backlog 条目 R-452 与任务 T-20260930-token 建立双向关联

## 决策证据

- 当前问题: 基于真实工具调用的深度 Token 归因与低效诊断引擎
- 目标: 基于真实工具调用的深度 Token 归因与低效诊断引擎
- 背景: 来自 backlog R-452
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
