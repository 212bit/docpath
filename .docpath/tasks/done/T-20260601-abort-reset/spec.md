# T-20260601-abort-reset - 新增任务 abort/reset 状态流转

> backlog_id: R-045
> backlog_source: docpath backlog add

## 1. 背景与动机

- 在实际 Pair Programming 或 Agent 执行中，任务可能因需求错误、方向走偏或需要暂停而不应继续推进。
- 当前只能通过手工修改 `.docpath/workspace/state.json` 或删除 `tasks/current` 来回到空闲态，这违反“状态变化必须由命令驱动”的工作流原则。
- 需要提供高层、安全、可追溯的任务终止与重置命令，让当前任务可以被明确废弃或清空，而不会破坏 backlog、canonical 任务目录和 current 视图的一致性。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 提供 `docpath task abort`，用于废弃当前活跃任务，将任务文件归档到 `tasks/done/<task_id>`，清理 `tasks/current`，并把工作流状态归位到 `idle`。
- [ ] FR-2: 提供 `docpath task reset`，用于清空当前任务上下文和 `tasks/current`，将工作流状态归位到 `idle`，但不把 backlog 条目标记为完成。
- [ ] FR-3: 若当前任务来自 backlog promote，`abort` 应将关联 backlog 条目安全回填为 `dropped`，便于后续追踪该需求被废弃。
- [ ] FR-4: 当没有活跃任务或当前已是 `idle/completed` 时，命令应 fail-loud 给出明确提示，避免误清理。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 所有状态变更必须通过状态写入口重建 `current.md`，避免手动编辑真源。
- [ ] NFR-3: 命令对重复目录、缺失 current alias、缺失 canonical 目录等边界情况保持幂等或明确失败。

## 3. 范围界定

### 包含
- 新增 `docpath task abort` 与 `docpath task reset` 命令。
- 新增任务归档、current 视图清理、状态归位和 backlog dropped 回填逻辑。
- 增加回归测试覆盖主要状态流转。

### 不包含
- 不实现任意历史任务的恢复或撤销。
- 不改变 `journal` 完成归档时将 backlog 回填为 `done` 的现有语义。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 命令入口 | `docpath task abort/reset` / `docpath backlog abort` | 采用 `docpath task` | 操作对象是当前任务状态机，backlog 只是联动回填 |
| 3 | abort 文件处理 | 删除 / 归档到 done | 归档到 done | 保留审计痕迹，并与 journal 的长期任务目录策略一致 |

## 5. 验收标准

- [ ] AC-1: `docpath task abort` 可将执行中的任务归档到 `tasks/done/<task_id>`，清理 `tasks/current`，并把状态设置为 `idle/none`。
- [ ] AC-2: `docpath task reset` 可清空当前任务上下文和 current 视图，并把状态设置为 `idle/none`。
- [ ] AC-3: 来自 backlog 的 active 任务执行 abort 后，关联 backlog 条目变为 `dropped`。
- [ ] AC-4: 无活跃任务时执行 abort/reset 会明确失败，不静默成功。
- [ ] AC-5: 新增测试覆盖上述行为，`docpath check` 可通过。

---

*此文件由 `docpath backlog promote` 生成。*
