# T-20260619-state-json-backlog-id - state.json 加 backlog_id 字段，减少跨文件读取

> backlog_id: R-219
> backlog_source: docpath backlog add

## 1. 背景与动机

state.json 目前只有 task_id/task_title 等基础字段，没有 backlog_id。next/go 路由在需要 backlog 关联时必须读取 spec.json，增加了一次 IO。将 backlog_id 写入 state.json 后，路由命令可直接从 state.json 获取关联信息。

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
| 1 | 字段位置 | state.json vs workspace 单独文件 | state.json | 减少文件数，与 task_id 同在 |
| 2 | 来源 | agent enter 写 vs promote 写 | 两者都写 | promote 创建任务时已知 backlog_id；enter 进入执行时应刷新 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）

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

---

*此文件由 `docpath write-spec` 更新。*
