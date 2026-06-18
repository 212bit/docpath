---
id: R-002
title: 完成 G2 状态统一（单一写入口）
status: done
priority: P0
level: 2
source: dogfooding-2026-05-30
links: { task: T-20260530-dp02, spec: null }
created_at: 2026-05-30
---

6 个起草命令改走 transitionWorkflow()/updateLevel()；删除 updateCurrentState()，唯一写入口 writeCurrentState()；phase 不再卡 idle。
详见 §12.3 D-P0.2。
