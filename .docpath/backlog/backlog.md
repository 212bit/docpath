# DocPath Backlog Index

> 自动生成，供 agent / 人类稳定读取。

> 扫描时间: 2026-07-16T02:03:53.849Z

## 条目列表

| id | title | status | priority | level | task |
|----|-------|--------|----------|-------|------|
| R-259 | High-value reliability optimizations | dropped | P1 | 2 |  |
| R-230 | Design UI for DocPath workflow dashboard | dropped | P2 | 2 | T-20260621-design-ui-for-docpath-workflow-dashboard |
| R-271 | worktree backlog 实为 per-worktree 副本而非 live-shared symlink: stale 快照 + id 分配撞号风险 | proposed | P2 | 2 |  |
| R-249 | go/promote 的 dirty worktree 拒绝未区分 DocPath 自身产物，频繁误拦 | dropped | P3 | 1 |  |
| R-270 | 任务收口门禁串联互绊: check 强制的 docs scan 产生脏文件被 go 拒绝,应提供原子收口路线 | proposed | P3 | 2 |  |
| R-272 | 会话中断缺 WIP 注记: agent handoff 依赖自觉,断点信息只剩'开始执行' | proposed | P3 | 2 |  |

## 用途说明

- `id`: backlog 条目标识（R-###）
- `status`: proposed|accepted|planned|active|done|dropped
- `priority`: P0 最高，P3 最低
- `task`: 已 promote 后关联的 task id；未关联为空
- **done 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中
