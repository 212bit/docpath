# T-20260715-check-docs-index - check docs-index stale self-heal

> backlog_id: R-250
> backlog_source: docpath backlog capture

## 1. 背景与动机

`docpath check` 高频输出 `docs-index 可能陈旧`。R-250 现场核实后确认原描述“无修复命令提示”不准确：当前 warning 已提示 `docpath docs scan`，但仍存在真实流程断裂：

- check 自己不重建 docs-index，需要 agent 手动跑 `docpath docs scan`。
- 任务产物更新会频繁让 docs-index 变旧，warning 噪声反复出现。
- warning 与失败项混在 check 输出里，agent 容易忽略。

本任务采用 backlog 倾向的方向 A：`docs scan` 是幂等索引重建，check 检测 stale 时自动刷新；只有自动刷新失败时才保留 warning 和手动修复命令。

## 2. 需求清单

### 功能需求

- [ ] FR-1: `docpath check` 检测 docs-index stale 时自动刷新 `.docpath/docs-index.json` 和人类视图 `.docpath/docs.md`。
- [ ] FR-2: 自动刷新成功后不再输出 `docs-index 可能陈旧` warning，而是输出明确的通过项说明已刷新。
- [ ] FR-3: 自动刷新失败时保留 warning，并继续给出 `docpath docs scan` 手动修复建议。
- [ ] FR-4: `docpath docs scan` CLI 继续保持原有输出行为，索引构建逻辑复用同一 helper，避免 check/docs scan 两套扫描实现漂移。

### 非功能需求

- [ ] NFR-1: 不新增 `check --fix-docs-index` 选项；保持 check 的默认体验自愈。
- [ ] NFR-2: 不改变 docs-index schema。
- [ ] NFR-3: 自动刷新只重建 DocPath 文档索引，不修改任务状态或 lifecycle evidence。

## 3. 范围界定

### 包含

- `src/commands/docs.ts` 中抽取可复用 docs-index refresh helper。
- `src/commands/check/validators.ts` stale 分支自动调用 refresh helper。
- `tests/docs-index.test.mjs` stale 回归测试从“报 warning”更新为“自动刷新且不报 warning”。

### 不包含

- 新增 `--fix-docs-index`。
- 更改 docs-index JSON schema 或文档排序规则。
- 解决所有 docs-index 陈旧来源。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | stale 处理方式 | A 自动刷新 / B 新增 `--fix-docs-index` / C 只强化提示 | A 自动刷新 | `docs scan` 是幂等索引重建，自愈能消除高频 agent 操作断点。 |
| 2 | 实现位置 | 在 check 内重复扫描 / 抽 helper 复用 docs scan | 抽 helper 复用 | 避免 check 与 docs scan 的索引构建逻辑漂移。 |
| 3 | 失败策略 | 自动刷新失败时阻塞 / warning | warning | stale index 是上下文健康问题，不应因刷新失败阻塞无关代码变更。 |

## 4.1 重大变更门禁

### 是否涉及重大变更

- [x] 否
- [ ] 是，需要用户确认

### UI 设计门禁

- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

## 5. 验收标准

- [ ] AC-1: 修改已有非忽略 Markdown 后运行 `docpath check --skip-tests --skip-lint`，自动刷新 docs-index 且不输出 `docs-index 可能陈旧`。
- [ ] AC-2: 新增非忽略 Markdown 后运行 `docpath check --skip-tests --skip-lint`，新文件进入 `.docpath/docs-index.json` 且不输出 stale warning。
- [ ] AC-3: `docpath docs scan` 行为保持兼容，仍能生成 docs-index 和 docs.md。
- [ ] AC-4: 目标测试、typecheck、DocPath check/review 通过，或明确记录非阻塞环境限制。
