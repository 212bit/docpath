# T-20260619-state-json-backlog-id - state.json 加 backlog_id 字段，减少跨文件读取

> backlog_id: R-219

## 1. 背景与动机

由 spec.json 渲染生成。

## 2. 需求清单

### 功能需求
- [ ] FR-1: agent enter / backlog promote 写 state.json 时包含 backlog_id 字段
- [ ] FR-2: next --agent 输出包含 backlog_id 字段

### 非功能需求
- [ ] NFR-1: 向后兼容：旧 state.json 缺 backlog_id 时不报错，值为 null

## 3. 范围界定

### 包含
- state.json WorkflowState 接口新增 backlog_id 可选字段
- agent enter / backlog promote 的 state 写入路径
- next --agent 输出新增 backlog_id

### 不包含
- go/check/changes 命令（暂不读取此字段）
- 历史 state.json 数据迁移

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | spec.json 渲染 | JSON / Markdown | JSON | 机器真源重建视图 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### 变更类型
- [x] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: next/go 读 backlog_id 需要打开 spec.json
- 目标: state.json 包含 backlog_id，减少一次 IO
- 不做什么: 不改变 spec.json 作为 backlog_id 权威来源
- 用户确认: 不需要（非重大变更）

## 5. 验收标准

- [ ] AC-1: agent enter 后 state.json 包含 backlog_id
- [ ] AC-2: next --agent 输出 backlog_id 字段
- [ ] AC-3: 旧 state.json 无 backlog_id 时读取不报错
- [ ] AC-4: pnpm test 全量绿

## Journal Record

### 📝 任务摘要
在 state.json 中新增 backlog_id 可选字段，backlog promote 和 agent enter 写入，next --agent 输出包含该字段，减少一次 spec.json IO。

### 🏗️ 架构决策
- backlog_id 写入 state.json 的两个时机：promote 时通过 TransitionPayload.backlogId 传入；agent enter 时从 spec.json 读取刷新（向后兼容已有 state）
- TransitionPayload 扩展 backlogId 可选字段，transitionWorkflow 使用条件展开避免覆盖已有 backlog_id
- agent-output 的 AgentViewOutput 接口同步增加 backlog_id 可选字段，仅当 state 有值时输出

### 💡 经验教训
- 多步骤任务需要每步 agent step --status done 后立即 check，避免 plan checklist 与实际步骤数不同步
- 向已有 state 对象加新字段时，条件展开 `...(val !== undefined ? {key: val} : {})` 比直接赋值更安全（避免 null 覆盖旧值）

### 🔮 后续改进
- go/check/changes 命令可直接从 state.json 读 backlog_id，不再需要打开 spec.json
- next --agent 输出的 backlog_id 可作为路由判断依据（如是否需要更新 backlog 状态）
