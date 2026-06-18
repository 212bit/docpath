# T-20260618-repair-runtime-bootstrap-in-worktrees - Repair runtime bootstrap in worktrees

> backlog_id: R-203
> backlog_source: docpath backlog capture

## 1. 背景与动机

Dogfooding DocPath worktree workflow exposed two runtime bootstrap failures and one dirty guard self-blocking path:

- Worktrees or existing projects can have `.docpath/` but miss `.docpath/workspace/` runtime files. Commands that acquire `workspace/state.lock` can then fail with `ENOENT` after partially writing backlog/task artifacts.
- `docpath init` on an existing `.docpath/` registers the project but did not repair missing `workspace/state.json`, `workspace/current.md`, or `workspace/breadcrumb.md`.
- `docpath backlog capture` creates `.docpath/backlog/R-*.md` and `.docpath/backlog/backlog.md`; a following `docpath backlog promote` was blocked by the dirty worktree guard even though those files are the target backlog evidence promote is supposed to consume.

The fix should preserve the broader dirty worktree policy: do not start new implementation work on unrelated uncommitted source changes; allow only DocPath evidence that is part of the current transition.

## 2. 需求清单

### 功能需求
- [ ] FR-1: Lock acquisition must create the parent directory for the lock file before writing the lock.
- [ ] FR-2: `docpath init` on an existing `.docpath/` must repair missing runtime workspace files without `--force`.
- [ ] FR-3: `docpath backlog promote <id>` must allow dirty target backlog evidence produced by `backlog capture`, while still rejecting unrelated dirty files.
- [ ] FR-4: Dirty worktree detection must report untracked files at file granularity so path allowlists can work on newly created directories.

### 非功能需求
- [ ] NFR-1: Existing config, rules, templates, and user-authored task content must not be overwritten during runtime repair.
- [ ] NFR-2: Dirty worktree guard behavior must remain conservative for non-DocPath and unrelated DocPath changes.
- [ ] NFR-3: Regression tests must cover runtime bootstrap, promote self-blocking, and existing dirty guard rejection behavior.

## 3. 范围界定

### 包含
- Runtime directory/bootstrap repair for lock users and `docpath init`.
- `backlog capture -> backlog promote --draft` dirty guard compatibility.
- Targeted regression tests and full test validation.

### 不包含
- Project registry database write-boundary redesign.
- Dependency installation or node_modules resolution changes for worktrees.
- Changing quick task file-count policy.
- Reworking task identity drift recovery.

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Missing lock parent handling | Require callers to create workspace / make lock utility create parent | Make lock utility create parent | Centralizes the invariant for all lock users and prevents partial command failures. |
| 2 | Existing project runtime repair | Require `--force` / repair missing runtime during normal `init` registration | Repair during existing project registration | Existing `.docpath/` should not imply runtime files are present; repair is non-destructive. |
| 3 | Dirty promote after capture | Require committing backlog capture first / allow only target backlog evidence | Allow only target backlog evidence and index | Preserves source dirty protection while making the documented capture→promote route usable. |
| 4 | Untracked status granularity | Keep directory-level untracked status / use `--untracked-files=all` | Use file-level status | Path-level allowlists cannot reason about a collapsed untracked directory. |

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
- 当前问题: Runtime workspace 缺失会导致 lock 写入失败；capture 产生的 backlog 证据会让 promote 被 dirty guard 自阻塞。
- 目标: 让 worktree 和既有 `.docpath/` 项目可自愈 runtime，且让 capture→promote 成为可用的标准任务入口。
- 背景: 用户明确要求继续 dogfood DocPath，并且要求不要在未提交实现上继续叠开发，使用 worktree 隔离。
- 可选方案: 全局放宽 dirty guard；要求用户先提交 backlog capture；只允许目标 backlog 证据；要求手动创建 workspace。
- 推荐方案: 锁工具负责 parent mkdir；init 注册时补 runtime；promote 只允许目标 R-id backlog 文件和 backlog index；dirty 检测改为 file-level untracked。
- 不做什么: 不放宽源码 dirty 保护；不自动提交 backlog；不手改 `.docpath/workspace/*`。
- 成本: 增加少量 guard 逻辑和测试；`git status` 输出从 untracked 目录变为具体文件。
- 风险: allowlist 过宽会绕过 dirty 保护；通过限制到目标 R-id 和 backlog index 降低风险。
- 回滚方案: 回退 `git-dirty-guard` allowlist、`backlog promote` 调用点、`init` runtime repair 和 lock parent mkdir 改动。
- 用户确认: 用户多次确认继续修复 dogfood 暴露问题，并明确要求存在未提交变更时使用 worktree 隔离。

## 5. 验收标准

- [ ] AC-1: `transitionWorkflow` can create missing `.docpath/workspace/` before acquiring `workspace/state.lock`.
- [ ] AC-2: `docpath backlog promote` succeeds when runtime workspace is missing and creates state/current runtime views.
- [ ] AC-3: `docpath init --cwd <existing-docpath>` repairs missing `state.json`, `current.md`, and `breadcrumb.md` without overwriting existing config/rules.
- [ ] AC-4: `docpath backlog capture` followed by `docpath backlog promote <id> --draft` succeeds with only target backlog evidence dirty.
- [ ] AC-5: `docpath backlog promote` still rejects unrelated dirty files before mutating backlog links.
- [ ] AC-6: Typecheck, targeted regression tests, and full test suite pass.
