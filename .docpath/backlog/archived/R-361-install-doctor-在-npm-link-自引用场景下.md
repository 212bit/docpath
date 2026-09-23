---
id: R-361
title: install --doctor 在 npm-link 自引用场景下增加漂移说明
status: done
priority: P3
level: 1
source: docpath backlog add
readiness: analyzed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260923-install-doctor-npm-link/spec.md
  decision_brief: R-352 去重提示（2026-09-23）：检测到 2 条重复候选，已提示合并/skip；用户放行确认待补 --user-confirmed。
  user_confirmed: null
links:
  task: T-20260923-install-doctor-npm-link
  spec: tasks/T-20260923-install-doctor-npm-link/spec.md
created_at: 2026-09-23
---

## 背景

由 spec.json 渲染生成。

## 范围

### 包含

- runInstallDoctor / buildInstallDoctorReportFromContext 增加自引用检测（解析 bin/docpath.js 指向，比对 cwd）

### 不包含

- 自动修复漂移

## 验收

- AC-1: 自引用场景下 doctor 输出含「npm-link 自引用，漂移为预期」说明
- AC-2: 非自引用项目 doctor 输出不变
