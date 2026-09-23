---
id: R-356
title: worktree backlog 快照过期根治（重复登记根因：merge-mediated 快照无实时共享）
status: proposed
priority: P2
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

AGENTS.md 自认已知限制：worktree 的 .docpath/backlog 是 merge-mediated 快照（traced copy），可 stale，重复登记的结构性根因。多会话并行时一个会话看不到另一会话新登记/已合并成果，capture 时无法跨 worktree 去重（本 checkout+主 checkout 扫描只能覆盖两处，兄弟 worktree 不可见）。优化包内的 capture 期去重只覆盖 main+本 checkout，本条负责根治：需要新的共享可见性设计（方向待 brainstorm/refine，可能是共享真源/事件流/锁+索引，不在本条预设）。

## 验收

多 worktree 并行 capture 时，任一会话能感知其他活跃 worktree 已存在的同标题/同 id 条目并在产生时提示；不再产生结构性重复登记。决策记录（Decision Brief）+ 用户确认后实现（涉及共享模型变更，可能推翻 R-238 Option B/R-273 资源分层，属重大变更门禁）。
