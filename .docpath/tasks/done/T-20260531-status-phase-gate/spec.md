# T-20260531-status-phase-gate - 让 status 人类输出对齐 phase/gate 真源

> backlog_id: R-039
> backlog_source: docpath backlog add

## 1. 背景与动机

当前 `docpath status` 的人类可读输出只展示派生后的 `state`，还把 `.docpath/workspace/current.md` 当作主要状态文件来提示。现在工作流的真实状态已经稳定在 `state.json -> phase/gate/state` 三元组上，因此 `status` 的人类输出如果不展示 `phase/gate`，会误导用户理解当前所处阶段和门禁状态。

## 2. 需求清单

### 功能需求
- FR-1: `docpath status` 的人类可读输出必须展示 `phase` 和 `gate`，而不仅是派生 `state`。
- FR-2: 未初始化或文件路径提示应围绕当前状态真源与渲染产物的关系，而不是暗示只有 `current.md` 是状态文件。
- FR-3: 自动化测试需要覆盖 status 的人类输出，防止 phase/gate 再次缺失。

### 非功能需求
- NFR-1: `status --agent` 的 YAML 输出保持不变。
- NFR-2: 不改变现有 pending-done 告警等行为，只补足状态展示信息。

## 3. 范围界定

### 包含
- status 命令的人类输出文案
- 未初始化时的提示文案
- 对应回归测试

### 不包含
- 修改状态机模型本身
- 改动 status --agent 的字段结构

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 人类状态展示 | 只显示 state / 同时显示 state+phase+gate | 同时显示 state+phase+gate | state 是派生态，phase/gate 才是现在的稳定语义 |
| 2 | 提示文件 | 继续只提 current.md / 区分 state.json 与 current.md | 区分二者 | 避免用户把渲染产物误认为唯一真源 |

## 5. 验收标准

- AC-1: status 输出包含 `状态`、`阶段`、`门禁` 三项。
- AC-2: status 输出不再把 `current.md` 单独表述为唯一状态文件。
- AC-3: 目标测试、全量测试和 `docpath check` 通过。
