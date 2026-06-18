# T-20260601-docpath-gc - 实现 docpath gc 清理历史任务目录

> backlog_id: R-044
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- 运行一段时间后，`.docpath/tasks/` 会堆积大量历史 `T-XXXX` 目录。
- 临时测试任务、调研任务和未归档任务如果不进入 journal，就会长期滞留。
- 直接手动 `rm -rf` 风险高，需要一个可预览、可控的清理入口。

## 验收

- `docpath gc` 或 `docpath tasks prune` 能识别历史任务目录并安全清理。
- 默认提供 dry-run 预览，实际清理需要显式确认或 `--force`。
- 清理过程不会误删 `tasks/current` 或当前活跃任务目录。

## 2. 需求清单

### 功能需求
- [ ] FR-1: CLI 必须提供一个清理历史任务目录的入口，默认只预览不删除。
- [ ] FR-2: 清理逻辑必须跳过 `tasks/current` 和当前活跃任务目录。
- [ ] FR-3: 必须能按历史、未登记、已完成等范围控制清理对象，并支持 `--force`。
- [ ] FR-4: 执行清理时必须输出将被处理的目录和最终结果。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 预览模式不得修改任何文件

## 3. 范围界定

### 包含
- 实现 docpath gc 清理历史任务目录
- 提供 dry-run / force / 预览输出
- 任务目录清理的回归测试

### 不包含
- 自动判断并回写 backlog 状态
- 改造 journal 归档流程

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 默认执行方式 | 直接删除 / dry-run 默认 | dry-run 默认 | 降低误删风险，便于人工确认 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-044 与任务 T-20260601-docpath-gc 建立双向关联
- [ ] AC-3: 默认运行不删除文件，只输出预览
- [ ] AC-4: `--force` 或确认后可真正清理目标目录
- [ ] AC-5: 清理不会误删 current 或 active task 目录

---

*此文件由 `docpath backlog promote` 生成。*
