---
id: R-360
title: go --step 对未跟踪文件的 dirty guard 报错信息不够明确
status: done
priority: P3
level: 1
source: docpath backlog add
readiness: analyzed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260923-go-step-dirty-guard/spec.md
  decision_brief: R-352 去重提示（2026-09-23）：检测到 2 条重复候选，已提示合并/skip；用户放行确认待补 --user-confirmed。
  user_confirmed: null
links:
  task: T-20260923-go-step-dirty-guard
  spec: tasks/T-20260923-go-step-dirty-guard/spec.md
created_at: 2026-09-23
---

## 背景

由 spec.json 渲染生成。

## 范围

### 包含

- git-dirty-guard.ts buildDirtyWorktreeError 的未跟踪段措辞补强

### 不包含

- 改变 dirty guard 的拦截逻辑

## 验收

- AC-1: 报错未跟踪段含「未跟踪=未归属」与「不要 git add -A」提示
- AC-2: 已跟踪修改段指引不变
