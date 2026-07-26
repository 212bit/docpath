# DocPath Backlog Index

> 自动生成，供 agent / 人类稳定读取。

> 扫描时间: 2026-07-26T14:15:12.105Z

## 条目列表

| id | title | status | priority | level | task |
|----|-------|--------|----------|-------|------|
| R-259 | High-value reliability optimizations | dropped | P1 | 2 |  |
| R-230 | Design UI for DocPath workflow dashboard | dropped | P2 | 2 | T-20260621-design-ui-for-docpath-workflow-dashboard |
| R-290 | CLAUDE.md Lifecycle 顺序与实现矛盾: 文档 agent enter 在 go 之前, CLI 在 planning 阶段 fail-loud 要求先 go | proposed | P2 | 2 |  |
| R-291 | plan 命令写盘先于 FSM 校验: completed 任务 plan.json 被改写后才报 Illegal transition, 半执行污染 canonical 证据 | proposed | P2 | 2 |  |
| R-292 | plan 命令写盘先于 FSM 校验, completed 任务 plan.json 被改写后才报非法转移 | dropped | P2 | 2 |  |
| R-249 | go/promote 的 dirty worktree 拒绝未区分 DocPath 自身产物，频繁误拦 | dropped | P3 | 1 |  |

## 用途说明

- `id`: backlog 条目标识（R-###）
- `status`: proposed|accepted|planned|active|done|dropped
- `priority`: P0 最高，P3 最低
- `task`: 已 promote 后关联的 task id；未关联为空
- **done 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中
