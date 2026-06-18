# T-20260601-lifecycle-console-log - 移除 lifecycle 生产 console.log 警告

> backlog_id: R-070
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- `src/hooks/lifecycle.ts` 的内置生命周期钩子通过多处 `console.log` 输出会话恢复、自动压缩、检查点和任务结束提示。
- 这些输出属于正常 CLI 反馈，但 hook 层直接使用 `console.log` 会被 `docpath review` 标记为生产代码警告。
- 本任务目标是在保持生命周期提示行为不变的前提下，移除该文件内的直接 `console.log` 调用。

## 验收

- `src/hooks/lifecycle.ts` 不再直接调用 `console.log`。
- 生命周期事件仍能输出原有提示文本，`console.warn` 错误提示行为不在本任务范围内。
- 全量 `npm test` 通过。
- `docpath check` 和 `docpath review` 通过，且 review 警告数量下降。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 移除 lifecycle 生产 console.log 警告
  - 来源 backlog: R-070

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 移除 lifecycle 生产 console.log 警告

### 不包含
- 不重写生命周期事件注册模型。
- 不接入实际上下文压缩实现。
- 不修改其它模块的正常 CLI 输出。
- 不修改 `console.warn` 错误提示。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-070 与任务 T-20260601-lifecycle-console-log 建立双向关联
- [ ] AC-3: `src/hooks/lifecycle.ts` 中不再出现 `console.log`
- [ ] AC-4: 生命周期提示默认仍写入 stdout
- [ ] AC-5: `npm test`、`docpath check`、`docpath review` 均完成，且 review 警告数下降

---

*此文件由 `docpath backlog promote` 生成。*
