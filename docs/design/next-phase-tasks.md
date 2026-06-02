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

## 11. 竞品差距分析 — Superpowers / Trellis / GSD

> Date: 2026-05-30  
> Source: 对 DocPath 28 个命令源码 + state.json + 4 份设计文档的逐文件审计  
> 参照: obra/superpowers (14 skills), robmclarty/trellis-exec (8 skills + 9 agents), GSD CLI (6 commands)

### 11.1 差距总览

| # | 差距 | 对标 | 当前状态 | 落入章节 |
|---|------|------|----------|----------|
| G1 | 无程序化生命周期绑定 | Trellis | AI 必须主动调用 `agent done`，遗忘则状态不更新 | → §3.1 + §3.2 |
| G2 | 无统一状态转移入口 | GSD | 5+ 命令直接调用 `updateCurrentState()`，无合法性校验 | → §3.2 |
| G3 | 无门禁阻断 | Superpowers | `agent done --skip-tests` 无结构化理由，可跳过 check | → §3.3 |
| G4 | `next` 不够智能 | GSD | `go` 只读 plan，不综合 state/breadcrumb/last-check | → §4.1 |
| G5 | breadcrumb 与 plan 漂移 | Trellis | 两者独立更新，可各自漂移 | → §4.2 |
| G6 | handoff 无 next 推荐 | GSD | `context` 输出压缩包但不含下一步动作 | → §4.3 |
| G7 | decisions 提取不自动 | Trellis | `decisions.md` 存在但需手动维护 | → §5.1 |
| G8 | journal→learn 无管线 | Superpowers | 两个命令独立，经验不自动回流 | → §5.2 |

### 11.2 G1 — 程序化生命周期绑定（vs Trellis）

**Trellis 做法**: `phase-orchestrator` agent 启动时自动 `getState()`，结束时自动 `writePhaseReport()`。状态更新嵌入生命周期，AI 无法遗忘。

**DocPath 差距**: `agent enter` / `agent done` 需 AI 主动调用。如果 AI 忘记调用 `agent done`，状态永远停留在 `executing`。

**补充任务** (在 §3.1 基础上新增):

- [ ] `agent enter` 执行时写入 `.docpath/workspace/pending-done.md` 哨兵文件（包含 enter 时间、task_id）
- [ ] `docpath status` 检测到 `pending-done.md` 存在且 state 仍为 `executing` 时，输出警告并建议 `agent done`
- [ ] `docpath next --agent` 同样检测哨兵文件，将"完成当前任务"作为高优先级推荐
- [ ] 超过 24 小时未 done 的哨兵文件触发 `breadcrumb` 自动追加 `[WARN] Task active >24h without done`

**验收标准**:

- AI 忘记 `agent done` 时，下次 `status` 或 `next` 会提醒
- 哨兵文件在 `agent done` 时自动清理
- 不产生误报（已 done 的任务不会被提醒）

### 11.3 G2 — 统一状态转移（vs GSD）

**GSD 做法**: `update_state()` 是唯一状态写入入口，所有变更经过校验，AI 不直接写文件。

**DocPath 差距**: 至少 5 个命令直接调用 `updateCurrentState()`：`go`、`check`、`agent`、`tdd`、`write-spec`。任何一个都可写入非法状态。

**补充任务** (在 §3.2 基础上新增):

- [ ] 建立 `src/engine/transitions.ts`，定义合法转移矩阵：

```ts
const TRANSITIONS: Record<WorkflowPhase, WorkflowPhase[]> = {
  idle:       ['drafting', 'planning'],
  drafting:   ['planning'],
  planning:   ['executing'],
  executing:  ['checking', 'executing'],  // executing→executing = next step
  checking:   ['reviewing', 'executing', 'journaling'],
  reviewing:  ['journaling', 'executing', 'completed'],
  journaling: ['completed'],
  completed:  ['idle'],
};
```

- [ ] 所有命令改为调用 `transitionWorkflow(event, payload)` 而非直接 `updateCurrentState()`
- [ ] 非法转移被拒绝时输出：当前 phase、允许的目标、建议的下一步命令

**验收标准**:

- `transitionWorkflow()` 是唯一的状态写入入口（grep 确认无直接 `updateCurrentState` 调用）
- 非法跳转（如 `idle → completed`）被拒绝并输出明确错误
- 每个合法转移有单元测试覆盖

### 11.4 G3 — 门禁策略（vs Superpowers）

**Superpowers 做法**: `verification-before-completion` 是强制 skill——PR 提交前必须执行验证清单。94% 的 PR 因此被要求修改。

