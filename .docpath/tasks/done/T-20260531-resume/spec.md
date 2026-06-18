# T-20260531-resume - 让 resume 命令对齐当前状态真源与路由

> backlog_id: R-038
> backlog_source: docpath backlog add

## 1. 背景与动机

`docpath resume` 目前直接从 `current.md` 用正则提取旧字段，并输出固定的 `docpath:go` / `docpath:review` 等历史命令名，没有复用当前 `state.json` 真源和 `next --agent` 的统一路由。因此在 drafting 或 completed 等状态下，它会给出和真实工作流不一致的恢复建议。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath resume` 必须基于当前状态真源输出恢复信息，而不是从 `current.md` 手工正则解析旧字段。
- [ ] FR-2: resume 给出的下一步建议应与 `docpath next --agent` 推荐一致，不再输出过时的 `docpath:...` 命令名。
- [ ] FR-3: 自动化测试需要覆盖至少一个 drafting 场景和一个 completed 场景的恢复输出。

### 非功能需求
- [ ] NFR-1: 保留 resume 的 checkpoint/verbose 恢复价值，但不改写工作流状态。
- [ ] NFR-2: 尽量复用现有状态读取与路由逻辑，避免再维护第三套路由映射。

## 3. 范围界定

### 包含
- resume 命令的状态读取和下一步建议逻辑
- resume 输出中的命令名和状态展示
- resume 的回归测试

### 不包含
- 修改 next 路由规则本身
- 重写 breadcrumb 存储格式

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 状态来源 | 解析 current.md / 读取 state.json 真源 | 读取 state.json 真源 | current.md 是渲染产物，不应再做解析真源 |
| 2 | 恢复建议 | resume 自己维护映射 / 复用 next 路由 | 复用 next 路由 | 避免 continue/resume/next 三处继续漂移 |

## 5. 验收标准

- [ ] AC-1: resume 在 drafting/completed 等状态下输出与 `next --agent` 一致的建议命令。
- [ ] AC-2: resume 不再输出 `docpath:go`、`docpath:review` 这类过时命令名。
- [ ] AC-3: 目标测试、全量测试和 `docpath check` 通过。
