# T-20260619-fix-worktree-create-tracked-docpath-nois - Fix worktree create tracked DocPath noise

> backlog_id: R-209
> backlog_source: docpath backlog add
> user_confirmed: 用户同意修复 docpath worktree create 造成 tracked .docpath evidence 删除噪声的问题

## 1. 背景与动机

Dogfooding showed that `docpath worktree create` deletes copied `.docpath/tasks`, `.docpath/docs.md`, and `.docpath/docs-index.json` while configuring a new worktree. In projects where durable DocPath evidence is tracked, this makes the newly created worktree immediately dirty with mass deleted files, defeating the goal of clean isolated worktrees.

The command should preserve tracked DocPath evidence as the branch worktree copy, while still initializing untracked runtime workspace paths for isolation when doing so will not create Git noise.

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath worktree create` must not delete `.docpath/tasks`, `.docpath/docs.md`, or `.docpath/docs-index.json` when those paths contain tracked files.
- [ ] FR-2: Tracked DocPath resources must be preserved as tracked copies so the new worktree starts clean.
- [ ] FR-3: Untracked runtime paths such as `.docpath/workspace` and `.docpath/journal` may still be initialized for isolation when doing so does not dirty the worktree.
- [ ] FR-4: `worktree doctor` must continue to pass for worktrees created with tracked copies.

### 非功能需求
- [ ] NFR-1: Do not weaken existing safety around shared tracked resources such as backlog and rules.
- [ ] NFR-2: Existing ignored-runtime projects should keep getting independent runtime initialization.
- [ ] NFR-3: Regression tests must prove a newly created worktree is clean when durable DocPath evidence is tracked.

## 3. 范围界定

### 包含
- `docpath worktree create` cleanup policy for tracked DocPath paths.
- Regression coverage for tracked tasks/docs/workspace paths.
- Real dogfood validation creating and removing a temporary worktree.

### 不包含
- Redesigning DocPath task storage.
- Changing docs scan retention policy.
- Removing existing historical task evidence.
- Changing Git worktree branch naming semantics.

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Tracked DocPath paths during create | Delete and recreate / preserve tracked copy | Preserve tracked copy | Deleting tracked evidence makes the new worktree dirty immediately. |
| 2 | Runtime isolation when workspace is tracked | Rewrite runtime and accept dirty status / keep tracked runtime copy | Keep tracked runtime copy | A clean worktree is more important than runtime rewrite when Git already tracks workspace files. |
| 3 | Regression signal | Check only selected resources / check full git status | Check full git status | The bug was broad dirty worktree noise, so the test must inspect complete porcelain status. |

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
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: `docpath worktree create` 会删除 tracked DocPath evidence，导致新 worktree 一创建就有大量 deleted 文件。
- 目标: 让 DocPath worktree create 在 tracked evidence 项目中保持 clean，同时保留可安全初始化的 runtime 隔离。
- 背景: 用户要求修复 dogfood 暴露问题，并明确要求有未提交改动时通过 worktree 隔离开发。
- 可选方案: 继续删除；删除后自动 git restore；对 tracked 路径跳过删除；把 tracked 路径替换为 symlink。
- 推荐方案: 对 tracked `.docpath` 路径跳过删除和重写，保留为 tracked copy；仅对未 tracked runtime 路径进行隔离初始化。
- 不做什么: 不自动 untrack 历史 evidence；不修改 task archive 策略；不把 tracked 目录替换成 symlink。
- 成本: `worktree create` 的隔离语义需要区分 tracked 与 untracked 路径。
- 风险: 历史 tracked workspace 项目中 runtime 初始状态不会被重写为独立 idle；但这避免了创建即 dirty，且可后续通过 doctor/doctor cleanup 处理。
- 回滚方案: 恢复原 `toClean` 全量删除逻辑。
- 用户确认: 用户两次确认修复这些 dogfood 暴露问题。

## 5. 验收标准

- [ ] AC-1: 测试仓库追踪 `.docpath/tasks`, `.docpath/docs.md`, `.docpath/docs-index.json`, `.docpath/workspace/*` 时，`docpath worktree create` 后新 worktree 的 `git status --porcelain` 为空。
- [ ] AC-2: tracked backlog/rules 仍保留为 tracked copy，不显示 deleted 或 typechange。
- [ ] AC-3: `docpath worktree doctor` 对新 worktree 仍通过。
- [ ] AC-4: Typecheck、worktree 目标测试、真实 dogfood create/status/doctor/remove 均通过。