**DocPath 差距**: `agent done --skip-tests` 可直接跳过，无结构化理由记录，无阻断机制。

**补充任务** (在 §3.3 基础上新增):

- [ ] `src/engine/policy.ts` 实现 `canComplete(cwd)` 函数：

```ts
interface CompletionPolicy {
  checkRequired: boolean;        // 必须有 last-check.md 且通过
  reviewRequired: boolean;       // 根据 config.yaml 决定
  skipReasonRequired: boolean;   // 跳过时必须提供理由
}
```

- [ ] `agent done` 默认流程：check → review → journal，任一步失败则阻断
- [ ] `--skip-tests` 必须附带 `--reason "..."`，理由写入 `decisions.md` 格式：`[SKIP-CHECK] task_id | reason | timestamp`
- [ ] check 失败时自动推荐 `docpath tdd` 或 `docpath continue --step debug`

**验收标准**:

- 无 `last-check.md` 时 `agent done` 被阻断
- check 失败时 `agent done` 被阻断
- 跳过时理由被记录到 decisions.md
- 阻断消息包含具体修复建议命令

### 11.5 G4 — 智能 next 路由（vs GSD）

**GSD 做法**: `update_state()` 后 AI 自然知道下一步，因为状态是唯一真相源。

**DocPath 差距**: `go` 只读 plan 输出下一个 step，但不考虑当前 state 是否 blocked、last-check 是否通过、breadcrumb 是否有未解决失败。

**补充任务** (在 §4.1 基础上新增):

- [ ] `next --agent` 综合以下数据源：

| 数据源 | 影响 |
|--------|------|
| `state.json.phase` | 决定当前阶段 |
| `state.json.gate` | 决定是否被阻断 |
| `plan.md` | 找到下一个未完成 step |
| `breadcrumb.md` | 检查最近失败/阻塞 |
| `last-check.md` | 验证证据是否通过 |
| `pending-done.md` | 检查是否有未完成任务 |

- [ ] 输出结构化 YAML（非纯文本）：

```yaml
next_action: "execute step 3"
recommended_command: "docpath go --step 3"
required_files: ["src/commands/check.ts"]
exit_criteria: "cargo check passes"
blocked_by: null  # or "last-check failed"
confidence: high
```

**验收标准**:

- 新项目初始化后 → 推荐 `docpath brainstorm` 或 `docpath refine`
- 有未完成 plan 且无阻断 → 推荐 `docpath go --step N`
- check 失败 → 推荐 `docpath tdd` 或 debug 流程
- review 通过后 → 推荐 `docpath journal`
- 有 `pending-done.md` → 推荐先 `agent done`

### 11.6 G5 — breadcrumb-plan 同步（vs Trellis）

**Trellis 做法**: phase-orchestrator 自动同步任务完成状态到 SharedState。

**DocPath 差距**: `go --status done` 更新 breadcrumb，但 plan.md 的 checkbox 不一定同步。

**补充任务** (在 §4.2 基础上新增):

- [ ] `go --status done` 时自动将 plan.md 对应行更新为 `- [x]`
- [ ] `go --status skip` 时自动将 plan.md 对应行更新为 `- [~]`（跳过标记）
- [ ] `check` 命令增加漂移检测报告：

```
DRIFT DETECTED:
  [plan-done-no-breadcrumb] Step 3 marked done in plan.md but no breadcrumb evidence
  [breadcrumb-done-no-plan] Breadcrumb shows step 5 done but plan.md still unchecked
```

- [ ] `status --agent` 包含漂移摘要

**验收标准**:

- `go --status done` 后 plan.md 和 breadcrumb 同步更新
- `check` 能检测并报告两类漂移
- 漂移报告包含具体的 step 编号和修复建议

### 11.7 G6 — handoff 增强（vs GSD）

**GSD 做法**: state.json 天然包含下一步信息，断线后直接读取即可恢复。

**DocPath 差距**: `context` 生成压缩包但不含 next 推荐，新会话需要额外调用 `next`。

**补充任务** (在 §4.3 基础上新增):

- [ ] `agent handoff` 输出增强版 `compact-context.md`，末尾自动追加 `next --agent` 的 YAML 输出
- [ ] `compact-context.md` 结构：

```markdown
# Context Handoff — {task_id}
## Current State: {phase} / {gate}
## Goal: {task_title}
## Progress: {completed_steps}/{total_steps}
## Recent Failures: {last-failure-summary}
## Next Action: {next --agent YAML}
## Required Reading: {file-list}
```

**验收标准**:

