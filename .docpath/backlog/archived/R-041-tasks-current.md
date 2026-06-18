---
id: R-041
title: 检测并同步 tasks/current 与任务目录漂移
status: done
priority: P0
level: 2
source: "dogfood: 使用 DocPath 开发 R-039 时发现"
links:
  task: T-20260601-tasks-current
  spec: tasks/T-20260601-tasks-current/spec.md
created_at: 2026-06-01
---

## 背景

- 开发 R-039 时，任务目录副本与 `.docpath/tasks/current/*` 存在不同步风险。
- `docpath check` 实际读取 current 视图时，用户容易误改 canonical 任务目录而没有修复当前视图。

## 验收

- `docpath check` 能明确提示 current 视图与任务目录副本是否漂移。
- 用户能通过一个明确命令或自动修复路径同步两边内容。
