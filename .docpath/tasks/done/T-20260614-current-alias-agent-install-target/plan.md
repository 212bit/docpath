## 执行计划

### S1: 修复 backlog capture 的 analyze 下一步提示
- **描述**: 修正无活跃任务时 backlog capture 输出不带 dry-run 的 analyze 建议，避免引导用户执行必然失败的写入式 analyze；同步文档和测试。
- **验收条件**: completed/no-active-task 场景下 capture 推荐 analyze --dry-run；相关回归测试覆盖 R-175。
- **依赖**: 无

### S2: 修复 promote 后 current alias 残留 stale plan
- **描述**: 明确 tasks/current 是当前任务 alias，并在 promote 新任务时清理 current 下旧 spec/plan/analysis 派生产物，防止 plan.json 继承上一任务 done 状态。
- **验收条件**: 新任务 promote 后 status/next 不再读取旧 plan.json；current alias 内容只属于当前 task_id。
- **依赖**: S1

### S3: 收紧 status/next agent 输出边界
- **描述**: 拆分 agent-facing status 与 next 语义，保留兼容字段同时让 next 专注路由、status 专注状态快照，减少重复与误导。
- **验收条件**: status --agent 与 next --agent 不再完全相同；协议文档解释两者职责。
- **依赖**: S2

### S4: 建模多 agent install target 与归档提示
- **描述**: 将 install health 从单 target 表述提升为 adapter coverage 视图，区分当前会话 agent 与项目已安装适配器；在完成态路由/closeout 中提示 gc 归档候选但不自动移动 canonical evidence。
- **验收条件**: universal 或多 agent 项目能表达 Codex、Claude Code、OpenCode 覆盖；completed canonical evidence 与 gc 归档边界有文档和测试。
- **依赖**: S2

### S5: 验证、门禁与 backlog closeout
- **描述**: 运行针对性测试、全量测试、docpath check/review/changes；将 R-174 与 R-175 收口为 done，并提交 canonical evidence。
- **验收条件**: 测试和 DocPath 门禁通过；R-174/R-175 完成；提交范围不包含 current alias evidence。
- **依赖**: S1, S2, S3, S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 -> S2 -> S3 -> S5
S2 -> S4 -> S5
