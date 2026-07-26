# DocPath Backlog Index

> 自动生成，供 agent / 人类稳定读取。

> 扫描时间: 2026-07-26T12:05:37.201Z

## 条目列表

| id | title | status | priority | level | task |
|----|-------|--------|----------|-------|------|
| R-286 | 状态写入锁下沉: mutateCurrentState 唯一变更入口, 消除 8 处无锁旁路 RMW | proposed | P0 | 2 |  |
| R-287 | spec/plan 结构化字段单真源: MD managed block 自动重渲染, desync 由自愈取代告警 | proposed | P0 | 3 |  |
| R-288 | git-dirty-guard 修缮: isDocpathWorktree symlink 死逻辑 + isActiveTask 阶段条件误拦回补 | proposed | P0 | 1 |  |
| R-259 | High-value reliability optimizations | dropped | P1 | 2 |  |
| R-230 | Design UI for DocPath workflow dashboard | dropped | P2 | 2 | T-20260621-design-ui-for-docpath-workflow-dashboard |
| R-249 | go/promote 的 dirty worktree 拒绝未区分 DocPath 自身产物，频繁误拦 | dropped | P3 | 1 |  |

## 用途说明

- `id`: backlog 条目标识（R-###）
- `status`: proposed|accepted|planned|active|done|dropped
- `priority`: P0 最高，P3 最低
- `task`: 已 promote 后关联的 task id；未关联为空
- **done 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中
