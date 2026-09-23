---
id: R-362
title: check 测试执行优化包：--test-scope 影响面减载、受控并发与进程隔离、quick-guard porcelain 路径 bug 修复
status: proposed
priority: P1
level: 2
source: docpath backlog add
readiness: shaped
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-09-23
---

## 背景

check 全量测试约占耗时97%（实测80s），主要来自 node --test 87文件857用例。提供 --test-scope=touched 影响面减载（叶子改动省82%）与 --test-scope=full 受控并发+进程隔离；修复 quick-guard readChangedFiles 对 tracked 文件 porcelain 输出 slice(3) 路径错切的核心漏判 bug。

## 验收

- 待补充
