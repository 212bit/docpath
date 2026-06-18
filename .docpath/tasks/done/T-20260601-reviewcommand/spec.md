# T-20260601-reviewcommand - 拆分 reviewCommand 降低函数复杂度警告

> backlog_id: R-072
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- `src/commands/review.ts` 的 `reviewCommand` 同时负责收集变更文件、静态分析、输出报告、处理 dry-run/approve、写入 breadcrumb/review.md/决策日志和推进状态机。
- `docpath review` 将该函数标记为过长，说明审查命令的编排和子职责需要拆开，降低后续维护风险。
- 本任务目标是在不改变 review 规则、输出文本和状态推进语义的前提下，将 `reviewCommand` 拆成更小的私有辅助函数。

## 验收

- `docpath review` 不再报告 `reviewCommand` 过长警告。
- `review --dry-run` 不写状态、不写证据文件的行为保持兼容。
- 普通 review 与 `--approve` 的 breadcrumb、review.md、decision、状态机推进语义保持兼容。
- 相关 review 测试、全量测试、`docpath check` 和 `docpath review` 均通过。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 拆分 reviewCommand 降低函数复杂度警告
  - 来源 backlog: R-072

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 拆分 reviewCommand 降低函数复杂度警告

### 不包含
- 不修改静态分析规则。
- 不修改 review 输出文案。
- 不解决 `src/commands/review.ts` 内既有 TODO 提示。
- 不调整其它长函数警告。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-072 与任务 T-20260601-reviewcommand 建立双向关联
- [ ] AC-3: `docpath review` 中 `reviewCommand` 过长警告消失
- [ ] AC-4: review 相关测试通过
- [ ] AC-5: `npm test`、`docpath check`、`docpath review` 均完成，且 review 警告数下降

---

*此文件由 `docpath backlog promote` 生成。*
