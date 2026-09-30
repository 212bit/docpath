---
id: R-453
title: ZCode 原生 SQLite 遥测直连适配器与多轮累加 Token 真实度量
kind: feature
status: done
priority: P1
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260930-zcode-sqlite-token/spec.md
  decision_brief: |-
    - 当前问题: ZCode 原生 SQLite 遥测直连适配器与多轮累加 Token 真实度量
    - 目标: ZCode 原生 SQLite 遥测直连适配器与多轮累加 Token 真实度量
    - 背景: 来自 backlog R-453
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
  task: T-20260930-zcode-sqlite-token
  spec: tasks/T-20260930-zcode-sqlite-token/spec.md
created_at: 2026-09-30
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: ZCode 原生 SQLite 遥测直连适配器
- [x] FR-2: 多轮累加 Token 真实度量

## 范围

### 包含

- ZCode 原生 SQLite 遥测直连适配器与多轮累加 Token 真实度量

### 不包含

- 待在后续规划中补充

## 验收

- [x] AC-1: 实现 `ZCodeTelemetryAdapter` 深度适配器，支持自动探测并直连 `~/.zcode/cli/db/db.sqlite`（解析 `model_usage` 与 `turn_usage`）及 rollout JSONL
- [x] AC-2: 精确提取多轮累计 Token（`input_tokens`、`output_tokens`、`computed_total_tokens`、`cache_read_input_tokens` 缓存命中）与模型规格
- [x] AC-3: 在 `docpath monitor`（全局与 `--current`）中集成 ZCode 真实度量，展现缓存命中率（Cache Hit Ratio）与多轮会话真实消耗
- [x] AC-4: 完成单元测试覆盖并在全量门禁中通过验证
- [x] AC-1: ZCode 原生 SQLite 遥测直连适配器 满足功能要求并通过测试
- [x] AC-2: 多轮累加 Token 真实度量 满足功能要求并通过测试
- [x] AC-3: 生成的 spec 可直接进入 `docpath plan`
- [x] AC-4: backlog 条目 R-453 与任务 T-20260930-zcode-sqlite-token 建立双向关联

## 决策证据

- 当前问题: ZCode 原生 SQLite 遥测直连适配器与多轮累加 Token 真实度量
- 目标: ZCode 原生 SQLite 遥测直连适配器与多轮累加 Token 真实度量
- 背景: 来自 backlog R-453
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