- 新会话只读 `compact-context.md` 即可完整恢复
- handoff 文件包含可执行的下一步命令
- 阻塞项和最近失败被明确标识

### 11.8 G7-G8 — 记忆管线（vs Trellis + Superpowers）

**Trellis**: `decisionsLog` 在 SharedState 中持续累积。  
**Superpowers**: 把踩过的坑变成自动检查规则。

**DocPath 差距**: `decisions.md` 需手动维护；`journal` 和 `learn` 之间无自动管线。

**补充任务** (在 §5.1-5.2 基础上新增):

- [ ] `journal` 完成后自动扫描变更中的架构决策，追加到 `decisions.md`（格式：ADR-NNN | title | date | task_id | decision | rationale）
- [ ] `learn` 命令增加 `--from-journal` 模式：自动读取最近 N 条 journal entries，提取 lessons → 合并到 style.md
- [ ] `learn --dry-run` 显示将要合并的 lessons，不实际写入
- [ ] 去重逻辑：相同 lesson 不重复追加（基于模糊匹配或 hash）

**验收标准**:

- `journal` 后 decisions.md 自动更新（如有架构决策）
- `learn --from-journal` 能提取结构化 lessons
- 重复 lesson 被去重
- style.md 变更可被 `review` 检查到

### 11.9 新增任务汇总

| ID | 差距 | 任务 | 优先级 | 预估 |
|----|------|------|--------|------|
| G1.1 | 生命周期 | pending-done.md 哨兵文件 | P0 | 0.5d |
| G1.2 | 生命周期 | status/next 检测哨兵并警告 | P0 | 0.5d |
| G1.3 | 生命周期 | 24h 超时自动 breadcrumb 警告 | P1 | 0.5d |
| G2.1 | 状态转移 | transitions.ts 合法转移矩阵 | P0 | 1d |
| G2.2 | 状态转移 | 迁移所有命令到 transitionWorkflow() | P0 | 1d |
| G2.3 | 状态转移 | 非法转移错误消息优化 | P0 | 0.5d |
| G3.1 | 门禁策略 | policy.ts canComplete() | P0 | 1d |
| G3.2 | 门禁策略 | --skip-tests 强制 --reason | P0 | 0.5d |
| G4.1 | 智能 next | 多数据源综合路由 | P1 | 1.5d |
| G4.2 | 智能 next | YAML 结构化输出 | P1 | 0.5d |
| G5.1 | 同步 | go done 自动更新 plan.md checkbox | P1 | 0.5d |
| G5.2 | 同步 | check 漂移检测报告 | P1 | 0.5d |
| G6.1 | handoff | compact-context.md 增强 | P1 | 1d |
| G7.1 | 记忆 | journal 自动提取 decisions | P2 | 0.5d |
| G8.1 | 记忆 | learn --from-journal 管线 | P2 | 1d |

### 11.10 更新后的执行顺序

原 §7 推荐顺序不变，插入 G 项后完整序列：

1. **P0.1** — 拆分 phase/gate（§3.1）+ 旧数据迁移
2. **P0.2** — transitionWorkflow()（§3.2 + **G2.1-G2.3**）
3. **P0.3** — policy.ts 门禁（§3.3 + **G3.1-G3.2**）
4. **P0-extra** — pending-done.md 哨兵（**G1.1-G1.2**）
5. **P1.1** — next --agent 多源路由（§4.1 + **G4.1-G4.2**）
6. **P1.2** — breadcrumb-plan 同步（§4.2 + **G5.1-G5.2**）
7. **P1.3** — handoff 增强（§4.3 + **G6.1**）
8. **P2.1** — decisions/ADR 自动化（§5.1 + **G7.1**）
9. **P2.2** — journal→learn 管线（§5.2 + **G8.1**）
10. **P2.3** — docs index 结构化（§5.3）
11. **P3** — 多 Agent install 适配（§6）

> **总预估**: P0 约 5 天，P1 约 5.5 天，P2 约 2 天，合计 ~12.5 天。

## 12. Dogfooding 实测发现 — 工具自身缺陷

> Date: 2026-05-30
> Source: 用 DocPath 自身命令跑了一遍 `brainstorm → write-spec → plan → next` 全流程（dogfooding），逐命令观测 + 源码核对。
> 结论: §3–§11 约 80% 已落地，但**几条接缝是断的，且都在静默失败**。下列 D 项优先级**高于** §11 的 G1/G8。

### 12.1 缺陷总览

