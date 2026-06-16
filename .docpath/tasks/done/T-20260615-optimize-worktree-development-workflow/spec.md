# T-20260615-optimize-worktree-development-workflow - Optimize worktree development workflow

> backlog_id: R-187
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

The previous worktree implementation completed successfully, but the process exposed repeated friction: fresh worktrees can miss dependency hydration, session ownership can drift when `DOCPATH_SESSION` is not set before lifecycle commands, worktree `.docpath` isolation can flood closeout with expected deleted/modified runtime files, and there is no first-class readiness command for a worktree before coding starts.

## 验收

Worktree development has a first-class doctor/readiness command; created worktrees print the recommended session export and doctor command; closeout output distinguishes worktree isolation noise from source/test changes; tests cover the optimized flow behavior.

## 2. 需求清单

### 功能需求
- [ ] FR-1: Add `docpath worktree doctor [name]` to validate a worktree setup before development.
- [ ] FR-2: Update `docpath worktree create <name>` next-step output with a session export, doctor command, and next route.
- [ ] FR-3: Update `docpath changes --agent` / `--json` to report expected worktree `.docpath` isolation noise separately from normal DocPath changes.
- [ ] FR-4: Add regression tests for worktree doctor, create guidance, and closeout classification.

### 非功能需求
- [ ] NFR-1: Preserve existing worktree create/list/remove behavior and existing `changes` readiness semantics unless a new field is purely additive.
- [ ] NFR-2: Keep output append-only for agent-readable reports where possible.
- [ ] NFR-3: Do not require network access or dependency installation inside doctor; report dependency status only.

## 3. 范围界定

### 包含
- Worktree CLI readiness checks for symlinks, isolated runtime directories, state files, optional `node_modules`, and session guidance.
- Worktree create guidance that explicitly recommends `export DOCPATH_SESSION=codex-<worktree-name>`.
- Worktree-aware closeout classification for expected `.docpath` isolation noise.
- Unit/integration tests for the optimized workflow.

### 不包含
- Automatically installing dependencies.
- Automatically adopting or stealing active session leases.
- Rewriting the storage model for tracked historical `.docpath` files.
- Changing Git commit behavior or staging files automatically.

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Worktree readiness surface | Reuse `status` / add `worktree doctor` | Add `worktree doctor` | The checks are specific to worktree structure and setup readiness, not normal workflow status. |
| 2 | Dependency hydration | Auto-install / report-only | Report-only | Installing dependencies needs network and approval; doctor should be deterministic and read-only. |
| 3 | Closeout noise | Hide `.docpath` changes / classify expected isolation | Classify expected isolation | Hiding would obscure real DocPath evidence; classification preserves visibility while reducing noise. |
| 4 | Session guidance | Persist env automatically / print export command | Print export command | Shell environment cannot be reliably mutated by a child process; explicit guidance is portable. |

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
- 当前问题: Worktree development works but lacks a readiness command, clear session setup, and clean closeout classification for expected `.docpath` isolation noise.
- 目标: Make the recommended optimized workflow executable through the CLI: create, set session, run doctor, develop, validate, close out with signal separated from noise.
- 背景: The preceding worktree task succeeded but exposed dependency setup failure, session lease mismatch, noisy `.docpath` status, and unrelated closeout warnings.
- 可选方案: Document the process only / add a broad workflow command / add focused worktree doctor and closeout classification.
- 推荐方案: Add `docpath worktree doctor [name]`, improve create next steps, and add worktree isolation fields to changes reports.
- 不做什么: Do not auto-install dependencies, auto-stage changes, remove tracked historical `.docpath` artifacts, or change normal command execution semantics.
- 成本: New command path and report fields require tests and minor documentation in CLI help.
- 风险: Extra output could confuse existing parsers; mitigate by keeping changes additive and preserving existing fields.
- 回滚方案: Remove the doctor action, revert create guidance text, and remove additive closeout fields.
- 用户确认: User requested: "Implement the recommended optimized workflow" after reviewing the analysis.

## 5. 验收标准

- [ ] AC-1: `docpath worktree create <name>` prints `export DOCPATH_SESSION=codex-<name>` and `docpath worktree doctor <name>` in its next steps.
- [ ] AC-2: `docpath worktree doctor <name>` validates an existing worktree and reports pass/warn/fail status without mutating files.
- [ ] AC-3: `docpath changes --agent` and `--json` include a worktree isolation report when run in a DocPath worktree.
- [ ] AC-4: Existing worktree create/list/remove and changes tests continue to pass.
- [ ] AC-5: Focused tests and full validation pass, or remaining issues are documented.
