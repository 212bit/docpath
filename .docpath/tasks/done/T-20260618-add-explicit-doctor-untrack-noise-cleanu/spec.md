# T-20260618-add-explicit-doctor-untrack-noise-cleanu - Add explicit doctor untrack-noise cleanup

> backlog_id: R-202
> backlog_source: docpath backlog capture

## 1. 背景与动机

`docpath doctor` now detects tracked-but-ignored DocPath runtime files and prints a `git rm --cached` suggestion. The next step is to make that cleanup available as an explicit opt-in command flag while preserving the default read-only diagnostic behavior.

The cleanup changes Git index state, so it must be narrow, predictable, and limited to the runtime-noise whitelist already used by the diagnostic. It must never untrack canonical DocPath evidence such as backlog items or completed task artifacts.

## 2. 需求清单

### 功能需求
- [ ] FR-1: Add an explicit `docpath doctor --untrack-noise` cleanup mode.
- [ ] FR-2: Cleanup must run `git rm --cached -- <files>` only for tracked ignored runtime-noise paths.
- [ ] FR-3: Default `docpath doctor` and `docpath doctor --json` remain read-only diagnostics.
- [ ] FR-4: Canonical backlog and done-task evidence must remain excluded from cleanup candidates even under broad `/.docpath/` ignore rules.

### 非功能需求
- [ ] NFR-1: Cleanup must be idempotent when no runtime-noise files are present.
- [ ] NFR-2: Cleanup output must state exactly what was untracked and how many files were affected.
- [ ] NFR-3: Tests must exercise the mutating path only in temporary Git repositories.

## 3. 范围界定

### 包含
- CLI option registration for `doctor --untrack-noise`.
- Git hygiene cleanup implementation using the existing runtime-noise whitelist.
- Focused tests for cleanup and canonical evidence preservation.

### 不包含
- Automatically running cleanup in the current repository.
- Adding broad `doctor --fix` behavior for non-runtime files.
- Changing `docpath commit` staging behavior.

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Cleanup activation | Default auto-fix vs explicit flag | Explicit `--untrack-noise` | Git index mutation must be opt-in. |
| 2 | Cleanup scope | All ignored tracked files vs runtime whitelist | Runtime whitelist only | Canonical evidence may be ignored by bad rules but should not be untracked as noise. |
| 3 | No-candidate behavior | Error vs pass | Pass | Idempotent cleanup is friendlier for repeated doctor runs and scripts. |

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
- 当前问题: `doctor` can diagnose tracked ignored runtime noise but cannot safely perform the suggested cleanup.
- 目标: Provide explicit opt-in cleanup for runtime-noise Git index entries.
- 背景: Dogfood showed `.docpath/workspace/*` remains historically tracked and ignored, leaving repeated runtime-only dirty states.
- 可选方案: Keep suggestion-only; add broad `--fix`; add narrow `--untrack-noise`.
- 推荐方案: Add narrow `--untrack-noise` limited to runtime-noise whitelist.
- 不做什么: Do not auto-clean by default and do not untrack canonical evidence.
- 成本: Small CLI/util/test change.
- 风险: A bug in path classification could untrack durable evidence; tests must cover broad-ignore evidence preservation.
- 回滚方案: Revert the option and cleanup helper; read-only doctor remains intact.
- 用户确认: User said continue after the diagnostic task and prior discussion identified explicit cleanup as the next optimization.

## 5. 验收标准

- [ ] AC-1: `docpath doctor --untrack-noise` untracks only tracked ignored runtime-noise files in a temporary Git repository.
- [ ] AC-2: Canonical backlog and completed task evidence remain tracked after cleanup under broad `/.docpath/` ignore rules.
- [ ] AC-3: Default `doctor` and `doctor --json` stay read-only and still fail when runtime noise exists.
- [ ] AC-4: Focused tests and DocPath gates pass.
