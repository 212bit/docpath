---
id: R-357
title: check scope 缓存命中时输出明确提示而非静默复用
status: done
priority: P1
level: 1
source: docpath backlog add
readiness: analyzed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260923-check-scope/spec.md
  decision_brief: null
  user_confirmed: null
links:
  task: T-20260923-check-scope
  spec: tasks/T-20260923-check-scope/spec.md
created_at: 2026-09-23
---

## 背景

由 spec.json 渲染生成。

## 范围

### 包含

- CheckResult 增加 cached 标记；cache.ts 复用项打 cached: true；evidence.ts 报告渲染在缓存命中时显式提示

### 不包含

- 调整 scope digest 计算或缓存失效策略
- --no-cache 行为变更

## 验收

- AC-1: 缓存命中时，被复用检查项的报告行不是孤立的 ✅，而是带「缓存复用」标注
- AC-2: 全量报告末尾出现一行说明缓存复用项数与 --no-cache 提示
- AC-3: --no-cache 或真实变更导致全量执行时，报告中不出现「缓存复用」字样（标记不误标）
- AC-4: 现有 check 测试套件（含缓存命中路径测试）不回归
