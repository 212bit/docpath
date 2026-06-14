## 执行计划

### S1: 定位 git closeout 现有行为
- **描述**: 核对 completed/review_pass 路由、`docpath changes` 报告结构、ignored evidence 检测和 agent protocol 模板，确认最小改动点。
- **验收条件**: 明确受影响文件与当前行为；保留“不自动 git add/commit”的边界。
- **依赖**: 无

### S2: 接入完成态 git closeout 路由
- **描述**: 在 `docpath next --agent` 的 completed/review_pass 分支中，当存在工作区变更或 canonical ignored evidence 时优先推荐 `docpath changes --agent`。
- **验收条件**: 已完成任务在 git closeout 未完成时不会直接跳到 backlog/learn/gc；无变更时保持原路由兼容。
- **依赖**: S1

### S3: 精炼 `docpath changes` readiness 语义
- **描述**: 将 ignored evidence 分类为 canonical evidence 与 alias evidence，修正 `git add -f` 建议，并让 `--since` 明确标记 ignored evidence readiness 检查被跳过。
- **验收条件**: canonical ignored evidence 会阻塞 readiness 并给出精确建议；`tasks/current` alias 不默认进入 force-add 建议；since 模式不会被误读为 pre-commit readiness。
- **依赖**: S1

### S4: 补充测试与 agent protocol 文档
- **描述**: 增加 completed routing、ignored evidence 分类、since semantics 的测试，并更新本仓库与模板中的 Agent 协议说明。
- **验收条件**: 自动化测试覆盖新增行为；协议写明 commit 前运行 `docpath changes --agent`。
- **依赖**: S2, S3

### S5: 运行质量门禁并归档
- **描述**: 运行针对性测试、全量测试、`docpath check`、`docpath review` 和 `docpath agent done`，修复发现的问题。
- **验收条件**: 门禁通过；任务进入 completed/review_pass 状态；git closeout 输出可解释。
- **依赖**: S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 -> S2 -> S4 -> S5
S1 -> S3 -> S4 -> S5
