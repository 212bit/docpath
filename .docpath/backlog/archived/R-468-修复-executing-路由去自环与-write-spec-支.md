---
id: R-468
title: 修复 executing 路由去自环与 write-spec 支持 Backlog 标题自愈
kind: feature
status: done
priority: P2
level: 2
source: docpath start
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20261001-executing-write-spec-backlog/spec.md
  decision_brief: >-
    - 当前问题: executing 路由自环与 write-spec 对 `# R-xxx` 标题误报漂移

    - 目标: 修复 executing in-progress 路由指引，并支持 write-spec 标题自动识别 Backlog ID 与自愈

    - 推荐方案: 修复 `inferRouteFromContext` 对 `activeStep` 的保留，并将
    `taskIdFromMarkdown` 与 `write-spec` 对 `# R-xxx` 进行 backlog 映射处理

    - 决策理由: 彻底消除 Agent 开发过程中的自环卡顿与 spec 写入摩擦

    - 用户确认: 已确认
  user_confirmed: 已确认
links:
  task: T-20261001-executing-write-spec-backlog
  spec: tasks/T-20261001-executing-write-spec-backlog/spec.md
created_at: 2026-10-01
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: 修复 executing 路由去自环 —— 当处于 `executing` 阶段且存在进行中的活跃步骤（`context.bc.inProgress > 0` 或 `activeStep` 存在）时，`inferRouteFromContext` 继承 `inferred` 路由推荐 `docpath step-pass --step <step>`，不再盲目重推 `docpath go`。
- [x] FR-2: `write-spec` 支持 Backlog 标题自愈 —— `taskIdFromMarkdown` 仅匹配真实的 `T-` Task ID；当 Markdown 一级标题为 `# R-xxx - 标题` 且当前存在活跃任务时，自动将其解析为 `backlog_id: R-xxx` 并对齐到当前活跃任务 `T-xxx`，杜绝 `task identity mismatch` 假阳性拦截。

## 范围

### 包含

- `src/engine/agent-output/formatters.ts` 中的 `inferRouteFromContext` 逻辑修复
- `src/utils/structured-docs.ts`、`src/utils/task-files.ts` 和 `src/commands/write-spec.ts` 中的 Task ID / Backlog ID 识别与自愈
- 新增针对 executing in_progress 路由和 write-spec `# R-xxx` 标题自愈的测试用例

### 不包含

- 不修改底层 Backlog 与 Task 的分离存储模型

## 验收

- [x] AC-1: 当工作区处于 `executing` 阶段且步骤已进入 `in_progress` 时，`docpath next --agent` 和 `emitNextHint` 输出推荐 `docpath step-pass --step <step>`，不再输出 `docpath go --step <step>`。
- [x] AC-2: 在活跃任务 `T-xxx` 下，通过 `write-spec --stdin` 传入 `# R-xxx - 标题` 或 `# 标题` 的 spec 内容能够成功落盘，自动记录 `backlog_id: R-xxx` 且不报 `task identity mismatch`。
- [x] AC-3: 全量测试套件通过。

## 决策证据

- 当前问题: executing 路由自环与 write-spec 对 `# R-xxx` 标题误报漂移
- 目标: 修复 executing in-progress 路由指引，并支持 write-spec 标题自动识别 Backlog ID 与自愈
- 推荐方案: 修复 `inferRouteFromContext` 对 `activeStep` 的保留，并将 `taskIdFromMarkdown` 与 `write-spec` 对 `# R-xxx` 进行 backlog 映射处理
- 决策理由: 彻底消除 Agent 开发过程中的自环卡顿与 spec 写入摩擦
- 用户确认: 已确认
