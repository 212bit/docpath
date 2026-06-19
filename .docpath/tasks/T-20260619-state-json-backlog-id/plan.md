## 执行计划

### S1: WorkflowState 接口加 backlog_id 可选字段，promote/enter 写入
- **描述**: 在 WorkflowState 类型定义加 `backlog_id?: string | null`；backlog promote 在创建任务时从 spec.json/backlog item 读取 backlog_id 写入 state；agent enter 在进入执行时读取 spec.json 的 backlog_id 刷新 state
- **验收条件**: tsc --noEmit 通过；state.json 有 backlog_id 字段；旧 state.json 缺 backlog_id 时读取正常
- **依赖**: 无

### S2: next --agent 输出 backlog_id
- **描述**: generateAgentOutput 的 next_action YAML 输出新增 backlog_id 字段（来自 state.json）
- **验收条件**: docpath next --agent 输出包含 backlog_id 行
- **依赖**: S1

### S3: pnpm test 全量验证
- **描述**: pnpm test 全量绿；docpath check 通过
- **验收条件**: 全量测试绿；docpath check 通过
- **依赖**: S1, S2

## Checklist
- [ ] S1
- [ ] S2
- [ ] S3

## 依赖关系图
S1 → S2 → S3
