# T-20260601-gocommand - 拆分 goCommand 降低函数复杂度警告

> backlog_id: R-071
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- `src/commands/go.ts` 的 `goCommand` 当前承担输入校验、任务文件读取、目标步骤选择、上下文渲染、状态推进和完成态同步等多项职责。
- `docpath review` 将该函数标记为过长，说明命令编排层需要进一步拆分，降低后续维护成本。
- 本任务目标是在不改变 `docpath go` 命令行为和输出语义的前提下，将 `goCommand` 拆成更小的私有辅助函数。

## 验收

- `docpath review` 不再报告 `goCommand` 过长警告。
- `docpath go` 的 dry-run、开始执行、显式 `--step`、完成/跳过/阻塞状态同步行为保持兼容。
- 相关 go 测试和全量测试通过。
- `docpath check` 与 `docpath review` 通过。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 拆分 goCommand 降低函数复杂度警告
  - 来源 backlog: R-071

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 拆分 goCommand 降低函数复杂度警告

### 不包含
- 不修改 plan.md 解析规则。
- 不改变 breadcrumb 格式或状态机事件语义。
- 不调整其它长函数警告。
- 不新增用户可见功能。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-071 与任务 T-20260601-gocommand 建立双向关联
- [ ] AC-3: `docpath review` 中 `goCommand` 过长警告消失
- [ ] AC-4: go 相关测试通过
- [ ] AC-5: `npm test`、`docpath check`、`docpath review` 均完成，且 review 警告数下降

---

*此文件由 `docpath backlog promote` 生成。*
