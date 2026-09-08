# R-322 解决 5 起历史 backlog id 撞号(active/archived 同 id 不同需求)

## 1. 分析与裁决结论

### 1.1 冲突原因
在 R-273（统一号池）落地前，worktree 与 main 号池隔离导致分配了相同的 ID。
R-260, R-261, R-262, R-263, R-268 在 active 与 archived 中各存一条，是两组完全独立的需求。

### 1.2 重分配与迁移方案
保留已在 archived 目录下的历史条目 ID 不变；
为 active 目录下 5 条已完成的条目重分配全局唯一的新 ID（R-323 ~ R-327），并迁移至 archived 目录：
- active R-260 -> archived R-323 (T-20260714-done-commit)
- active R-261 -> archived R-324 (T-20260715-journal-dry-run-archive-policy)
- active R-262 -> archived R-325 (T-20260715-changes-agent-task-aware-task-scope)
- active R-263 -> archived R-326 (T-20260715-promote-write-spec-fr-checklist-spec-jso)
- active R-268 -> archived R-327 (T-20260715-write-spec-stdin-spec-phase-drafting)

同步修正对应 frontmatter 及 spec/task links。
