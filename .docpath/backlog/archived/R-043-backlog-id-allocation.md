---
id: R-043
title: backlog add 分配 ID 时避免并发重复
status: done
priority: P0
level: 1
source: "dogfood: 并发吸收 DocPath 优化项时发现"
links:
  task: T-20260601-backlog-add-id
  spec: tasks/T-20260601-backlog-add-id/spec.md
created_at: 2026-06-01
---

## 背景

- 并发执行多个 `docpath backlog add` 时，多个进程会同时读取相同最大 ID，导致新文件都写入相同 `id`。
- 当前表现为多个不同 slug 文件拥有同一个 `R-040` frontmatter，`backlog list --agent` 会出现重复 id。

## 验收

- 并发执行多个 `docpath backlog add` 时，每个条目获得唯一、单调递增的 `R-###`。
- 回归测试覆盖并发添加场景。
- `backlog.md` 和 `backlog list --agent` 不再出现由并发创建导致的重复 id。
