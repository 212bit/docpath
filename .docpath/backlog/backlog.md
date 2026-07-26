# DocPath Backlog Index

> 自动生成，供 agent / 人类稳定读取。

> 扫描时间: 2026-07-26T16:34:03.931Z

## 条目列表

| id | title | status | priority | level | task |
|----|-------|--------|----------|-------|------|
| R-259 | High-value reliability optimizations | dropped | P1 | 2 |  |
| R-298 | FSM completed 重入收紧: 门禁事件禁入完成态, 新增显式 task reopen (R-279/R-291 家族 FSM 层收口) | proposed | P1 | 2 |  |
| R-230 | Design UI for DocPath workflow dashboard | dropped | P2 | 2 | T-20260621-design-ui-for-docpath-workflow-dashboard |
| R-292 | plan 命令写盘先于 FSM 校验, completed 任务 plan.json 被改写后才报非法转移 | dropped | P2 | 2 |  |
| R-296 | R-293 残余: stale 夺锁的判定-执行 TOCTOU, rename 可误夺判定后新获取的活锁(全量套件 4/5 实测) | proposed | P2 | 2 |  |
| R-249 | go/promote 的 dirty worktree 拒绝未区分 DocPath 自身产物，频繁误拦 | dropped | P3 | 1 |  |

## 用途说明

- `id`: backlog 条目标识（R-###）
- `status`: proposed|accepted|planned|active|done|dropped
- `priority`: P0 最高，P3 最低
- `task`: 已 promote 后关联的 task id；未关联为空
- **done 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中
