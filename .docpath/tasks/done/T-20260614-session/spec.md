# T-20260614-session - 新增多 session 隔离与并发

> backlog_id: R-171
> backlog_source: docpath backlog capture
> evidence: .docpath/backlog/evidence/R-171-brainstorm.md

## 1. 背景与动机

DocPath 当前运行态以项目全局单例为主：`workspace/state.json`、`current.md`、`breadcrumb.*`、`last-check.md`、`review.md`、`compact-context.md` 和 `tasks/current` 都默认服务一个当前任务和一个当前执行焦点。多个 agent/session 同时运行时，即使 `transitionWorkflow()` 已对 state RMW 使用 `state.lock`，仍可能出现以下问题：

- 进度归属不清：breadcrumb 事件不能区分由哪个 session 写入。
- 同一步骤被多个会话同时推进：后续 `agent step` 可能重复或覆盖计划状态。
- 复合写入竞争：breadcrumb 的去重、append、截断，以及 plan checklist 同步不是完整 session-aware 的并发协议。
- 过早多任务并发会扩大迁移面：check/review/handoff 仍是全局证据，不适合第一版支持多个 active task。

本任务实现 MVP：在保持单 active task 的前提下，引入 session identity、task/step lease 与关键写入加锁，使多个 session 可以安全运行并在冲突时 fail loud。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 引入 session identity
  - 命令可通过 `--session <id>` 或 `DOCPATH_SESSION` 指定 session。
  - 未指定时使用稳定的兼容 session，不强制用户改变单 session 工作流。
  - session 元数据以 JSON 真源记录在 `.docpath/workspace/sessions/`。
- [ ] FR-2: 引入 task/step lease
  - `docpath go` 进入执行时为当前 task/step 领取 lease。
  - 另一个 session 尝试推进同一 task 的同一步骤时必须 fail loud，并输出 holder、resource、恢复建议。
  - 同一个 task 的不同步骤在 MVP 默认禁止并发，仍由 task-level lease 保护。
  - stale lease 可根据 TTL 和 PID 存活状态被当前命令接管。
- [ ] FR-3: breadcrumb 事件记录 session 归属
  - `breadcrumb.jsonl` 记录 session id，Markdown 视图也渲染 session 信息。
  - 旧 breadcrumb 记录仍可读取，缺失 session 字段不报错。
- [ ] FR-4: 加固关键复合写入
  - breadcrumb 写入、去重、截断在同一锁内完成。
  - plan checklist 同步在 task-scoped lock 内完成。
- [ ] FR-5: 保持现有 CLI 兼容
  - 没有传 session 的现有命令仍能运行。
  - 不实现 `status --team`、多 active task、自动 agent 编排或默认 worktree 并发。

### 非功能需求
- [ ] NFR-1: 保持 CLI-first / JSON-first 协议，Markdown 仍是可重建视图。
- [ ] NFR-2: 新增 session/lease 元数据必须是 additive schema，避免破坏旧数据读取。
- [ ] NFR-3: 并发冲突必须 fail loud，不能静默覆盖。
- [ ] NFR-4: 实现应覆盖自动化测试，至少包含 session 归属、lease 冲突、stale lease、breadcrumb 兼容读取、plan sync 锁边界。

## 3. 范围界定

### 包含
- session id 解析、session 元数据写入。
- task/step lease 的获取、冲突检测、stale 接管和释放/完成语义。
- `go`、`agent enter`、`agent step`、`agent handoff` 的 session 传递。
- breadcrumb schema 兼容扩展。
- breadcrumb 和 plan sync 关键写入加锁。
- 自动化测试与相关协议说明更新。

### 不包含
- 多个 active task 同时推进。
- `status --team`，该能力放到 Phase 2。
- 同任务不同步骤并发执行；MVP 默认禁止。
- 自动多 agent 调度器。
- 默认 Git worktree 并行执行。
- RBAC、权限模型、SQLite/数据库迁移。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | MVP 并发范围 | 直接多 active task / 单 active task + session safety | 单 active task + session safety | 最小化迁移风险，先解决真实覆盖与归属问题 |
| 2 | 同任务不同步骤 | 默认允许 / 默认禁止 | 默认禁止 | 当前 plan/check/review/handoff 仍假设一个当前焦点 |
| 3 | 团队视图 | MVP / Phase 2 | Phase 2 | 先把 JSON 真源和冲突语义做稳 |
| 4 | 存储模型 | JSON 文件 / SQLite | JSON 文件 | 符合现有 DocPath 架构和 CLI-first 约束 |

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
- [x] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: 多个 agent/session 可同时写入全局运行态，进度归属、当前步骤和生成视图可能互相污染。
- 目标: 在保持现有单 active task 工作流兼容的前提下，增加 session 归属、lease 冲突检测和关键写入加锁。
- 背景: 头脑风暴证据见 `.docpath/backlog/evidence/R-171-brainstorm.md`。
- 可选方案: A 锁加固；B session + lease；C task-native multi-active runtime；D worktree 隔离；E SQLite 事务存储。
- 推荐方案: 采用 B，并包含 A 的关键写入锁加固；C/D/E 延后。
- 不做什么: 不做多 active task、不做 `status --team`、不做自动编排、不做默认 worktree 并发、不做 RBAC/SQLite。
- 成本: 中等，涉及 runtime/agent/go/breadcrumb/plan-sync/agent-output/tests。
- 风险: stale lease 误阻塞、旧 breadcrumb 兼容、session 默认值造成困惑、过度承诺并发范围。
- 回滚方案: session 字段保持 additive；若 lease 影响现有流程，可临时关闭强制冲突检测，保留 attribution 与写入锁。
- 用户确认: 2026-06-14 用户确认：1) MVP 保持单 active task，只做 session 隔离与同一步骤冲突检测；2) 同任务不同步骤默认禁止并发，等 `go --claim` 和依赖规则明确后再打开；3) `status --team` 放到 Phase 2。

## 5. 验收标准

- [ ] AC-1: 两个不同 session 同时尝试推进同一 task/step 时，第二个 session fail loud，并显示持有 session 与恢复建议。
- [ ] AC-2: 单 session 不传任何新参数时，现有 `go` / `agent step` / `agent handoff` 流程仍兼容。
- [ ] AC-3: breadcrumb JSONL 和 Markdown 记录 session 信息，旧记录无 session 字段仍可读取。
- [ ] AC-4: breadcrumb 写入和 plan checklist 同步有锁保护，并有并发/回归测试覆盖。
- [ ] AC-5: stale lease 可被接管，活跃 lease 不会被误抢。
- [ ] AC-6: `docpath check`、`docpath review`、`docpath agent done` 通过，任务归档完成。
