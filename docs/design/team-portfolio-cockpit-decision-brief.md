# Team Portfolio Cockpit Decision Brief

> Task: T-20260608-team-portfolio-cockpit-decision-brief
> Backlog: R-134
> Status: Decision Brief / IA design only
> Constraint: 本文不授权直接实现 UI、执行 API 或状态推进按钮。

## 1. 背景

Dashboard 当前已经具备本地只读展示、React Agent 核心视图、SQLite registry 项目注册、Team 视角和 Backlog/Changes 等深层视图。但当前产品形态仍偏“单项目 Agent 工作台 + legacy 深层页面”，无法完整承载用户确认的方向：

- Team Portfolio Cockpit
- 深度重构
- 从只读 Dashboard 升级为受控可写控制台
- 页面内提供执行/推进状态按钮

该方向涉及 UI 信息架构、用户主路径、权限/写操作边界、工作流/Agent 行为和长期维护成本，必须先完成设计和 Decision Brief，再拆分实现任务。

## 2. 目标

后续 Dashboard 应从“展示当前任务数据”升级为：

> 多项目团队驾驶舱 + 当前项目操作台 + 受控 DocPath 生命周期动作入口。

用户打开 Dashboard 后，应能快速回答：

- 团队/项目组合现在有多少项目在执行、等待、风险、可交接？
- 哪些项目现在最需要处理？
- 每个项目下一步应该做什么？
- 当前选中项目处于哪个 task、phase、gate？
- 当前项目是否可以运行 check/review 或推进 step？
- 每一次页面触发的写动作是否可追踪、可审计、可回滚？

## 3. 非目标

第一轮实现不得做以下事情：

- 不开放任意 shell 命令执行。
- 不做批量跨项目执行。
- 不直接写 `.docpath` 状态文件。
- 不开放 `agent done`、`task abort/reset`、`backlog drop` 等高风险动作。
- 不改变 `docpath dashboard --json` 和 `/api/state` 现有契约。
- 不删除 legacy 深层视图。
- 不引入新的 UI 框架。

## 4. 信息架构

### 4.1 第一屏

第一屏应以 Team Portfolio 为主，而不是单任务详情。

推荐布局：

1. 顶部全局状态栏
   - 产品名: DocPath Cockpit
   - registry 状态
   - 项目总数
   - 活跃项目数
   - 风险项目数
   - 可交接项目数
   - 最近刷新时间
   - 只读/可写模式标识

2. 左侧项目导航
   - 项目搜索
   - phase/gate 分组
   - 当前项目高亮
   - 风险/阻塞/可交接 badge
   - 最近访问项目

3. 中央 Team Cockpit
   - Portfolio summary
   - Workflow lanes: idle / drafting / executing / checking / reviewing / completed
   - Risk queue
   - Next queue
   - Handoff queue
   - Backlog queue

4. 右侧当前项目操作台
   - 当前 task
   - phase/gate
   - current step
   - recommended command
   - check/review 状态
   - blockers
   - 受控 action buttons

5. 下方详情区
   - Agent Workbench
   - Backlog
   - Changes
   - Documents
   - Timeline
   - Settings

### 4.2 主路径

用户主路径应从“看当前任务”调整为“选择项目 -> 判断优先级 -> 处理当前项目 -> 审计结果”。

主路径：

1. 进入 Team Portfolio Cockpit。
2. 从 Risk/Next/Handoff queue 中选择一个项目。
3. 查看右侧当前项目操作台。
4. 根据 action allowlist 运行安全动作。
5. 查看执行结果和审计日志。
6. 返回队列继续处理下一个项目。

### 4.3 与现有视图关系

Agent Workbench 不再是第一屏唯一主角，而是当前项目详情区的一部分。

Team / Backlog / Changes / Documents 不应一次性删除或重写。后续迁移应采用分阶段策略：

- 第一阶段: Team Cockpit 第一屏 React 化。
- 第二阶段: 当前项目操作台 React 化。
- 第三阶段: Backlog/Changes/Documents 逐步 React 化。
- 第四阶段: 删除或收敛 legacy HTML。

## 5. 可写控制台安全模型

### 5.1 CLI 真源原则

Dashboard 不直接修改 `.docpath` 文件。所有状态修改必须通过 DocPath CLI 生命周期命令完成。

允许后端调用固定命令，但禁止前端传入任意命令字符串。

### 5.2 Action Allowlist

第一版允许动作：

