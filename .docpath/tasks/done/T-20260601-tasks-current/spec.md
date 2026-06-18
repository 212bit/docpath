# T-20260601-tasks-current - 检测并同步 tasks/current 与任务目录漂移

> backlog_id: R-041
> backlog_source: dogfood: 使用 DocPath 开发 R-039 时发现

## 1. 背景与动机

## 背景

- 开发 R-039 时，任务目录副本与 `.docpath/tasks/current/*` 存在不同步风险。
- `docpath check` 实际读取 current 视图时，用户容易误改 canonical 任务目录而没有修复当前视图。

## 验收

- `docpath check` 能明确提示 current 视图与任务目录副本是否漂移。
- 用户能通过一个明确命令或自动修复路径同步两边内容。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath check` 必须检测 `.docpath/tasks/current/{spec,plan}.md` 与当前 `task_id` 对应 canonical 任务目录文件是否漂移。
- [ ] FR-2: 漂移失败信息必须同时显示 current 路径、canonical 路径和差异文件名，便于用户定位。
- [ ] FR-3: 用户必须能通过明确命令同步 current 与 canonical 两边内容，且命令失败时 fail-loud。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不破坏 Level 0/1 轻量任务，也不影响无活跃 task_id 的项目检查

## 3. 范围界定

### 包含
- 检测并同步 tasks/current 与任务目录漂移
- check 门禁中报告 current/canonical 漂移
- 提供同步修复路径

### 不包含
- 自动解决内容冲突之外的语义差异
- 修改任务归档策略

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 漂移检测范围 | 所有历史任务 / 当前活跃任务 | 当前活跃任务 | 降低噪声，聚焦 check 实际读取的 current 视图 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-041 与任务 T-20260601-tasks-current 建立双向关联
- [ ] AC-3: 当 current 与 canonical 的 spec 或 plan 不一致时，`docpath check` 失败并显示两边实际路径
- [ ] AC-4: 同步命令能把 canonical 内容同步到 current，或把 current 内容同步到 canonical
- [ ] AC-5: 相关回归测试、完整测试与 `docpath check` 通过

---

*此文件由 `docpath backlog promote` 生成。*