| ID | 缺陷 | 严重度 | 证据 | 现象 |
|----|------|--------|------|------|
| D1 | brainstorm 静默吞掉输入文件 | P0 | `brainstorm.ts:107` 仅认 `--input`；`register.ts` 未注册位置参数 | `docpath brainstorm <file>` 的路径被丢弃，`userMsg` 回退「未提供需求描述」，无报错 |
| D2 | phase 永远卡在 idle（G2 迁移只做一半） | P0 | 6 命令直接调 `updateCurrentState`：go/continue/refine/brainstorm/write-spec/plan；仅 check/review/journal/runtime 走 `transitionWorkflow` | 起草链全程不推进 `phase`，`next --agent` 读 phase → 永远 idle |
| D3 | 路由器回推 + 协议命令盲从 → 死循环 | P0 | 写完 spec 后 `next --agent` 仍推荐 `docpath brainstorm`；`CLAUDE.md` 首要指令要求「根据 recommended_command 行动」 | 严格遵守协议会 brainstorm→spec→「下一步 brainstorm」→… 死循环 |
| D4 | `docpath write-plan` 未实现 | P1 | `plan.ts:89,117` 指向它；`register.ts` 无注册，命令表无此项 | plan 完成后指引运行一个不存在的命令，happy path 断头 |
| D5 | `lifecycle.ts` 孤儿代码 | P1 | `emit()` 全仓零调用；`agent.ts` 从不触发 | 「程序化生命周期绑定」（G1）当前为空壳，连脚手架都是死的 |
| D6 | 「下一步」有两个互相打架的真源 | P1 | write-spec 打印「docpath plan」，同时 `next --agent` 说 brainstorm | Agent 不知该信谁 |
| D7 | task_id 占位符 + 路径分裂 | P2 | `state.json.task_id="T-task"`；`current.md` 链 `tasks/T-task/spec.md`，实际在 `tasks/current/spec.md` | 文档交叉引用指向不存在的路径 |
| D8 | 步骤 id 重编号 S↔T | P2 | plan.md 用 `S1..S7`，`next --agent` 改叫 `T1` | `go --step T1` 与 `agent step --step "S1"` 指同一项却用不同 id |
| D9 | progress.total=0 但 plan 有 7 项 | P2 | `next --agent` 输出 `progress.total:0`，同时 `next_action` 找到了 S1 | 计数器与「找下一步」用两套解析逻辑 |
| D10 | write-spec/write-plan 不校验内容 | P2 | `write-spec.ts` 吞任意字符串 | 「文档即契约」却不验证契约成形（缺 FR/验收条件不报错） |

### 12.2 根因

D1–D6 收敛到同一病根：**三个「真源」（文档 / `state.json` / 命令打印的 hint）在漂移，且漂移时不出声**。`next` 读 `state.json`，但 `state.json` 与文档对不上。"Document as FSM" 的命门在于 FSM 必须是**强制的、单一真源的**；当前它是**建议性的、多真源的**。

### 12.3 P0 修复（优先于 G1/G8）

**D-P0.1 — 失败必须响 (fail-loud)** ✅ 已完成 (2026-05-30)
- [x] 未知 flag / 未知命令 / 缺失必填 `<arg>` → 清晰报错 + exit 1（`index.ts` 改为 `cli.parse({run:false})`，捕获 cac 异常并显式校验未知命令）
- [x] brainstorm/refine 新增 `[file]` 位置参数 + `--file`，经 `utils/input.ts:readRequirementFile` 读取；文件缺失/为空即抛错，绝不回退空需求
- [ ] 未知**位置参数**全覆盖（如 `docpath status foo`）暂缓：docs/debug 等命令用未声明的位置参数读子命令，需先统一为 `<action>` 声明，否则通用拦截会误伤 → 留作 D-P0 后续
- [ ] 「所有起草命令走 transitionWorkflow 后非法转移 throw」依赖 **D-P0.2**，随其落地
- 验收：✅ `docpath brainstorm req.md` 真正读入文件；✅ 错误参数 exit 1；✅ 无声成功消除；✅ 回归 `docs scan`/`agent enter`/`--help` 正常

