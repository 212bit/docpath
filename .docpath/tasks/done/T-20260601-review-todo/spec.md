# T-20260601-review-todo - 清理 review TODO 自触发提示

> backlog_id: R-077
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- `docpath review` 已无 warning，但仍报告 `src/commands/review.ts` 中的 info 级提示。
- 该提示来自 TODO 扫描规则的源码注释自身包含 `TODO` 字面量，属于检查器自触发，而非真实待办事项。
- 本任务清理该自触发提示，同时保留扫描真实 TODO 注释的能力。

## 验收

- `docpath review` 输出 0 错误、0 警告、0 提示。
- review 仍能识别真实 `// TODO` 注释。
- 相关测试与全量测试通过，`docpath check` 通过。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 移除 review 扫描规则中的自触发 TODO 文本
  - 来源 backlog: R-077
- [ ] FR-2: 调整测试，避免依赖生产源码中的自触发 TODO

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不降低 review 对真实 TODO 注释的检测能力

## 3. 范围界定

### 包含
- 修改 `src/commands/review.ts` 中的规则说明注释
- 修改相关测试断言
- 运行测试与 DocPath 门禁

### 不包含
- 不新增新的 review 规则
- 不改变 warning/error 判定策略

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-077 与任务 T-20260601-review-todo 建立双向关联
- [ ] AC-3: `docpath review` 报告 0 错误、0 警告、0 提示
- [ ] AC-4: `npm test` 与 `docpath check` 通过

---

*此文件由 `docpath backlog promote` 生成。*
