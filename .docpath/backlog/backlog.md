# DocPath Backlog Index

> 自动生成，供 agent / 人类稳定读取。

> 扫描时间: 2026-09-23T12:46:29.907Z

## 条目列表

| id | title | status | priority | level | task |
|----|-------|--------|----------|-------|------|
| R-358 | worktree merge --allow-dirty-main 假提交与语义误导修复 | proposed | P1 | 1 |  |
| R-356 | worktree backlog 快照过期根治（重复登记根因：merge-mediated 快照无实时共享） | proposed | P2 | 2 |  |
| R-359 | agent step --note 反引号被 shell 命令替换导致文字静默消失 | proposed | P2 | 1 |  |
| R-360 | go --step 对未跟踪文件的 dirty guard 报错信息不够明确 | proposed | P3 | 1 |  |
| R-361 | install --doctor 在 npm-link 自引用场景下增加漂移说明 | proposed | P3 | 1 |  |

## 用途说明

- `id`: backlog 条目标识（R-###）
- `status`: proposed|accepted|planned|active|done|dropped
- `priority`: P0 最高，P3 最低
- `task`: 已 promote 后关联的 task id；未关联为空
- **done/dropped 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中（R-352 前该行只写 done）
