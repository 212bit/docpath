# T-20260602-task-3 - 评估并清理历史夹具目录

> backlog_id: R-080
> backlog_source: docpath backlog add

## 1. 背景与动机

- 上一轮清理保留了 `e2e-test/` 和 `temp-test/`，因为二者均被 Git 跟踪。
- 复核后发现 `e2e-test/` 有 README、package.json 和完整任务/spec 内容，语义上是手工 E2E 示例项目。
- `temp-test/` 没有 README/package.json，也没有代码或测试引用，更像历史初始化残留，应从仓库中移除。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 删除无引用、无说明文档、无 package.json 的历史临时目录 `temp-test/`。
  - 来源 backlog: R-080
- [ ] FR-2: 保留 `e2e-test/`，并在当前任务记录其作为 E2E 示例项目的保留理由。
- [ ] FR-3: 不改动运行时源码和公开 CLI 行为。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 清理后完整测试和 DocPath 门禁通过。

## 3. 范围界定

### 包含
- 删除 `temp-test/` 跟踪文件。
- 保留 `e2e-test/` 的判断说明。

### 不包含
- 迁移或重构 `e2e-test/`。
- 新增测试框架或 E2E runner。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 夹具清理策略 | 删除无说明临时目录，保留有 README/package 的示例项目 | 采用 | 保持仓库整洁，同时避免误删可用示例资产 |

## 5. 验收标准

- [ ] AC-1: `temp-test/` 不再被 Git 跟踪。
- [ ] AC-2: `e2e-test/` 保留。
- [ ] AC-3: `pnpm test` 通过。
- [ ] AC-4: `docpath check` 通过。

---

*此文件由 `docpath backlog promote` 生成。*
