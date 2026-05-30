# DocPath 下一环节任务规划

> Status: Draft  
> Date: 2026-05-30  
> Scope: 下一阶段工程任务拆解，用于指导 DocPath 从 CLI 原型走向 Agent 工作流内核。

## 1. 背景

DocPath 当前已经具备三类基础能力：

- 状态机与 `.docpath/workspace/state.json`，用于保存任务状态。
- `check/review/journal/agent/next/compact` 等 CLI 命令，用于支撑 Agent 工作流。
- `spec/architecture/style/journal/breadcrumb` 等文档资产，用于跨会话记忆。

上一阶段已经完成了状态模型初步收敛、测试入口标准化、CLI 入口拆分。下一阶段的重点不应继续堆叠新命令，而应围绕 Superpowers / Trellis / GSD 三个参照方向，把 DocPath 的核心闭环打实。

下一阶段目标：

> 让 DocPath 从“有很多命令的文档 CLI”，升级为“Agent 愿意遵守、可以恢复、能够验证的本地工作流内核”。

## 2. 总体任务分组

| 优先级 | 任务组 | 目标 | 对标能力 |
|---|---|---|---|
| P0 | 状态与门禁稳定化 | 统一状态语义，禁止随意跳转完成态 | Superpowers |
| P1 | Agent 推进闭环 | 让 `next/agent done/handoff` 形成稳定执行路径 | GSD |
| P2 | 项目记忆结构化 | 让 journal、decision、style、architecture 可持续演化 | Trellis |
| P3 | 多 Agent 适配 | 生成并维护不同 Agent 的协议文件 | Agent substrate |

## 3. P0：状态与门禁稳定化

### 3.1 拆分 phase 与 gate

当前 `state` 同时承载“任务阶段”和“门禁结果”，例如 `executing` 是阶段，`check_pass` 是门禁结果。这会让状态转移越来越难维护。

建议把状态模型拆成两层：

```ts
type WorkflowPhase =
  | 'idle'
  | 'drafting'
  | 'planning'
  | 'executing'
  | 'checking'
  | 'reviewing'
  | 'journaling'
  | 'completed';

type GateStatus =
  | 'none'
  | 'check_pass'
  | 'check_fail'
  | 'review_pass'
  | 'review_fail'
  | 'blocked';
```

落地任务：

- 在 `src/engine/state-machine.ts` 中定义 `WorkflowPhase`、`GateStatus` 和统一的 `WorkflowSnapshot`。
- 将 `CurrentState.state` 逐步迁移为 `phase + gate`。
- 保留旧 `state` 字段一段时间作为兼容读字段，但新写入路径只写 `phase/gate`。
- 增加旧状态到新模型的迁移函数，例如 `check_pass -> { phase: checking, gate: check_pass }`。

验收标准：

- `writeCurrentState()` 不再接受裸字符串状态。
- `check/review/journal/agent` 不直接写 `check_pass`、`review_pass` 等字符串。
- 老的 `state.json` 能自动迁移，不破坏已有项目。

### 3.2 建立唯一状态转移入口

当前多个命令可以直接调用 `updateCurrentState()` 写状态。下一阶段需要引入状态转移函数，集中处理合法性、证据和副作用。

建议新增：

```ts
transitionWorkflow(cwd, event, payload)
```

示例事件：

- `task.created`
- `plan.ready`
- `step.started`
- `step.completed`
- `check.passed`
- `check.failed`
- `review.passed`
- `review.failed`
- `journal.archived`

落地任务：

- 在 `src/engine/state-machine.ts` 或 `src/engine/transitions.ts` 中定义事件驱动状态转移。
- `checkCommand()` 只发出 `check.passed/check.failed` 事件。
- `reviewCommand()` 只发出 `review.passed/review.failed` 事件。
- `journalCommand()` 只发出 `journal.archived` 事件。

验收标准：

- 非法状态跳转会被拒绝，并输出明确错误。
- 每个状态转移都有单元测试覆盖。
- 状态转移时自动更新 `updated_at`、`current_step`、breadcrumb 或 last-check 证据引用。

### 3.3 强化门禁策略

Superpowers 的关键是“流程能阻断错误完成声明”。DocPath 需要建立明确的 policy 层。

落地任务：

- 新增 `src/engine/policy.ts`。
- 定义完成任务所需证据：`check_pass`、必要时 `review_pass`、journal 可选或强制。
- 对 `--skip-tests`、`--skip-review` 增加结构化理由字段。
- `agent done` 默认执行 `check -> review -> journal`，除非显式跳过并记录理由。

验收标准：

- 没有 `last-check.md` 或 check 失败时，不能进入 completed。
- review 被跳过时，必须在 breadcrumb 或 decision 中记录原因。
- `journal` 继续保持门禁：只允许从合法完成证据状态进入。

## 4. P1：Agent 推进闭环

### 4.1 强化 `docpath next --agent`

`next` 应成为 Agent 的默认入口，而不是简单提示命令。它需要基于当前状态、计划、breadcrumb 和验证证据给出唯一推荐动作。

落地任务：

- 读取 `state.json`、`plan.md`、`breadcrumb.md`、`last-check.md`。
- 判断当前是否有 active step、blocked step、未完成 checklist。
- 输出结构化 YAML，包括 `next_action`、`recommended_command`、`required_files`、`exit_criteria`。

验收标准：

- 新项目初始化后，`next --agent` 推荐创建或导入任务。
- 有未完成 plan 时，推荐执行下一个 step。
- check 失败时，推荐进入 debug 或修复流程。
- review 通过后，推荐 journal 或完成归档。

### 4.2 同步 breadcrumb 与 plan checklist

