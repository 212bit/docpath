# DocPath Backlog Index

> 自动生成，供 agent / 人类稳定读取。

> 扫描时间: 2026-07-06T10:18:50.967Z

## 条目列表

| id | title | status | priority | level | task |
|----|-------|--------|----------|-------|------|
| R-248 | write-spec --stdin 成功写入后误报未预期错误，退出码 1 误导 agent | proposed | P1 | 1 |  |
| R-251 | write-plan 成功后阶段被置回 planning，plan.md/plan.json 哈希反复不一致 | proposed | P1 | 2 |  |
| R-230 | Design UI for DocPath workflow dashboard | dropped | P2 | 2 | T-20260621-design-ui-for-docpath-workflow-dashboard |
| R-237 | Elevate /learn priority in status when pending lesson candidates and regression warnings exist | proposed | P2 | 2 |  |
| R-243 | Fix project brief next_hint after intake brief | proposed | P2 | 1 |  |
| R-250 | check 频繁报 docs-index 陈旧告警但无自愈/重建路径 | proposed | P2 | 1 |  |
| R-252 | review 检测到 spec.md/spec.json 不同步但仅提示不修复 | proposed | P2 | 1 |  |
| R-253 | 步骤主条目 done 后底部 checklist 未同步勾选 | proposed | P2 | 1 |  |
| R-249 | go/promote 的 dirty worktree 拒绝未区分 DocPath 自身产物，频繁误拦 | proposed | P3 | 1 |  |

## 用途说明

- `id`: backlog 条目标识（R-###）
- `status`: proposed|accepted|planned|active|done|dropped
- `priority`: P0 最高，P3 最低
- `task`: 已 promote 后关联的 task id；未关联为空
- **done 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中
