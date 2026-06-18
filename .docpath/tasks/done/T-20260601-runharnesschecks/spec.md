# T-20260601-runharnesschecks - 拆分 runHarnessChecks 降低函数复杂度警告

> backlog_id: R-074
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- `docpath review` 仍报告 `src/commands/check.ts` 中 `runHarnessChecks` 函数过长。
- 该函数同时承担 harness 文件读取、规则过滤、规则分类、规则执行与结果封装，职责边界偏宽。
- 本任务只做行为保持型拆分，降低函数长度与局部复杂度，为后续继续拆分 `checkCommand` 留出清晰边界。

## 验收

- `docpath review` 不再报告 `runHarnessChecks` 过长。
- harness 相关行为保持不变，包括缺失 harness 文件、规则过滤、MUST 阻断与 WARN/INFO 非阻断语义。
- 聚焦测试与全量测试通过，`docpath check` 通过。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 拆分 `runHarnessChecks` 中的规则过滤、分类、执行与结果封装逻辑
  - 来源 backlog: R-074
- [ ] FR-2: 保持现有 harness 检查输出语义和规则判定不变

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 变更范围限定在 `src/commands/check.ts` 及必要测试验证，不处理其他 review 警告

## 3. 范围界定

### 包含
- 拆分 `runHarnessChecks` 的内部职责
- 保留现有 check/harness CLI 行为
- 运行相关测试和 DocPath 检查

### 不包含
- 不拆分 `checkCommand`
- 不调整 `registerCommands`
- 不处理 `review.ts` 中的 TODO 提示

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-074 与任务 T-20260601-runharnesschecks 建立双向关联
- [ ] AC-3: `docpath review` 不再包含 `runHarnessChecks` 过长警告
- [ ] AC-4: `npm test` 与 `docpath check` 通过

---

*此文件由 `docpath backlog promote` 生成。*
