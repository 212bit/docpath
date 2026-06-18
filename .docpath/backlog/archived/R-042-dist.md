---
id: R-042
title: 隔离测试构建产物避免 dist 清理竞争
status: done
priority: P1
level: 1
source: "dogfood: 使用 DocPath 开发 R-039 时发现"
links:
  task: T-20260601-dist
  spec: tasks/T-20260601-dist/spec.md
created_at: 2026-06-01
---

## 背景

- 全量测试并发运行 CLI 子进程时，`tsup --clean` 可能清理正在被其他测试读取的 `dist/chunk-*.js`。

## 验收

- 全量测试不再因为 `dist/` 构建产物竞争出现 `ERR_MODULE_NOT_FOUND`。
- 测试命令或测试夹具具备稳定的构建产物隔离策略。