当前 breadcrumb 是执行记录，plan checklist 是计划状态，两者可能漂移。下一阶段要让它们互相校验。

落地任务：

- `agent step --status done` 自动更新对应 plan checklist。
- `check` 检查 breadcrumb 和 plan checklist 是否一致。
- `go` 或 `next` 能识别“plan 已勾选但缺少 breadcrumb 证据”的情况。

验收标准：

- step 完成后，breadcrumb 和 plan checklist 同步更新。
- 同步失败时有明确提示，不静默忽略。
- `check` 能识别至少两类漂移：plan done 无 breadcrumb、breadcrumb done 无 plan done。

### 4.3 强化 handoff 交接包

`compact` 当前更像上下文摘要，下一阶段需要成为真正的 Agent 交接协议。

落地任务：

- 扩展 `compact-context.md` 内容结构。
- 输出当前目标、当前阶段、已完成步骤、当前阻塞、验证证据、下一步命令、必须先读文件。
- `agent handoff` 调用 compact 后，附带 `next --agent` 结果。

验收标准：

- 新会话只读 `compact-context.md + current.md + next --agent` 即可恢复工作。
- handoff 文件中包含明确的下一步命令。
- handoff 能标识阻塞项和最近失败证据。

## 5. P2：项目记忆结构化

### 5.1 引入 decisions/ADR

Trellis 的价值在于长期知识沉淀。DocPath 需要把关键决策从 journal 中提取出来，形成稳定的决策记录。

落地任务：

- 新增 `.docpath/decisions/` 或规范化 `.docpath/workspace/decisions.md`。
- 定义 ADR 模板：背景、决策、影响、替代方案、相关任务。
- `review` 或 `journal` 能追加候选 decision。

验收标准：

- 每个 decision 有唯一 ID。
- decision 能关联 task_id 和相关文件。
- `context/reveal` 能按任务阶段包含相关 decision。

### 5.2 journal 到 learn 的闭环

当前 `journal` 和 `learn` 已有雏形，但需要明确“经验如何变成项目规则”。

落地任务：

- `journal` 生成候选 lessons。
- `learn` 将候选 lessons 合并到 `style.md` 或 `architecture.md`。
- 合并时保留来源任务和日期。

验收标准：

- 一条经验可以追溯到具体 task 和 breadcrumb。
- 重复 lesson 不会反复追加。
- style/architecture 的变更可以被 review 检查到。

### 5.3 docs index 结构化

落地任务：

- `docs scan` 输出结构化索引字段：路径、类型、标题、摘要、更新时间、适用范围。
- `context` 根据阶段选择相关文档，而不是简单拼接。
- `reveal` 支持按 level 和 topic 输出文档子集。

验收标准：

- `.docpath/docs.md` 或索引文件可被机器稳定解析。
- 新增文档后，`docs scan` 能更新索引。
- `context --max-tokens` 能优先保留当前任务相关文档。

## 6. P3：多 Agent 适配

DocPath 的最终定位不是单一 CLI，而是多 Agent 共享的本地协议层。

落地任务：

- 完善 `docpath install --target codex|claude|opencode|universal`。
- 生成 `AGENTS.md`、`CLAUDE.md`、`.claude/commands`、OpenCode 配置。
- 所有 Agent 适配文件都指向同一个 `.docpath` 真源。

验收标准：

- 不同 target 生成的协议文件不互相覆盖无关内容。
- 重新 install 时支持安全覆盖和 diff 提示。
- Agent 协议文件明确要求先读 `docpath next --agent` 或 `docpath status --agent`。

## 7. 推荐执行顺序

建议按以下顺序推进：

1. P0.1：拆分 `phase/gate`，建立兼容迁移。
2. P0.2：新增统一状态转移入口。
3. P0.3：强化完成门禁 policy。
4. P1.1：重写 `next --agent` 路由逻辑。
5. P1.2：同步 breadcrumb 与 plan checklist。
6. P1.3：强化 handoff 交接包。
7. P2.1：引入 decisions/ADR。
8. P2.2：打通 journal -> learn -> style/architecture。
9. P2.3：结构化 docs index。
10. P3：完善多 Agent install 适配。

## 8. 下一步最小任务切片

如果要马上开始编码，建议第一张任务卡只做：

> 建立 `WorkflowPhase + GateStatus` 新状态模型，并兼容读取旧版 `state`。

任务边界：

- 修改 `src/engine/state-machine.ts`。
- 修改 `src/utils/workspace.ts` 的读写 schema。
- 保持 `current.md` 渲染兼容。
- 增加状态迁移单元测试。
- 不改 `check/review/journal` 行为，只让底层模型具备新字段。

验收命令：

```bash
pnpm run typecheck
pnpm test
node dist/index.js init --cwd /tmp/docpath-next-phase-smoke --level 1
node dist/index.js status --cwd /tmp/docpath-next-phase-smoke
```

## 9. 风险与约束

- 不要一次性重写所有命令。状态模型先兼容，再逐步迁移命令写入路径。
- 不要让 `state`、`phase`、`gate` 三套字段长期并行无约束；兼容期要有明确迁移目标。
- 不要让 `next` 只是文本提示；它必须成为 Agent 可消费的路由输出。
- 不要让 journal 只做归档；它最终要回流到 decisions/style/architecture。

## 10. 完成定义

下一阶段完成时，DocPath 应满足：

- Agent 可以通过 `next --agent` 明确知道下一步。
- 任务不能在缺少 check/review 证据时被标记完成。
- 长任务可以通过 breadcrumb 和 handoff 恢复。
- 经验可以从 journal 回流成长期项目知识。
- CLI 入口保持轻量，命令逻辑和工作流规则有清晰边界。
