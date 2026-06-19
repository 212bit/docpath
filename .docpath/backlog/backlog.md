# DocPath Backlog Index

> 自动生成，供 agent / 人类稳定读取。

> 扫描时间: 2026-06-19T17:01:18.357Z

## 条目列表

| id | title | status | priority | level | task |
|----|-------|--------|----------|-------|------|
| R-216 | Smart Git Merge Driver for Backlog and Rules Markdown files | proposed | P2 | 1 |  |
| R-220 | breadcrumb.jsonl 按任务边界分隔，防止无限增长 | proposed | P2 | 2 |  |
| R-219 | state.json 加 backlog_id 字段，减少跨文件读取 | active | P3 | 1 | T-20260619-state-json-backlog-id |

## 用途说明

- `id`: backlog 条目标识（R-###）
- `status`: proposed|accepted|planned|active|done|dropped
- `priority`: P0 最高，P3 最低
- `task`: 已 promote 后关联的 task id；未关联为空
- **done 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中
