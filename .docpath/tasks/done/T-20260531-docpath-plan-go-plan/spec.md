# T-20260531-docpath-plan-go-plan - 修复 docpath plan 与 go 之间的 plan 写入断点

> backlog_id: R-031
> backlog_source: docpath backlog add

## 1. 背景与动机

当前 DocPath 的标准任务主路径是：`backlog promote` → `write-spec` / `plan` → `go --step ...` → `agent step/done`。理论上 `docpath plan` 应该把当前任务推进到“可执行计划就绪”，让 `docpath go` 能直接读取 plan 并进入第一个子任务。

但实际工作树里暴露出了一个明确断点：

- `docpath plan` 目前只输出结构化 prompt，并调用 `transitionWorkflow(..., 'plan.ready')` 更新状态；
- 它不会把任何计划内容写入 `.docpath/tasks/current/plan.md`，也不会补 canonical/current alias；
- `docpath go` 则硬依赖 `.docpath/tasks/current/plan.md` 存在，否则直接报错：`未找到 plan.md。请先运行 docpath:plan 生成计划。`

这导致 CLI 自己给出的推荐路径出现自相矛盾：状态和 `next --agent` 会推荐 `docpath go --step S1`，但执行时立刻失败，用户必须绕过 `docpath plan`，手工再跑一遍 `write-plan` 才能继续。

本任务聚焦修复这一主流程断点：让 `docpath plan` 与 `write-plan`/`go` 的文件契约一致，至少能保证 active task plan 文件存在并被后续命令消费。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath plan` 完成后，active task 的 `.docpath/tasks/current/plan.md` 必须存在，且能被 `docpath go` 直接读取。
- [ ] FR-2: 如果当前任务已有 canonical plan 内容，`docpath plan` 不能仅更新状态而丢失/忽略该内容，应同步 active alias。
- [ ] FR-3: `docpath plan` 与 `docpath write-plan` 的 active task 文件契约需要保持一致，避免 plan/go 路由再次断裂。
- [ ] FR-4: 需要新增自动化测试，覆盖“plan 之后可直接 go”的回归场景。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不改变 Agent prompt 输出结构，只修正 plan 落地与后续路由契约。
- [ ] NFR-3: 回归验证需串行执行，避免 `dist/` 清理导致的假失败。

## 3. 范围界定

### 包含
- 修复 docpath plan 与 go 之间的 plan 写入断点
- plan 命令与 active task plan 文件同步
- 针对 plan→go 链路的测试补强

### 不包含
- 重写整个 brainstorm/refine/plan 交互模式
- 改造 `go` 的计划解析语法
- 修改与本任务无关的协议模板

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | plan 断点修复方式 | 放宽 `go` 无 plan 时的行为 / 保证 `plan` 产出符合 `go` 契约 | 保证 `plan` 产出符合 `go` 契约 | 这才符合 CLI 推荐路径和单一真源设计 |
| 3 | 回归保护方式 | 只依赖手工验证 / 增加自动化测试 | 增加自动化测试 | 这是主路径断点，必须有可重复的护栏 |

## 5. 验收标准

- [ ] AC-1: `docpath plan` 执行后，`.docpath/tasks/current/plan.md` 存在，且 `docpath go --step S1` 不会再因缺失 plan 直接失败。
- [ ] AC-2: 若 canonical plan 已存在，`docpath plan` 会把它同步到 active alias，而不是只更新状态。
- [ ] AC-3: 新增测试覆盖 plan→go 主路径，并通过回归验证。
- [ ] AC-4: `pnpm build`、目标测试、`pnpm test`、`docpath check` 全部通过，任务闭环完成。

---

*此文件由 `docpath backlog promote` 生成。*
