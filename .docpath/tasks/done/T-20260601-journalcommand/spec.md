# T-20260601-journalcommand - 拆分 journalCommand 降低函数复杂度警告

> backlog_id: R-073
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- `src/commands/journal.ts` 的 `journalCommand` 同时承担归档门禁、任务摘要计算、Agent prompt 输出、任务目录归档、backlog 回填、lesson 候选、workspace meta、决策日志和架构决策提取等职责。
- `docpath review` 将该函数标记为过长，说明归档命令需要拆出更清晰的内部步骤，降低后续维护和回归风险。
- 本任务目标是在不改变 `docpath journal` 用户可见行为、归档语义和状态机事件的前提下，将 `journalCommand` 拆成更小的私有辅助函数。

## 验收

- `docpath review` 不再报告 `journalCommand` 过长警告。
- `journal --skip-ai` 的归档、backlog 回填、lesson 候选、decision 写入和状态推进行为保持兼容。
- journal 相关测试和全量测试通过。
- `docpath check` 与 `docpath review` 通过，review 警告数下降。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 拆分 journalCommand 降低函数复杂度警告
  - 来源 backlog: R-073

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 拆分 journalCommand 降低函数复杂度警告

### 不包含
- 不修改 journal 输出文案。
- 不改变 archiveMode 行为。
- 不调整 lesson/decision 提取规则。
- 不解决其它长函数警告。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-073 与任务 T-20260601-journalcommand 建立双向关联
- [ ] AC-3: `docpath review` 中 `journalCommand` 过长警告消失
- [ ] AC-4: journal 相关测试通过
- [ ] AC-5: `npm test`、`docpath check`、`docpath review` 均完成，且 review 警告数下降

---

*此文件由 `docpath backlog promote` 生成。*
