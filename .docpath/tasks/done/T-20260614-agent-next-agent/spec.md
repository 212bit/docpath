# T-20260614-agent-next-agent - 将 agent 启动协议改为单命令 next --agent

> backlog_id: R-176
> backlog_source: docpath backlog capture

## 1. 背景与动机

## 背景

用户确认将 agent protocol 的启动入口从 status --agent + next --agent 双命令收敛为单命令 next --agent；status --agent 保留为诊断/显式状态查看命令。

## 验收

AGENTS/CODEX/CLAUDE/OPENCODE 及安装模板、Codex skill、handoff 文案不再要求启动时同时运行 status --agent 和 next --agent；测试覆盖安装产物与 handoff 文案的新语义。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 将 agent 启动协议改为单命令 next --agent
  - 来源 backlog: R-176

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 将 agent 启动/恢复协议改为单入口 `docpath next --agent`
- 保留 `docpath status --agent` 作为显式状态查看、诊断漂移、状态变更后确认的命令
- 同步顶层协议、安装模板、Codex skill 模板、handoff 恢复文案和相关测试

### 不包含
- 删除或重命名 `docpath status --agent`
- 改变 `status --agent` 或 `next --agent` 的 YAML 字段兼容性
- 改变 install target / current_agent 的语义

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | agent 启动入口 | 继续 status+next / 合并命令 / 默认 next 单入口 | 默认 next 单入口 | `next --agent` 已包含 route 与紧凑状态，能减少重复 CLI 调用；`status --agent` 保留诊断价值 |
| 2 | 兼容性 | 删除 status 或保持 status | 保持 status | 现有脚本、测试和人工诊断仍依赖 status，不应破坏命令面 |

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
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: Agent protocol 要求启动时连续运行 `docpath status --agent` 和 `docpath next --agent`，但两者 agent 输出主体高度重复，导致恢复流程冗余。
- 目标: 将启动/恢复默认入口收敛为 `docpath next --agent`，同时保留 `docpath status --agent` 的诊断角色。
- 背景: 用户观察到两个命令返回相同字段，并明确要求“修改 agent protocol，把双命令启动改成单命令启动”。
- 可选方案: 继续双命令；合并 status/next；保持两个命令但协议默认只调用 next。
- 推荐方案: 保持两个命令兼容，协议默认只调用 `docpath next --agent`；仅在显式状态查看、调试漂移或状态变更后确认时调用 `docpath status --agent`。
- 不做什么: 不删除 `status --agent`；不改变 `next --agent`/`status --agent` 的结构化输出兼容字段；不把 status 从 install 配置中移除。
- 成本: 需要同步协议文件、安装模板、Codex skill 模板、handoff 文案和测试断言。
- 风险: 某些旧 agent 仍按旧协议调用双命令，但行为仍兼容；安装产物若未刷新会出现 manifest drift。
- 回滚方案: 恢复协议模板中的 First Steps/Required Route 文案为 status+next 双命令，并回退 handoff 文案与测试断言。
- 用户确认: 用户明确指示“修改 agent protocol，把双命令启动改成单命令启动”。

## 5. 验收标准

- [ ] AC-1: 顶层 `AGENTS.md`、`CODEX.md`、`CLAUDE.md`、`OPENCODE.md` 的启动步骤默认只要求 `docpath next --agent`
- [ ] AC-2: `templates/` 和 `templates/protocols/` 安装模板同步单命令启动语义
- [ ] AC-3: Codex skill 当前文件和模板同步为 `next --agent` 单入口，`status --agent` 仅为诊断用途
- [ ] AC-4: `agent handoff` 生成的 Resume Protocol 指示新 session 从 `docpath next --agent` 开始
- [ ] AC-5: 相关 install、handoff、getting-started 测试和全量测试通过

---

*此文件由 `docpath backlog promote` 生成，并在执行中补充重大变更门禁。*
