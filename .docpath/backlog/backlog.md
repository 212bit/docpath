# DocPath Backlog Index

> 自动生成，供 agent / 人类稳定读取。

> 扫描时间: 2026-07-17T12:08:43.409Z

## 条目列表

| id | title | status | priority | level | task |
|----|-------|--------|----------|-------|------|
| R-259 | High-value reliability optimizations | dropped | P1 | 2 |  |
| R-230 | Design UI for DocPath workflow dashboard | dropped | P2 | 2 | T-20260621-design-ui-for-docpath-workflow-dashboard |
| R-282 | backlog edit --acceptance/--background 不替换正文占位段, 与 promote 成熟度检查不一致 | proposed | P2 | 2 |  |
| R-283 | go --step 认领当前任务下一步被本任务自身脏文件拦截, 需 run start 绕行 | proposed | P2 | 2 |  |
| R-284 | promote 脚手架质量: AC 双前缀 / Decision Brief 垃圾解析 / 变更类型误预勾 | proposed | P2 | 2 |  |
| R-285 | 跨任务陈旧 skill 证据经 file-set-mismatch 降级警告放行 review | proposed | P2 | 2 |  |
| R-249 | go/promote 的 dirty worktree 拒绝未区分 DocPath 自身产物，频繁误拦 | dropped | P3 | 1 |  |

## 用途说明

- `id`: backlog 条目标识（R-###）
- `status`: proposed|accepted|planned|active|done|dropped
- `priority`: P0 最高，P3 最低
- `task`: 已 promote 后关联的 task id；未关联为空
- **done 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中
