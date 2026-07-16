# DocPath Backlog Index

> 自动生成，供 agent / 人类稳定读取。

> 扫描时间: 2026-07-16T03:32:33.570Z

## 条目列表

| id | title | status | priority | level | task |
|----|-------|--------|----------|-------|------|
| R-273 | R-271 后续: tracked backlog 被 symlink 替换后, worktree 合并回 main 会删除 backlog 并留下悬空 symlink | proposed | P0 | 2 |  |
| R-259 | High-value reliability optimizations | dropped | P1 | 2 |  |
| R-230 | Design UI for DocPath workflow dashboard | dropped | P2 | 2 | T-20260621-design-ui-for-docpath-workflow-dashboard |
| R-274 | wip-note.md 未纳入 keep_workspace_views 白名单, 会被 gc/工作区清理误删且可能进 docs-index | proposed | P2 | 2 |  |
| R-249 | go/promote 的 dirty worktree 拒绝未区分 DocPath 自身产物，频繁误拦 | dropped | P3 | 1 |  |

## 用途说明

- `id`: backlog 条目标识（R-###）
- `status`: proposed|accepted|planned|active|done|dropped
- `priority`: P0 最高，P3 最低
- `task`: 已 promote 后关联的 task id；未关联为空
- **done 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中
