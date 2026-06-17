# T-20260617-harden-docpath-workflow-friction-found-i - Harden DocPath workflow friction found in Sentinel flow-runner

> backlog_id: R-199
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

Sentinel flow-runner release/development exposed four DocPath workflow friction points:

- `quick` closeout counts tracked `.docpath/workspace` runtime files toward the guarded non-DocPath file limit and can block tiny README-only tasks.
- Manual rollback of workspace runtime files can create task identity drift between state, sessions, and current/canonical task files.
- `backlog promote` can omit explicit UI design gate defaults, so pure CLI/script tasks are blocked at `go --step`.
- Direct Markdown edits to `spec.md`/`plan.md` do not update `spec.json`/`plan.json` machine truth, so `next` continues to report stale missing context.

This task also reproduced two related workflow consistency issues while promoting this backlog item: `backlog promote` recommended `done or park`, but `docpath task` only supports `abort|reset`; after aborting the previous task and promoting R-199, stale `last-check` state still caused `next --agent` to recommend `docpath debug reproduce` even though the new task needed planning/go.

These issues increase recovery cost for small documentation, packaging, CLI, and release tasks. They also push agents toward unsafe manual rollback of DocPath runtime files.

## 验收

Decision Brief confirms scope and compatibility rules. Quick closeout ignores DocPath-owned runtime/status files or gives a recovery path that does not require unsafe workspace rollback. Task identity drift diagnostics recommend canonical repair paths without locking normal recovery. Promoted specs include explicit UI design gate defaults or unambiguous non-UI classification for CLI/script tasks. Markdown/JSON machine-truth divergence is detected or surfaced with actionable `write-spec`/`write-plan` guidance. Stale check/debug state from a previous task does not override the route for a newly promoted task. Automated tests cover the changed gate and recovery behavior where practical.

## 2. 需求清单

### 功能需求
- [ ] FR-1: Quick closeout excludes DocPath-owned runtime/status files from guarded non-DocPath changed-file limits, or emits a precise recovery path that does not require manual workspace rollback.
  - 来源 backlog: R-199
- [ ] FR-2: Task identity drift diagnostics identify mismatched state/session/current/canonical task IDs and recommend safe repair paths instead of `agent step`.
  - 来源: Sentinel flow-runner incident
- [ ] FR-3: `backlog promote` generated specs include an explicit `### UI 设计门禁` block, with a clear non-UI exemption path for CLI/script/docs/package tasks.
  - 来源: Sentinel flow-runner incident
- [ ] FR-4: Markdown/JSON machine-truth divergence is detected or surfaced by routing/check commands with actionable `write-spec`/`write-plan` guidance.
  - 来源: Sentinel flow-runner incident
- [ ] FR-5: Stale `last-check` or debug state from an aborted/dropped previous task does not override `next --agent` routing for the newly active task.
  - 来源: R-199 promotion reproduction
- [ ] FR-6: CLI recovery hints only name supported commands, or the named recovery command is implemented.
  - 来源: `backlog promote` suggested unsupported `task park`

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 新增行为应有 focused automated tests where practical
- [ ] NFR-3: Agent-readable CLI output remains stable and actionable

## 3. 范围界定

### 包含
- Quick closeout file classification and diagnostics.
- Task identity drift diagnostics and recovery hints.
- UI design gate defaults in promoted spec templates.
- Machine-truth divergence diagnostics for spec/plan Markdown versus JSON.
- Route isolation from stale check/debug state when switching tasks.
- Unsupported-command hint correction for task parking/abort guidance.

### 不包含
- Automatically untracking files in external projects such as Sentinel.
- Silently syncing Markdown over JSON without an explicit DocPath command.
- Removing DocPath gate requirements or allowing `quick` to bypass check.
- Broad redesign of DocPath task storage.

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | quick runtime file handling | Raise quick limit / exclude DocPath-owned runtime files / skip quick check | Exclude DocPath-owned runtime files | Keeps quick scope limits meaningful while avoiding self-inflicted false positives |
| 3 | Markdown/JSON sync | Auto-sync Markdown / explicit diagnostics / ignore Markdown edits | Explicit diagnostics | Preserves JSON-first machine truth and avoids hidden destructive overwrites |
| 4 | UI gate default | Default non-UI for all promoted specs / require explicit block / remove gate | Require explicit block with non-UI option | Keeps UI work gated while making CLI tasks unambiguous |

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
- [ ] 本任务涉及产品 UI 实现

### Decision Brief
- 当前问题: Sentinel flow-runner 暴露 DocPath 在 quick、任务切换、UI gate、Markdown/JSON 同步、route hint 方面的机制摩擦，导致小微任务和 CLI/release 任务被流程卡住。
- 目标: 保持 DocPath 审计与门禁价值，同时降低自有运行时文件、旧任务状态和模板缺口造成的误阻塞。
- 背景: 用户已总结 Sentinel 事件并确认按 R-199 推进；本任务属于 workflow/Agent 行为变更，需要显式记录决策。
- 可选方案: 放宽 quick 限制；排除 DocPath 自有运行时文件；强制所有项目忽略 workspace；自动 Markdown 覆盖 JSON；只更新文档不改引擎。
- 推荐方案: 在引擎层修正自有运行时文件分类、诊断和模板默认值；保持 JSON-first，不做静默自动同步；通过测试覆盖关键门禁。
- 不做什么: 不在 DocPath 中修改 Sentinel 的 Git 跟踪状态；不把手动回滚 `.docpath/workspace` 作为正式恢复路径；不取消 UI gate 或 check gate。
- 成本: 需要触碰 closeout、routing、backlog promote/spec 模板、drift diagnostics 和测试代码。
- 风险: 过度排除文件可能掩盖真实 quick scope 扩大；Markdown/JSON divergence 检测可能产生误报；route hint 修改可能影响既有 agent 输出。
- 回滚方案: 回退对应 CLI behavior/test changes，恢复现有 quick counting、promote template 和 next routing 逻辑；保留任务归档作为审计证据。
- 用户确认: 用户在 2026-06-17 明确回复“按照R-199 推进”。

## 5. 验收标准

- [ ] AC-1: Quick closeout does not fail solely because tracked `.docpath/workspace/**` runtime files changed.
- [ ] AC-2: Task identity drift output names the conflicting task IDs and gives supported repair commands.
- [ ] AC-3: Promoted specs contain an explicit UI design gate block and CLI/non-UI tasks can start without missing-template UI blockage.
- [ ] AC-4: Markdown/JSON divergence produces an actionable diagnostic instead of stale “missing context” confusion.
- [ ] AC-5: Newly promoted tasks are not routed by stale `last-check`/debug state from an aborted previous task.
- [ ] AC-6: CLI hints do not recommend unsupported `task park`, unless `task park` is implemented.
- [ ] AC-7: Focused automated tests cover the changed behavior where practical, and `docpath check` passes.

---

*此文件由 `docpath backlog promote` 生成。*
