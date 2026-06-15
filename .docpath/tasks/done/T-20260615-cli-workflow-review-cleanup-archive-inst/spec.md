# T-20260615-cli-workflow-review-cleanup-archive-inst - 修复 CLI 文档系统 workflow review 发现的 cleanup、archive、install、status 边界问题

> backlog_id: R-181
> backlog_source: docpath backlog capture

## 1. 背景与动机

## 背景

- 本次 CLI + 文档系统 + workflow review 发现四类边界问题：
  - cleanup 读取的 `check-history`、session、lease schema 与真实写入格式不一致，且 `compact` 默认触发老化清理，容易产生非预期运行态删除。
  - docs archive 老化策略把旧归档从索引中移除，导致显式 `--task-id` 查询找不到历史任务。
  - universal install 没有把 OpenCode 的 `OPENCODE.md` 作为顶层协议资产安装，summary 也把 OpenCode 错写成 `AGENTS.md`。
  - `status --agent` 与 `next --agent` 之前语义过近，容易让 agent 把诊断快照当作执行路由。
  - task identity 没有被 CLI 硬校验，导致 `state.task_id`、current spec、canonical spec、breadcrumb 可以同时指向不同任务语义。
- 这些问题共同影响 DocPath 的 CLI 真源、文档索引可发现性、多 agent 安装体验和 agent 启动协议，需要作为一个 cleanup 修复包收口。

## 验收

- `check-history.json` 保留策略与 `docpath check` 写入格式一致，并兼容旧 `{ entries }` 结构。
- `compact` 默认只生成压缩上下文；只有显式 `--cleanup` 时才裁剪 `check-history`、`breadcrumb.jsonl`、sessions 和 leases。
- session cleanup 使用真实 `updated_at` / `created_at` 字段，并兼容旧 `lastTouched`。
- lease cleanup 使用真实 `expires_at` 字段，并兼容旧 `expiresAt`；无显式过期时间时使用统一 lease TTL。
- 旧归档任务继续留在 `docs-index` 中，并标记 `stale: true`；显式 `context --task-id <id>` 可以展开旧任务。
- universal install 安装 `OPENCODE.md`，`.opencode/docpath.json` 指向 `OPENCODE.md`，install manifest 记录该资产。
- `status --agent` 明确是 diagnostic snapshot，`recommended_command` 指向 `docpath next --agent`；真实执行路线只放在 `route_hint`。
- `next --agent` 保持 active route 语义。
- `write-spec` 阻止把声明了其他 task id 的 spec 写入当前 `state.task_id` 的 canonical 目录。
- `write-plan`、`tasks sync` 等写入路径在已有 task identity drift 时 fail loud，不继续扩散错误证据。
- `check` 先执行 task identity drift 检查，再执行 current/canonical drift、重大变更门禁和 plan/breadcrumb drift。
- `check` 在 drafting 等非执行阶段失败时不再触发非法 `check.failed` workflow transition。
- `next --agent` / `status --agent` 暴露 identity drift 明细，并把路线切到 `docpath tasks drift`。
- `docpath tasks drift` 能报告身份漂移，而不是只比较 current/canonical 内容差异。
- slash command / command template 对新增或变更的 CLI 参数有说明。
- 覆盖 runtime cleanup、docs index、install、status/next agent 输出、task identity drift 和 artifact sink 写入保护的回归测试通过。

## CLI / Agent 边界

- CLI 负责机械一致性：task id 身份校验、current/canonical 同步安全、状态机迁移合法性、breadcrumb/plan 对齐、索引可发现性和安装资产完整性。
- Agent 负责语义判断：确认这是新任务还是旧任务误覆盖、决定恢复哪个证据版本、向用户解释风险并选择 capture/promote/reset/restore 路径。
- CLI 不应自动猜测并切换任务身份；一旦同一 `task_id` 下出现不同 spec H1，应 fail loud。
- Agent 不应通过 `agent step` 修复身份漂移；同名 S1/S2 不代表同一计划语义。

## 2. 需求清单

### 功能需求
- [ ] FR-1: runtime cleanup 读取真实 schema
  - `check-history.json` 保留策略兼容数组结构和旧 `{ entries }` 结构。
  - session cleanup 使用真实 `updated_at` / `created_at`，兼容旧 `lastTouched`。
  - lease cleanup 使用真实 `expires_at`，兼容旧 `expiresAt`，无显式过期时间时使用统一 TTL。
- [ ] FR-2: `compact` 默认不做破坏性 cleanup
  - `docpath compact` 只生成压缩上下文。
  - 只有显式 `docpath compact --cleanup` 才裁剪 check-history、breadcrumb、sessions、leases。
- [ ] FR-3: docs archive 保持可发现
  - 旧归档任务继续保留在 `docs-index` 中并标记 `stale: true`。
  - 显式 `context --task-id <id>` 仍可展开旧归档任务。
- [ ] FR-4: universal install 覆盖 OpenCode 协议资产
  - universal install 安装 `OPENCODE.md`。
  - `.opencode/docpath.json` 指向 `OPENCODE.md`。
  - install manifest 和 summary 正确记录 OpenCode 资产。
- [ ] FR-5: 明确 `status --agent` 与 `next --agent` 边界
  - `status --agent` 是 diagnostic snapshot。
  - `next --agent` 是 active route。
  - `status --agent` 的执行路线只通过 `route_hint` 暴露。
