# DocPath Backlog Index

> 自动生成，供 agent / 人类稳定读取。

> 扫描时间: 2026-07-15T02:22:59.817Z

## 条目列表

| id | title | status | priority | level | task |
|----|-------|--------|----------|-------|------|
| R-259 | High-value reliability optimizations | dropped | P1 | 2 |  |
| R-267 | docpath init --scan-existing 现有项目快速接入扫描功能 | proposed | P1 | 2 |  |
| R-230 | Design UI for DocPath workflow dashboard | dropped | P2 | 2 | T-20260621-design-ui-for-docpath-workflow-dashboard |
| R-243 | Fix project brief next_hint after intake brief | proposed | P2 | 1 |  |
| R-250 | check 频繁报 docs-index 陈旧告警但无自愈/重建路径 | proposed | P2 | 1 |  |
| R-252 | review 检测到 spec.md/spec.json 不同步但仅提示不修复 | proposed | P2 | 1 |  |
| R-254 | review --skip-skill-review 重复传参 crash: item.split is not a function | proposed | P2 | 1 |  |
| R-255 | review-skill file set mismatch 阻塞正常代码（0 错误仍被卡） | proposed | P2 | 1 |  |
| R-257 | Memory Indexing: docpath reveal 升级为内容检索 | active | P2 | 1 | T-20260712-memory-indexing-docpath-reveal |
| R-262 | changes --agent task-aware 文件分组与显式 --task/--scope 归组 | proposed | P2 | 2 |  |
| R-249 | go/promote 的 dirty worktree 拒绝未区分 DocPath 自身产物，频繁误拦 | proposed | P3 | 1 |  |
| R-261 | journal --dry-run 归档预览文字与默认 archive policy 不符 | proposed | P3 | 1 |  |
| R-263 | promote/write-spec 真源同步语义未前置化（FR checklist 漏进 spec.json,brainstorm yaml 仅作背景） | proposed | P3 | 1 |  |

## 用途说明

- `id`: backlog 条目标识（R-###）
- `status`: proposed|accepted|planned|active|done|dropped
- `priority`: P0 最高，P3 最低
- `task`: 已 promote 后关联的 task id；未关联为空
- **done 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中