**D-P0.2 — 完成 G2 状态统一** ✅ 已完成 (2026-05-30)
- [x] go/continue/refine/brainstorm/write-spec/plan 六处 `updateCurrentState` 调用全部改走 `transitionWorkflow`（continue 的 level 升级改走新增的 `updateLevel()`）
- [x] 删除 `updateCurrentState()` 与 `collectCurrentStateFields()`，唯一写入口为 `writeCurrentState()`（经 transitionWorkflow / updateLevel）；旧 `state` 字段仍可读
- [x] 放宽 task.created/plan.ready/step.started 的 `from`（含 idle），门禁事件保持严格；起草链 phase 正确推进 idle→drafting→planning
- [x] 修复 `RuntimeWorkflowState` 缺失 `task_created`/`verifying`（清掉 2 个 typecheck 错误）
- 验收：✅ `grep updateCurrentState src/commands` 为空；✅ brainstorm→write-spec→plan 后 phase=drafting→planning，`next` 推荐 `context`（不再回推 brainstorm）；✅ 测试 67/69（2 个 install 预存失败）
- ⚠ 更正：原 §12.1 称「5 个 typecheck 错误皆为状态模型问题」有误——仅 2 个是（已修）。另 3 个（review 的 `useAi`×2、compact 的 breadcrumb `entries`×1）属 review/breadcrumb 域，与状态统一无关，留作独立小修。
- 遗留：`collectCurrentStateFields` 的 4 个私有 helper（parseFrontMatterLine/firstHeading/normalizeTaskTitle/shouldResetStartedAt）现无引用，待清理（`noUnusedLocals` 未开，不阻断构建）。

**D-P0.3 — 路由单一真源** ✅ 已完成 (2026-05-30)
- [x] brainstorm/refine/write-spec/plan 删除自印「下一步」hint，改为 `await nextCommand({cwd})`（统一转调路由）；go 的「执行子任务」指令保留（与路由一致）
- [x] 路由补规则（`agent-output.ts` inferNextAction）：drafting+有 spec → `docpath plan`；drafting+无 spec → `docpath write-spec`；planning_done → `docpath go`。彻底消除「写完 spec 反推 brainstorm」死循环
- [x] 统一步骤 id：`parsePlanTasks` 正则容忍 `**S1**` 粗体，router 用 `S1`（不再重编号 `T1`），`go --step S1` 与 `agent step --step S1` 一致
- 验收：✅ brainstorm→write-spec→plan→go 每步打印的「建议命令」均来自 router（write-spec→plan、plan→go），无回退；✅ step id 为 S1；✅ typecheck 仅剩 3 个无关预存错误；测试 67/69（2 install 预存失败）
- 注：check.ts 的 pass/fail 提示与路由一致，未改；journal.ts 的 `write-journal` broken ref 属 D4 域，留作后续。

### 12.4 P1/P2 清理

- [ ] D4：实现 `docpath write-plan`（对称 write-spec，写 `tasks/current/plan.md` + 走 transition）
- [ ] D5：`agent enter/done` 接入 `lifecycle.emit()`（与 §11.2 G1.1 哨兵任务合并）
- [ ] D7：分配真实 task_id，统一 `tasks/current` 与 `tasks/<task_id>` 路径策略
- [ ] D9：progress 计数与 step-finder 共用一套 plan 解析
- [ ] D10：write-spec/write-plan 校验必备字段（title/FR/验收），缺失报错

### 12.5 修订执行顺序

D-P0.1/2/3 应**插到 §11.10 序列最前**——它们修的是「Agent 能否信任路由」这一立身之本，而 §11 后续所有 Agent 闭环增强都建立在这个前提上。

1. **D-P0.1** 失败必须响 + brainstorm 读文件
2. **D-P0.2** 完成 G2 状态统一（消除 phase 漂移）
3. **D-P0.3** 路由单一真源（堵死循环）
4. **D4/D5** write-plan 实现 + lifecycle 接活
5. …（接原 §11.10 的 G1.1 哨兵、G4 智能 next …）

## Backlog 迁移说明

随着 `R-010 backlog 层` 落地，建议将原先堆放在本文件中的候选条目，逐步手工迁移到 `.docpath/backlog/`。

### 建议迁移范围

- `§11` 中仍未进入执行链、但已经可以独立命名和验收的候选工作
- `§12` 中作为后续修补/增强项的离散任务

### 手工迁移步骤

1. 用 `docpath backlog add --title "条目标题" --priority P1 --level 2` 创建 `R-###`
2. 将本文件对应段落中的背景、约束、验收条件整理进该条目的正文
3. 当条目已经确认可进入执行池时，运行 `docpath backlog accept R-###`
4. 当 `next --agent` 推荐该条目时，再执行 `docpath backlog promote R-###`
5. 在本文件原段落处只保留动机、上下文和 `R-###` 链接，不再继续维护活动状态

### 当前约定

- `backlog add` 默认创建 `proposed`
- `accepted` 表示已进入可执行候选池
- `next --agent` 在 idle 时优先推荐：
  - 有 `accepted` 条目：`docpath backlog promote R-###`
  - 无 `accepted` 但有 `proposed`：`docpath backlog accept R-###`
  - 两者都无：`docpath backlog add`
