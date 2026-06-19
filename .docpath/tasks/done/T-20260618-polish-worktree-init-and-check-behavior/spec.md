# T-20260618-polish-worktree-init-and-check-behavior - Polish worktree init and check behavior

> backlog_id: R-205
> backlog_source: docpath backlog capture

## 1. 背景与动机

Dogfooding DocPath in isolated Git worktrees exposed two workflow polish issues:

- `docpath init --cwd <existing-docpath>` can successfully repair missing runtime workspace files, then exit nonzero because the project registry database is read-only. The successful repair is masked by an unrelated registry write boundary failure.
- `docpath check` in a Git worktree fails with `tsc: command not found` / `tsup: command not found` when the worktree itself has no `node_modules`, even though the main checkout has `node_modules/.bin` and validation can pass when that bin directory is added to `PATH`.

Both issues make worktree dogfooding noisier than necessary and push agents toward manual environment workarounds.

## 2. 需求清单

### 功能需求
- [ ] FR-1: Existing-project `docpath init` must keep runtime repair successful even when project registry registration fails.
- [ ] FR-2: Existing-project `docpath init` must report registry registration failure as a warning with actionable context instead of exiting nonzero after repair.
- [ ] FR-3: `docpath check` must discover a main-checkout `node_modules/.bin` when running from a linked Git worktree without local dependencies.
- [ ] FR-4: Check subprocesses must receive the enhanced `PATH` consistently for typecheck, build, lint, and test commands.

### 非功能需求
- [ ] NFR-1: New-project initialization should keep fail-loud behavior for core initialization failures.
- [ ] NFR-2: Worktree dependency discovery must be deterministic and local; no dependency install or network access.
- [ ] NFR-3: Existing non-worktree check behavior must remain unchanged when local dependencies are present.

## 3. 范围界定

### 包含
- Existing-project init registry warning behavior.
- Worktree-aware command environment for `docpath check`.
- Regression tests for registry failure and worktree PATH augmentation.

### 不包含
- Redesigning the project registry schema.
- Installing dependencies automatically.
- Changing `docpath worktree doctor` output.
- Merging previous worktree branches into main.

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Registry failure after repair | Fail command / warn and continue | Warn and continue for existing-project registration | Runtime repair is the user-visible local fix; registry availability is secondary. |
| 2 | Check dependency resolution | Require local node_modules / augment PATH from main checkout | Augment PATH from main checkout when available | Keeps validation local and avoids requiring duplicate installs per worktree. |
| 3 | Discovery source | Hardcode parent path / use Git common dir | Use Git common dir to locate main checkout | Works for standard Git worktrees without repo-specific path assumptions. |

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
- 当前问题: worktree 中 init/check 的环境边界导致成功修复被非核心失败掩盖，或需要手动 PATH workaround。
- 目标: 让 existing-project init 和 check 在 DocPath worktree dogfood 中更稳健。
- 背景: 用户同意修复上一轮暴露的 registry DB 和 worktree check 依赖解析问题。
- 可选方案: 继续要求手动设置 registry/PATH；在命令中降级/自动发现；让 worktree doctor 只提示。
- 推荐方案: existing init 对 registry 写失败 warning-only；check 使用 Git common dir 找 main `node_modules/.bin` 并注入子进程 PATH。
- 不做什么: 不自动安装依赖；不改变新项目核心 init 失败语义；不绕过 check。
- 成本: 增加环境解析逻辑和测试 fixture。
- 风险: PATH 注入可能选择错误 checkout；通过只在检测到 Git common dir 且目标 bin 存在时追加降低风险。
- 回滚方案: 移除 init warning catch 和 check PATH augmentation。
- 用户确认: 用户明确同意修复这些 dogfood 问题。

## 5. 验收标准

- [ ] AC-1: Existing `.docpath/` 项目 runtime repair 成功但 registry DB 只读时，`docpath init` exit 0 并输出 warning。
- [ ] AC-2: Existing `.docpath/` 项目 registry 可写时仍正常注册。
- [ ] AC-3: `docpath check` 从 Git worktree 运行时，可使用 main checkout 的 `node_modules/.bin` 找到 `tsc` / `tsup`。
- [ ] AC-4: Typecheck/build/test subprocesses 都使用增强后的 PATH。
- [ ] AC-5: 回归测试覆盖 registry warning 和 worktree check PATH augmentation。