- [ ] FR-6: task identity drift 必须 fail loud
  - `write-spec` 阻止声明其他 task id 的 spec 写入当前 canonical 目录。
  - `write-plan`、`tasks sync` 等写入路径在已有 task identity drift 时停止扩散错误证据。
  - `check`、`next/status --agent`、`tasks drift` 优先报告身份漂移。
- [ ] FR-7: 协议文档说明 CLI / Agent 职责边界
  - CLI 负责机械一致性检查和状态门禁。
  - Agent 负责语义恢复决策，不能用 `agent step` 修复身份漂移。

### 非功能需求
- [ ] NFR-1: 保持现有 CLI 输出向后兼容，新增字段尽量 append-only。
- [ ] NFR-2: 变更必须有针对 runtime cleanup、docs index、install、status/next、task identity drift 和 artifact sink 的回归测试。
- [ ] NFR-3: 失败必须给出可执行修复建议，不能静默覆盖任务身份或自动猜测 task id。

## 3. 范围界定

### 包含
- runtime cleanup schema 与 `compact --cleanup` 行为。
- docs stale archive index 行为。
- universal install / OpenCode 协议资产。
- `status --agent` / `next --agent` 输出语义。
- task identity drift 检测、写入保护和 route/report 输出。
- AGENTS、CODEX、CLAUDE、OPENCODE、Codex skill、protocol templates 的 CLI/Agent 边界说明。
- 对应测试与 DocPath dogfood 验证。

### 不包含
- 实现完整 JSON 单真源迁移。
- 删除 Markdown 人类视图。
- 自动猜测或自动切换 drifted task id。
- 删除 `status --agent`。
- 重构所有 CLI 输出为 JSON/YAML-only。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | cleanup 触发时机 | compact 默认 cleanup / 显式 cleanup | 显式 `--cleanup` | 避免上下文压缩意外删除运行态证据 |
| 2 | docs archive 索引 | 老化后移除 / 保留 stale 标记 | 保留并标记 stale | 显式历史查询必须可恢复 |
| 3 | agent route 语义 | status/next 都像 route / status 诊断、next 路由 | status 诊断，next 路由 | 降低 agent 双命令启动和路线误用 |
| 4 | task identity drift 恢复 | CLI 自动猜测 / CLI fail loud，Agent 决策 | CLI fail loud，Agent 决策 | task id 语义需要用户/agent 判断，不能由 CLI 自动覆盖 |
| 5 | drifted draft 处置 | 覆盖丢弃 / 直接改旧 task id / capture 后恢复旧任务 | capture 后恢复旧任务并 reset | 保留新想法，同时修复旧任务证据和 current alias |

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
- [x] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: review 发现 cleanup、docs archive、install、status/next 和 task identity drift 多处边界薄弱；其中身份漂移已经让 `state.task_id`、current spec、canonical spec、breadcrumb 混入不同任务语义。
- 目标: 修复这些机械一致性问题，并明确 CLI 负责 fail-loud 与门禁、Agent 负责语义恢复判断。
- 背景: 用户要求修复 review 发现的问题，随后要求继续完成恢复路径选择，避免把 drifted draft 当成旧任务继续推进。
- 可选方案: 只修代码不修协议；CLI 自动猜测并迁移 task id；或 CLI 检测阻断、Agent/用户选择恢复路径。
- 推荐方案: CLI 增加 deterministic guard；协议和 backlog 记录 CLI/Agent 边界；将 drifted `T-DRAFT-data-uniform` 保存为 backlog R-182；从归档恢复旧任务证据并 reset stale current。
- 不做什么: 不自动切换 task id；不通过 `agent step` 平账；不删除 `status --agent`；不把 JSON 单真源迁移混入本任务。
- 成本: 需要修改 workflow core、install/docs/runtime 命令、agent output、协议模板和测试，并维护更严格的任务身份门禁。
- 风险: stricter guard 可能暴露历史脏状态并阻断旧流程；通过 `tasks drift`、route_hint 和修复建议降低恢复成本。
- 回滚方案: 回退 task identity guard、status/next route 调整、cleanup/install/docs 变更和协议模板更新；保留 R-182 backlog 作为未来任务草案。
- 用户确认: 用户已要求“修复它，并且想想哪些是 cli 进行处理，哪些应该让 agent 处理”，并继续要求选择恢复路径完成当前 workflow 修复。

## 5. 验收标准

- [ ] AC-1: `pnpm test` 全量通过。
- [ ] AC-2: `pnpm run typecheck` 通过。
- [ ] AC-3: `git diff --check` 通过。
- [ ] AC-4: `docpath tasks drift` 在恢复旧任务前能 fail-loud 报告 task identity drift；恢复后不再报告身份漂移。
- [ ] AC-5: `docpath next --agent` / `status --agent` 不再输出 identity drift，并能按当前任务阶段路由。
- [ ] AC-6: `T-DRAFT-data-uniform` draft 已保存为 backlog 候选，不因恢复旧任务而丢失。
- [ ] AC-7: `docpath check --skip-tests --skip-lint` 在当前任务 spec/plan 完整后通过。

---

*此文件由 `docpath backlog promote` 生成。*