| Action ID | CLI 映射 | 类型 | 确认要求 |
|---|---|---|---|
| `run-check` | `docpath check --fix-drift current` | 写证据/检查 | 可单击或轻确认 |
| `run-review` | `docpath review` | 写 review evidence | 可单击或轻确认 |
| `go-step` | `docpath go --step <step>` | 推进当前步骤为 in_progress | 必须确认 |
| `agent-step-done` | `docpath agent step --step <step> --status done` | 标记步骤完成 | 必须确认 |

第一版禁止动作：

| Action | 原因 |
|---|---|
| `agent-done` | 会归档任务，风险高 |
| `task-abort` / `task-reset` | destructive 或大范围状态变更 |
| `backlog-drop` | destructive |
| `backlog-promote` | 会切换 active task |
| 任意 shell command | 命令注入风险 |
| 批量跨项目动作 | 跨项目污染风险 |

### 5.3 参数约束

前端只能传结构化参数：

```ts
type DashboardActionRequest =
  | { action: 'run-check'; projectRoot: string }
  | { action: 'run-review'; projectRoot: string }
  | { action: 'go-step'; projectRoot: string; step: string }
  | { action: 'agent-step-done'; projectRoot: string; step: string };
```

后端必须校验：

- `projectRoot` 必须来自 registry 或当前 workspace。
- `step` 必须来自当前 project 的 active plan。
- action 必须来自 allowlist。
- 当前 phase/gate 必须允许该 action。

### 5.4 确认弹窗

确认弹窗必须展示：

- 项目名和 root
- 当前 task id/title
- 当前 phase/gate
- 将执行的 action
- 映射 CLI 命令
- 预期结果
- 风险提示

`agent-step-done` 必须要求用户确认 step id。高风险动作在第一版不开放。

### 5.5 审计日志

每个 action 必须写入审计日志，建议第一版写入：

`.docpath/workspace/dashboard-actions.jsonl`

记录字段：

```ts
type DashboardActionAudit = {
  id: string;
  action: string;
  project_root: string;
  task_id: string | null;
  task_title: string | null;
  before_phase: string | null;
  before_gate: string | null;
  after_phase: string | null;
  after_gate: string | null;
  command: string;
  status: 'success' | 'failed';
  stdout_preview: string;
  stderr_preview: string;
  created_at: string;
};
```

### 5.6 跨项目限制

第一版只允许操作“当前选中项目”，不做批量操作。

跨项目操作必须满足：

- 项目 root 来自 registry。
- 每次 action 只作用于一个项目。
- 操作后刷新该项目状态。
- UI 清楚显示当前操作的项目，不允许模糊地对多个项目执行。

## 6. 分阶段实施计划

### Phase 1: Team Cockpit 只读信息架构

目标：

- 第一屏改为 Team Portfolio Cockpit。
- 左侧项目导航。
- 中央 phase lanes / risk queue / next queue / handoff queue。
- 右侧当前项目摘要。
- 保持只读，不加 action API。

验收：

- `dashboard --json` 与 `/api/state` 兼容。
- 不新增写操作。
- UI 明确体现 Team Portfolio Cockpit 产品形态。

### Phase 2: Action API 与审计日志

目标：

- 新增后端 action endpoint。
- 实现 allowlist。
- 实现参数校验。
- 实现 audit jsonl。
- 不接 UI 按钮或只提供测试入口。

验收：

- 任意 command 字符串不能执行。
- 未注册项目不能执行。
- 非 allowlist action 失败。
- 审计日志完整。

### Phase 3: 可写按钮 UI

目标：

- 在当前项目操作台接入 `check`、`review`、`go step`、`agent step done`。
- 实现确认弹窗。
- 执行后刷新状态。
- 显示审计结果。

验收：

- 低风险 action 可执行。
- 推进类 action 必须确认。
- 错误状态可见。
- 页面不绕过 CLI。

### Phase 4: 扩展能力评估

可评估但不默认开放：

- `agent done`
- backlog accept/promote
- backlog drop
- 跨项目批量 check
- 团队级交接批处理

这些必须单独 Decision Brief。

## 7. 风险与防护

| 风险 | 防护 |
|---|---|
| 误点按钮推进状态 | 确认弹窗、step id 展示、审计日志 |
| 命令注入 | action allowlist，禁止前端传 command |
| 跨项目污染 | registry 校验、单项目执行、当前项目标识 |
| 状态机绕过 | 只调用 DocPath CLI，不直接写文件 |
| 旧契约破坏 | 保持 `/api/state` 和 `dashboard --json` 兼容 |
| 实现范围失控 | 拆为 Phase 1/2/3/4 单独任务 |

## 8. 决策

推荐进入后续 Phase 1 实现任务：

> Team Cockpit 只读信息架构重构。

Phase 1 完成并验证后，再进入 Phase 2 Action API 任务。不要在同一个任务里同时做 UI 深度重构和可写按钮。
