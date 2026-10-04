---
id: R-483
title: 优化 go 与 Agent 路由中的 Backlog 自动关联及标题容错
kind: feature
status: done
priority: P2
level: 2
source: docpath start
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20261004-go-agent-backlog/spec.md
  decision_brief: >-
    - 当前问题: `go` 步骤执行中标题提取对 `# R-xxx` 标题容错不足，且 Agent 路由对 spec 中的 backlog_id
    缺少回退反射

    - 目标: 增强 `go` 与 `agent-output` 对 Backlog 标题与 ID 的自动关联和容错能力

    - 推荐方案: 统一使用通用标题提取正则，并在状态生成层加入 `backlog_id` 回退

    - 决策理由: 彻底闭环消除 Backlog 与 Task 协同中的边界漏洞

    - 用户确认: 已确认
  user_confirmed: 已确认
links:
  task: T-20261004-go-agent-backlog
  spec: tasks/T-20261004-go-agent-backlog/spec.md
created_at: 2026-10-04
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: 优化 `docpath go` 的 `readSpecFields`，支持从 `# T-xxx - 标题`、`# R-xxx - 标题` 及普通 `# 标题` 中提取标题，且在 `startStep` 中确保 `taskId` 完整传递。
- [x] FR-2: 优化 `generateAgentOutput` 中的 `backlog_id` 解析，当 `state.json` 缺少 `backlog_id` 时自动从 `structuredSpec` 回退获取。
- [x] FR-3: 完善单测覆盖，验证 `go` 在各类 H1 格式下标题提取与状态更新的正确性。

## 范围

### 包含

- 见 linked spec

### 不包含

- 见 linked spec

## 验收

- [x] AC-1: 当 `spec.md` 首行为 `# R-xxx - 标题` 时，`docpath go` 能够正确提取 `task_title` 并在 `current.md` / `state.json` 中保留标题。
- [x] AC-2: `agent-output` 能够在 `state.json` 缺失 `backlog_id` 但 `spec.json` 存在时正确反射 `backlog_id`。
- [x] AC-3: 全量测试套件通过。

## 决策证据

- 当前问题: `go` 步骤执行中标题提取对 `# R-xxx` 标题容错不足，且 Agent 路由对 spec 中的 backlog_id 缺少回退反射
- 目标: 增强 `go` 与 `agent-output` 对 Backlog 标题与 ID 的自动关联和容错能力
- 推荐方案: 统一使用通用标题提取正则，并在状态生成层加入 `backlog_id` 回退
- 决策理由: 彻底闭环消除 Backlog 与 Task 协同中的边界漏洞
- 用户确认: 已确认
