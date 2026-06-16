# T-20260615-tier-and-simplify-cli-command-surface - Tier and simplify CLI command surface

> backlog_id: R-186
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

The CLI exposes about 43 top-level commands in one flat help view, mixing core workflow, agent lifecycle, artifact sinks, maintenance tools, debug utilities, experimental flows, and compatibility aliases. This makes necessary commands look equivalent to redundant or superfluous commands.

## 验收

Default help highlights the core workflow instead of every advanced/internal command; commands have explicit visibility/deprecation metadata; redundant/superfluous commands are hidden or warned without breaking existing installed protocols; tests cover help visibility and deprecation behavior.

## 2. 需求清单

### 功能需求
- [ ] FR-1: Tier and simplify CLI command surface
  - 来源 backlog: R-186

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Add command metadata that classifies top-level commands as core, advanced, deprecated, or hidden.
- Replace the flat default `docpath --help` command list with a smaller core workflow list and an advanced-help pointer.
- Keep advanced/internal commands callable, but hide them from default help.
- Add deprecation warnings for compatibility/superfluous commands that remain callable.
- Cover the help-tier and deprecation behavior with CLI tests.

### 不包含
- Do not physically remove commands in this change.
- Do not change normal command execution semantics for supported commands.
- Do not update all external documentation/protocol templates in this pass unless tests require it.
- Do not introduce nested command namespaces or a new CLI framework.

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
- 当前问题: 默认 CLI help 暴露约 43 个顶层命令，把核心工作流、Agent 原语、artifact sinks、维护工具、debug/实验命令和兼容别名混在一起。
- 目标: 让默认 help 面向核心工作流；保留高级命令可调用性；对冗余/多余命令给出清晰迁移信号。
- 背景: CLI review 后确认需要区分 necessary / redundant / superfluous commands，并按该计划开发。
- 可选方案: 立即删除命令 / 保持现状只写文档 / 增加可见性分层和渐进式弃用。
- 推荐方案: 增加命令 metadata + 默认 help 分层 + deprecated wrapper；不立刻删除命令，降低协议和脚本破坏风险。
- 不做什么: 不删除现有命令；不改变核心 lifecycle 行为；不重构为嵌套 CLI。
- 成本: 默认 help 输出变化；依赖旧 help 列表的测试或文档需要适配。
- 风险: 用户可能暂时找不到高级命令；通过 advanced help 提示和仍可调用命令缓解。
- 回滚方案: 恢复默认 `cli.help()` 输出并移除 deprecated wrapper，保留命令实现不变。
- 用户确认: 用户明确要求 “Develop according to your plan. use worktree”。

## 5. 验收标准

- [ ] AC-1: 默认 `docpath --help` 只显示核心命令分组和 advanced/deprecated 指引。
- [ ] AC-2: 高级/维护/internal 命令仍可通过 explicit help 或 invocation 使用。
- [ ] AC-3: `brainstor`, `disclosure`, and `tdd` remain callable but emit deprecation warnings.
- [ ] AC-4: CLI tests cover default help visibility, advanced help discoverability, and deprecation warnings.

---

*此文件由 `docpath backlog promote` 生成。*
