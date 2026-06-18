---
id: R-003
title: 路由单一真源（消除死循环 + 统一 step id）
status: done
priority: P0
level: 2
source: dogfooding-2026-05-30
links: { task: T-20260530-dp03, spec: null }
created_at: 2026-05-30
---

命令的「下一步」hint 统一转调 nextCommand；inferNextAction 补 spec→plan / plan→go 规则；parsePlanTasks 读 `**S1**` 不再重编号 T1。
详见 §12.3 D-P0.3。
