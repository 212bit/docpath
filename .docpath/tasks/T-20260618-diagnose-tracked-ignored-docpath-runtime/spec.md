# T-20260618-diagnose-tracked-ignored-docpath-runtime - Diagnose tracked ignored DocPath runtime files

> backlog_id: R-201
> backlog_source: docpath backlog capture

## 1. 背景与动机

Dogfood of `docpath commit` exposed a boundary between Git ignore rules and Git index state. The repo currently ignores the whole `/.docpath/` tree, which marks canonical backlog and completed task evidence as ignored while runtime workspace files remain historically tracked. This makes staging rely on force-add behavior and hides the distinction between durable DocPath evidence and local runtime noise.

## 2. 需求清单

### 功能需求
- [ ] FR-1: Replace the broad `/.docpath/` ignore rule with precise runtime-only DocPath ignore rules.
- [ ] FR-2: Add a deterministic diagnostic that reports tracked-but-ignored DocPath runtime files and suggests an explicit `git rm --cached` cleanup command.
- [ ] FR-3: Keep canonical backlog and completed task evidence out of the runtime-noise diagnostic.

### 非功能需求
- [ ] NFR-1: The diagnostic must be read-only by default and must not mutate Git index state.
- [ ] NFR-2: The implementation must remain compatible with existing DocPath closeout and evidence workflows.

## 3. 范围界定

### 包含
- `.gitignore` DocPath/worktree ignore rule correction.
- CLI diagnostic integration for tracked ignored runtime files.
- Regression tests for runtime-noise detection and canonical evidence exclusion.

### 不包含
- Automatically running `git rm --cached` without an explicit future fix command.
- Reworking `docpath plan` contract behavior in this task.
- Worktree garbage collection UX.

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Ignore strategy | Ignore all `/.docpath/` vs runtime-only paths | Runtime-only paths | Backlog, done-task evidence, rules, protocols, and templates are durable collaboration assets. |
| 2 | Cleanup behavior | Auto-untrack vs diagnostic first | Diagnostic first | `git rm --cached` changes index state and should require an explicit user action. |
| 3 | Diagnostic placement | New standalone command vs integrate with existing health check | Use the smallest existing diagnostic surface first | The behavior should be easy to test and can later be surfaced by `status` or `doctor`. |

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
- [x] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: Broad `.gitignore` rules and tracked runtime files make DocPath evidence staging ambiguous and can force `git add -f` for legitimate evidence.
- 目标: Separate durable DocPath evidence from runtime noise and expose tracked ignored runtime files as an actionable diagnostic.
- 背景: The issue was found while dogfooding `docpath commit` after Sentinel workflow friction analysis.
- 可选方案: Keep force-add only; ignore all `.docpath`; ignore runtime-only paths plus diagnostic.
- 推荐方案: Use runtime-only ignore rules and a read-only diagnostic with explicit cleanup instructions.
- 不做什么: Do not auto-untrack files in this task and do not broaden scope into plan-command contract repair.
- 成本: Small CLI/test change plus one ignore rule correction.
- 风险: Existing repositories with broad ignore rules may still need a future installer/doctor migration.
- 回滚方案: Revert the ignore rule and diagnostic changes.
- 用户确认: User agreed to prioritize this optimization after `docpath commit` dogfood.

## 5. 验收标准

- [ ] AC-1: `.gitignore` no longer ignores the entire `/.docpath/` tree and still ignores DocPath runtime state plus `.worktrees/`.
- [ ] AC-2: A read-only diagnostic reports tracked ignored runtime files and prints an explicit `git rm --cached` suggestion.
- [ ] AC-3: Canonical backlog and completed task evidence are not reported as runtime noise.
- [ ] AC-4: Focused automated tests pass.
