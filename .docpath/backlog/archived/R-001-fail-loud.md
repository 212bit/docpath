---
id: R-001
title: Fail-loud（CLI 不再静默吞参数/失败）
status: done
priority: P0
level: 1
source: dogfooding-2026-05-30
links: { task: T-20260530-dp01, spec: null }
created_at: 2026-05-30
---

brainstorm/refine 支持 `[file]` 位置参数并真正读取；未知 flag/命令/缺必填参数 → 报错退出。
详见 `docs/design/next-phase-tasks.md` §12.3 D-P0.1。
