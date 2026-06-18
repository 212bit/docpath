# T-20260606-backlog-add - 支持 backlog add 写入背景与验收正文

> backlog_id: R-091
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- 当前 `docpath backlog add` 只能接收 `--title/--priority/--level`，正文固定生成空白占位内容。
- 这会把低信息密度需求带入 backlog，后续 `promote` 生成的 spec 也容易退化成骨架内容。
- 需要让创建 backlog 时可以直接写入背景、验收或正文文件，同时保持现有最小命令可用。

## 验收

- `docpath backlog add` 支持通过参数写入背景与验收内容，或支持从文件读取完整正文。
- 未提供正文参数时仍保持现有默认骨架行为，不破坏旧脚本。
- 新增条目的 markdown 正文不再强制只有空白占位内容，`backlog promote` 可复用这些内容生成更完整的 spec。
- `backlog-command` 测试覆盖默认行为、内联正文参数、文件正文读取和索引刷新。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath backlog add` 支持 `--background <text>` 和 `--acceptance <text>`，用于生成标准 `## 背景` / `## 验收` 正文。
  - 来源 backlog: R-091
- [ ] FR-2: `docpath backlog add` 支持 `--body-file <path>`，从 markdown 文件读取完整正文。
- [ ] FR-3: 当 `--body-file` 与 `--background/--acceptance` 同时提供时 fail-loud，避免正文来源冲突。
- [ ] FR-4: 未提供正文相关参数时保持现有默认骨架正文，兼容已有脚本。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 扩展 backlog add CLI 选项注册与参数解析。
- 在 `src/commands/backlog.ts` 中生成内联正文或读取正文文件。
- 为默认正文、内联正文、文件正文和冲突参数补充命令级测试。

### 不包含
- 不新增交互式编辑器。
- 不实现 backlog edit/groom/import。
- 不改变 backlog 状态机和 promote 语义。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 正文输入方式 | 内联参数 / 文件参数 / 交互输入 | 内联参数 + 文件参数 | 兼顾脚本化和较长正文，避免引入交互复杂度 |
| 3 | 冲突参数处理 | 后者覆盖前者 / fail-loud | fail-loud | 保持 DocPath 对歧义输入的严格处理风格 |

## 5. 验收标准

- [ ] AC-1: `docpath backlog add --background ... --acceptance ...` 创建的条目正文包含对应背景和验收内容。
- [ ] AC-2: `docpath backlog add --body-file body.md` 创建的条目正文等于文件内容。
- [ ] AC-3: 同时传入 `--body-file` 与 `--background` 或 `--acceptance` 时命令失败并提示冲突。
- [ ] AC-4: 不传正文参数时仍生成当前默认 `## 背景` / `## 验收` 骨架。
- [ ] AC-5: `tests/backlog-command.test.mjs` 覆盖新增行为，且 `pnpm test`、`docpath check`、`docpath review` 通过。

---

*此文件由 `docpath backlog promote` 生成。*
