---
id: R-010
title: 需求管理 / Backlog 层
status: done
priority: P1
level: 2
source: dogfooding-2026-05-30
links:
  task: current
  spec: .docpath/tasks/current/spec.md
created_at: 2026-05-30
---

为 DocPath 增加「一条一文件 + 索引」的 backlog 层：条目独立状态机（proposed→accepted→planned→active→done|dropped）、
`backlog add/list/promote/done`、`next --agent` 从 backlog 路由、promote→tasks/current、完成自动回填。
本条目即由该需求自身 dogfood 产生（brainstorm→spec→plan）。spec/plan 见 `.docpath/tasks/current/`。
