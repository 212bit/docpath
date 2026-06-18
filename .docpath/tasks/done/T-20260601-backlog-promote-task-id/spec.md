# T-20260601-backlog-promote-task-id - backlog promote 生成唯一 task_id

> backlog_id: R-049
> backlog_source: docpath backlog add

## 1. 背景与动机

- `backlog promote` 当前 task_id 由日期和标题 slug 组成。
- 同一天重复使用相近标题时，会生成相同 task_id，可能覆盖 active canonical 目录，或在 journal 归档时撞上 `tasks/done/<task_id>`。
- 本轮连续任务中已经手工修复过两次 task_id 冲突，需要在 promote 入口生成唯一 task_id，从源头消除风险。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath backlog promote` 生成 task_id 时必须避开 `tasks/<task_id>` 和 `tasks/done/<task_id>`。
- [ ] FR-2: 若基础 task_id 已存在，应追加稳定递增后缀，例如 `-2`、`-3`。
- [ ] FR-3: backlog links、spec 标题、state.json 中的 task_id 应全部使用最终唯一 ID。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不改变已有无冲突场景下的 task_id 格式。

## 3. 范围界定

### 包含
- 调整 backlog promote task_id 分配逻辑。
- 增加回归测试覆盖 active/done 目录冲突。

### 不包含
- 不迁移历史已生成 task_id。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 冲突后缀 | 随机 ID / 递增编号 | 递增编号 | 可预测、便于测试和人工阅读 |

## 5. 验收标准

- [ ] AC-1: 当 `tasks/done/<base-task-id>` 已存在时，promote 生成 `<base-task-id>-2`。
- [ ] AC-2: 当 `tasks/<base-task-id>` 已存在时，promote 生成不冲突 ID。
- [ ] AC-3: 新增测试通过，`docpath check` 通过。

---

*此文件由 `docpath backlog promote` 生成。*
