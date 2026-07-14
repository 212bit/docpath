# T-20260713-hooks-fsm-snapshot-bridge-hook-agent-con - hooks: FSM Snapshot Bridge — 内部生命周期 hook + agent context snapshot

> backlog_id: R-266
> backlog_source: docpath backlog add

## 1. 背景与动机

# 背景

当前 DocPath 拥有严谨的 FSM 引擎（RuntimeWorkflowState + phase/gate 双约束 + L0-L3 复杂度分级），但 AI 仍需要主动调用 `docpath next --agent` 才能感知状态。只靠人工/agent 记得读取状态是软约束：agent 忘跑、跑错时机，或上下文压缩后丢失状态时，FSM 的价值会打折。

**核心判断**：DocPath 需要 hook，但第一阶段不做平台级 pre-prompt hook 大工程。应先建设 DocPath 内部生命周期 hook + 机器可读 FSM Snapshot Bridge，让状态随生命周期变化稳定产出，平台适配只是后续消费该 snapshot 的 adapter。

# 提案

在现有 `src/hooks/` 生命周期 hook 基础上扩展一个 FSM Snapshot Bridge，作为 FSM 引擎与 agent context 之间的内部桥梁。FSM 仍以 `.docpath/workspace/state.json` 和 `src/engine/transitions.ts` 为真源；snapshot 只是可消费视图，不另起一套状态机。

- `session_start`：生成/刷新 agent snapshot，包含当前状态、下一步、风险和 drift。
- `before_state_change`：供 `go/check/review/agent step/agent done/journal` 等状态变更命令统一检查 drift/lock/并发信号。
- `after_state_change`：状态成功变更后刷新 snapshot。
- `task_end`：与 journal/update-spec 经验反哺衔接，但不在本任务内扩展 R-265 的 journal 语义。
- `docpath hooks status --agent`：输出机器可读 FSM snapshot，供 agent/IDE/外部 adapter 读取。

- `phase`
- `gate`
- `state`
- `task_id`
- `task_title`
- `current_step`
- `recommended_command`
- `next_valid_events` 或等价合法转移摘要，来源必须复用 `src/engine/transitions.ts`
- `drift`
- `drift_lock`
- `active_sessions`
- `updated_at`

- 不承诺 Claude Code “每次 prompt 前自动注入”，除非后续确认平台有稳定 pre-prompt API。
- 不在本任务实现 Cursor/Copilot/Codex/OpenCode 平台 adapter。
- 不让 hook 直接绕过 FSM 修改状态。
- 不复制一套合法转移规则；合法路径必须从现有 transition/event 定义派生。

# 验收标准

1. `docpath hooks status --agent` 输出机器可读 FSM snapshot。
2. Snapshot 包含 `phase/gate/state/current_step/recommended_command/drift/drift_lock/active_sessions`。
3. 合法转移摘要来自 `src/engine/transitions.ts` 的事件/transition 定义，不能手写第二套规则。
4. drift 检测产生明确的 `drift_lock` 信号。
5. 至少一个状态变更命令在 `drift_lock` 存在时 fail-loud，并提示恢复路径。
6. 状态成功变更后 snapshot 会刷新，避免 agent 读取陈旧状态。
7. 平台级 pre-prompt 注入、Cursor/Copilot adapter 明确作为后续 backlog，不属于 R-266 MVP。

## 2. 需求清单

### 功能需求
- [ ] FR-1: hooks: FSM Snapshot Bridge — 内部生命周期 hook + agent context snapshot
  - 来源 backlog: R-266

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- hooks: FSM Snapshot Bridge — 内部生命周期 hook + agent context snapshot

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [x] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: # 背景
- 目标: hooks: FSM Snapshot Bridge — 内部生命周期 hook + agent context snapshot
- 背景: 来自 backlog R-266，Decision Brief 证据: Decision: internal lifecycle hook + FSM Snapshot Bridge first; platform pre-prompt adapter deferred
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-07-13 用户确认需要 hook，但同意先做内部 lifecycle hook + snapshot bridge，不做平台级 pre-prompt 大工程

### 已有 Decision Brief (来自 backlog evidence)

Decision: internal lifecycle hook + FSM Snapshot Bridge first; platform pre-prompt adapter deferred

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-266 与任务 T-20260713-hooks-fsm-snapshot-bridge-hook-agent-con 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
