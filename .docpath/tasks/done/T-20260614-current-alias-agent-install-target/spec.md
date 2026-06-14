# T-20260614-current-alias-agent-install-target - 明确 current alias、任务归档与多 agent install target 语义

> backlog_id: R-174
> also_completes: R-175
> backlog_source: docpath backlog capture

## 1. 背景与动机

DocPath 当前暴露出四个相关的 workflow 语义问题：

- tasks/current 是运行时 alias，但完成任务后仍可能保留最近任务内容；promote 新任务时如果只清理 plan.md，会残留旧 plan.json、analysis/* 等派生产物，导致新任务继承上一任务 completed checklist。
- canonical task evidence 保留在 tasks/T-*；历史任务归档依赖 docpath gc --force，但 closeout 和协议没有清楚说明 gc 与 git evidence 的边界。
- status --agent 与 next --agent 之前输出完全相同，agent 难以区分状态快照和下一步路由。
- install metadata 只记录单一 target，例如 opencode；但一个项目可能同时安装并支持 Codex、Claude Code、OpenCode，target 不应被理解为当前会话 agent。

R-175 同时复现了一个具体缺陷：无活跃任务时 backlog capture 输出的下一步建议是 docpath analyze --mode deep，但 analyze 非 dry-run 需要活跃任务写入 analysis/*，因此该建议会引导用户执行必然失败的命令。

## 2. 需求清单

### 功能需求

- [x] FR-1: backlog capture 在无活跃任务场景下推荐 docpath analyze --dry-run --mode deep，而不是写入式 analyze。
- [x] FR-2: backlog promote 新任务前清空 tasks/current alias，防止旧 plan.json、spec.json 或 analysis/* 残留污染新任务。
- [x] FR-3: status --agent 与 next --agent 输出可区分的 agent_view 和 agent_contract，同时保留既有 route 字段兼容性。
- [x] FR-4: install_health 暴露 adapter coverage，区分 install target 与当前会话 agent。
- [x] FR-5: 文档说明 current alias、canonical evidence、gc 归档、status/next agent contract 和多 agent adapter 语义。

### 非功能需求

- [x] NFR-1: 保持现有命令名和主要字段兼容。
- [x] NFR-2: 不让 gc 自动移动正在 closeout 的 canonical evidence。
- [x] NFR-3: 不把 tasks/current alias evidence 作为默认 git evidence。
- [x] NFR-4: 新行为有自动化测试覆盖。

## 3. 范围界定

### 包含

- backlog capture 输出提示修复。
- backlog promote current alias 清理修复。
- status/next agent 输出 contract 区分。
- install_health adapter coverage 字段。
- command-boundaries、getting-started、Agent protocol、Codex skill 与模板文档同步。
- R-174 和 R-175 相关测试。

### 不包含

- 不删除或重命名 status、next、install、gc、analyze 命令。
- 不让 agent done、review 或 changes 自动执行 gc --force。
- 不实现完整多 session 调度或跨 agent lease 协议。
- 不把 install target 当作当前会话 agent 自动推断。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | tasks/current 语义 | latest completed view / active current alias | active current alias | current 是运行态便利入口，canonical evidence 才是 durable 路径 |
| 2 | promote 清理策略 | 只删 plan.md / 清空 current alias / 保留旧 analysis | 清空 current alias | 防止任何 structured mirror 或 analysis 泄漏到新任务 |
| 3 | status/next agent contract | 完全拆分字段 / 保持重复 / 增加 view contract | 增加 view contract | 兼容旧 agent，同时让新 agent 能区分用途 |
| 4 | install target 语义 | 当前 agent / 已安装 adapter coverage | adapter coverage | 一个项目可以同时支持多个 agent，target 不等于当前会话 |
| 5 | gc 触发 | 自动归档 / closeout 后提示预览 | closeout 后提示预览 | 避免 commit 前 canonical evidence 路径被移动 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [x] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief

- 当前问题: current alias、gc 归档、status/next agent 输出和 install target 语义混在一起，导致 promote 新任务可能继承旧 plan.json，agent 入口重复，multi-agent 安装健康难以表达。
- 目标: 让 runtime alias、canonical evidence、historical archive、agent route、adapter coverage 各有明确边界，并修复 R-175 的 analyze hint 缺陷。
- 背景: 用户明确指出 current 可能没有归档、status --agent 与 next --agent 重复、install target 对多 agent 项目过于单一，并要求不间断完成 R-174 和 R-175。
- 可选方案: A 仅补文档；B 小步兼容修复 current alias、agent contract 与 install_health；C 大规模重构 install metadata 为多 manifest；D 自动 gc closeout。
- 推荐方案: 采用 B。它修复已复现缺陷，保留命令兼容性，并为后续 C 留出 adapters 字段。
- 不做什么: 不自动运行 gc --force，不移动 commit 前 canonical evidence，不删除现有 CLI 命令，不从 install target 推断当前会话 agent。
- 成本: 中等，涉及 backlog promote、agent output、install health、协议模板和测试。
- 风险: 旧 agent 若严格比较完整 YAML 可能看到新增字段；安装模板更新会触发 manifest drift，需要重新安装或 force 更新。
- 回滚方案: 删除 agent_view/agent_contract/adapters/current_agent 新字段，恢复 promote 只删 plan.md，撤回文档更新；R-175 可独立保留为低风险提示修复。
- 用户确认: 2026-06-14 用户明确回复同意，并要求不间断完成 R-174 和 R-175。

## 5. 验收标准

- [x] AC-1: backlog capture 推荐 dry-run analyze，且测试覆盖。
- [x] AC-2: promote 新任务清理 current alias stale plan.json 与 analysis，且测试覆盖。
- [x] AC-3: status --agent 与 next --agent 可通过 agent_view/agent_contract 区分，并保留 recommended_command 等兼容字段。
- [x] AC-4: install_health 包含 adapters 与 current_agent，universal 能表达 Codex、Claude Code、OpenCode 覆盖。
- [x] AC-5: docs/design/command-boundaries.md 说明 current alias、canonical evidence、gc 和 adapter coverage 边界。
- [x] AC-6: 全量 pnpm test 通过，DocPath check/review/changes 通过。
