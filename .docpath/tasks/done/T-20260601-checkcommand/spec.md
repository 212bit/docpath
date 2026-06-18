# T-20260601-checkcommand - 拆分 checkCommand 降低函数复杂度警告

> backlog_id: R-075
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- `docpath review` 仍报告 `src/commands/check.ts` 中 `checkCommand` 函数过长。
- 该函数同时负责 CLI 选项归一化、常规编译/构建/测试/lint 检查、任务文档门禁、harness 调度、报告输出、工作流状态更新、证据写入与回归历史记录。
- 本任务做行为保持型拆分，让 `checkCommand` 保持顶层编排职责，为后续继续清理 `registerCommands` 留出独立边界。

## 验收

- `docpath review` 不再报告 `checkCommand` 过长。
- `docpath check` 的现有输出语义、状态流转、last-check 证据、breadcrumb 与 check-history 写入保持不变。
- 聚焦测试、全量测试、`docpath check` 与 `docpath review` 通过。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 拆分 `checkCommand` 中的常规检查、任务文档检查、报告输出、状态/证据写入逻辑
  - 来源 backlog: R-075
- [ ] FR-2: 保持 `check --skip-tests --skip-lint`、`--harness`、`--only-harness` 与 `--fix-drift` 行为不变

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 变更范围限定在 `src/commands/check.ts` 及必要测试验证，不处理 `registerCommands` 警告

## 3. 范围界定

### 包含
- 拆分 `checkCommand` 内部职责
- 保留现有质量门禁和报告格式
- 运行相关测试和 DocPath 检查

### 不包含
- 不拆分 `registerCommands`
- 不处理 `review.ts` TODO 提示
- 不改变 check 命令的用户可见行为

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-075 与任务 T-20260601-checkcommand 建立双向关联
- [ ] AC-3: `docpath review` 不再包含 `checkCommand` 过长警告
- [ ] AC-4: `npm test` 与 `docpath check` 通过

---

*此文件由 `docpath backlog promote` 生成。*
