# T-20260606-backlog-edit - 支持 backlog edit 安全修改条目

> backlog_id: R-092
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

当前 backlog 条目已经支持 add/list/accept/plan/promote/done/drop/refresh，但缺少 edit 命令。用户若要修正标题、优先级、复杂度或正文，只能手工编辑 markdown/frontmatter，容易造成 schema 错误、索引漂移或状态机语义不一致。R-091 已让新建条目可以写入高质量正文，下一步需要让既有条目也能通过 CLI 安全维护。

## 验收

docpath backlog edit <id> 支持修改 title、priority、level；支持通过 --background/--acceptance 或 --body-file 更新正文；非法 priority/level、缺失条目、正文来源冲突时 fail-loud；编辑后保留原 id、status、links、created_at 并刷新 backlog 索引；tests/backlog-command.test.mjs 覆盖元数据修改、正文修改、冲突参数和索引刷新。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath backlog edit <id>` 支持修改 `--title`、`--priority`、`--level`。
  - 来源 backlog: R-092
- [ ] FR-2: `docpath backlog edit <id>` 支持通过 `--background` / `--acceptance` 重建标准正文。
- [ ] FR-3: `docpath backlog edit <id>` 支持通过 `--body-file` 替换完整 markdown 正文。
- [ ] FR-4: `--body-file` 与 `--background/--acceptance` 同时出现时 fail-loud。
- [ ] FR-5: 编辑后保留条目的 `id/status/source/links/created_at`，并刷新 backlog 索引。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 扩展 backlog CLI 注册，加入 `edit` 动作和复用现有 add 正文参数。
- 在 backlog 命令层读取现有条目、应用字段变更、校验输入并写回。
- 补充命令级测试覆盖元数据修改、正文修改、冲突参数、缺失条目和索引刷新。

### 不包含
- 不新增交互式编辑器。
- 不改变 backlog 状态机合法转移规则。
- 不重命名已有 backlog 文件 slug；保留现有写入策略。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 编辑写入策略 | 重建文件名 / 保留现有文件名 | 保留现有文件名 | 避免 edit 引入重命名副作用，符合 `writeBacklogItem` 现有策略 |
| 3 | 正文参数复用 | 单独实现 / 复用 add 解析 | 复用 add 正文解析 | 减少 add/edit 行为漂移 |

## 5. 验收标准

- [ ] AC-1: `docpath backlog edit R-001 --title ... --priority P0 --level 1` 能更新对应 frontmatter 并刷新索引。
- [ ] AC-2: `docpath backlog edit R-001 --background ... --acceptance ...` 能替换为标准正文。
- [ ] AC-3: `docpath backlog edit R-001 --body-file body.md` 能替换为文件正文。
- [ ] AC-4: 编辑不存在条目、非法 priority/level、正文来源冲突时命令失败并给出清晰错误。
- [ ] AC-5: 编辑不会修改 `id/status/source/links/created_at`，不会改变状态机语义。
- [ ] AC-6: `pnpm test`、`docpath check`、`docpath review` 通过。

---

*此文件由 `docpath backlog promote` 生成。*
