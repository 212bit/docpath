# T-20260601-dist - 隔离测试构建产物避免 dist 清理竞争

> backlog_id: R-042
> backlog_source: dogfood: 使用 DocPath 开发 R-039 时发现

## 1. 背景与动机

## 背景

- 全量测试并发运行 CLI 子进程时，`tsup --clean` 可能清理正在被其他测试读取的 `dist/chunk-*.js`。

## 验收

- 全量测试不再因为 `dist/` 构建产物竞争出现 `ERR_MODULE_NOT_FOUND`。
- 测试命令或测试夹具具备稳定的构建产物隔离策略。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 测试流程必须避免在测试运行期间清理共享 `dist/` 产物。
- [ ] FR-2: 项目必须提供稳定的测试构建脚本，供 `pnpm test` 和开发者显式使用。
- [ ] FR-3: 测试命令仍需保证运行前产物已构建，不能依赖陈旧 `dist/`。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不影响发布构建继续使用 clean 构建产物

## 3. 范围界定

### 包含
- 隔离测试构建产物避免 dist 清理竞争
- package scripts 与测试说明
- 覆盖构建脚本行为的回归测试

### 不包含
- 重写所有测试为源码直连模式
- 改变 npm package 发布文件策略

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 测试构建策略 | 共享 clean build / 测试专用 no-clean build | 测试专用 no-clean build | 避免并发清理 dist，同时保留发布构建的干净输出 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-042 与任务 T-20260601-dist 建立双向关联
- [ ] AC-3: `pnpm test` 不再调用会清理 `dist/` 的测试前构建
- [ ] AC-4: 发布构建脚本仍保留 clean 行为
- [ ] AC-5: 完整测试与 `docpath check` 通过

---

*此文件由 `docpath backlog promote` 生成。*
