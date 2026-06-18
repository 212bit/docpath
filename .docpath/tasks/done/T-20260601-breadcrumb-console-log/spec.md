# T-20260601-breadcrumb-console-log - 移除 breadcrumb 生产 console.log 警告

> backlog_id: R-069
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- `src/engine/breadcrumb.ts` 的 `writeBreadcrumb` 在发生面包屑轮转时直接调用 `console.log` 输出提示。
- 该输出是正常 CLI 反馈，但引擎层直接使用 `console.log` 会被 `docpath review` 标记为生产代码警告。
- 本任务目标是在保持轮转提示行为和面包屑写入语义不变的前提下，移除该文件内的直接 `console.log` 调用。

## 验收

- `src/engine/breadcrumb.ts` 不再直接调用 `console.log`。
- 面包屑超过 `MAX_ENTRIES` 时仍会保留最近记录并可输出原有轮转提示。
- `tests/breadcrumb.test.mjs` 与全量 `npm test` 通过。
- `docpath check` 和 `docpath review` 通过，且 review 警告数量下降。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 移除 breadcrumb 生产 console.log 警告
  - 来源 backlog: R-069

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 移除 breadcrumb 生产 console.log 警告

### 不包含
- 不调整面包屑文件格式。
- 不改变 `MAX_ENTRIES`、截断策略或解析兼容逻辑。
- 不修改其它模块的 `console.log` 输出。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-069 与任务 T-20260601-breadcrumb-console-log 建立双向关联
- [ ] AC-3: `src/engine/breadcrumb.ts` 中不再出现 `console.log`
- [ ] AC-4: `writeBreadcrumb` 仍会在必要时执行截断轮转
- [ ] AC-5: `npm test`、`docpath check`、`docpath review` 均完成，且 review 警告数下降

---

*此文件由 `docpath backlog promote` 生成。*
