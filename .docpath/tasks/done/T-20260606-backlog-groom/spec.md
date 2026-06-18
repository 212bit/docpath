# T-20260606-backlog-groom - 实现 backlog groom 需求池健康检查

> backlog_id: R-093
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

DocPath 已支持 backlog add 写入高质量正文，也支持 backlog edit 安全修改既有条目。下一步需要一个面向需求池的健康检查入口，帮助用户和 agent 发现低信息密度条目、状态/链接漂移、索引过期和优先级异常等问题。否则 backlog 虽然可以增改，但长期维护仍依赖人工扫描 markdown。

## 验收

新增 docpath backlog groom 命令，默认只读检查 backlog 健康状况；检查 proposed/accepted 条目是否缺少背景或验收、正文是否仍包含占位内容、active/done 条目是否缺失 task/spec 链接、backlog 索引是否与条目不一致；输出人类可读报告并支持 --agent YAML；发现问题时以非零退出或提供明确修复建议；tests/backlog-command.test.mjs 或独立 backlog-groom 测试覆盖健康通过、缺正文、链接漂移和 agent 输出。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath backlog groom` 默认只读检查 backlog 条目健康状况。
  - 来源 backlog: R-093
- [ ] FR-2: 检查 `proposed/accepted` 条目正文是否包含 `## 背景` 与 `## 验收`，且不只有占位内容。
- [ ] FR-3: 检查 `active/done` 条目是否具备 `links.task` 与 `links.spec`。
- [ ] FR-4: 检查 `.docpath/backlog/backlog.md` 是否存在，并提示可用 `docpath backlog refresh` 修复索引缺失。
- [ ] FR-5: 支持 `--agent` 输出 YAML，包含问题数量、问题列表与修复建议。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 扩展 backlog CLI 注册，加入 `groom` 动作。
- 在 backlog 命令层实现健康检查、报告渲染和 fail-loud 退出。
- 补充命令级测试覆盖健康通过、正文缺失、链接缺失、索引缺失和 agent 输出。

### 不包含
- 不自动修改 backlog 条目。
- 不做复杂优先级分布分析。
- 不验证链接目标文件是否一定存在；本次只检查链接字段是否完整。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | groom 行为 | 自动修复 / 只读报告 | 只读报告 | 避免健康检查命令产生非预期写入 |
| 3 | 索引检查深度 | 全量 diff / 存在性检查 | 存在性检查 | 先提供低风险、稳定的维护信号，避免依赖时间戳造成误报 |

## 5. 验收标准

- [ ] AC-1: 健康 backlog 运行 `docpath backlog groom` 输出通过并以 0 退出。
- [ ] AC-2: proposed/accepted 条目缺背景、缺验收或正文只有占位内容时，`groom` 报告问题并以非 0 退出。
- [ ] AC-3: active/done 条目缺 `task` 或 `spec` 链接时，`groom` 报告问题并给出修复建议。
- [ ] AC-4: 缺少 `.docpath/backlog/backlog.md` 时，`groom` 报告索引缺失并建议 `docpath backlog refresh`。
- [ ] AC-5: `docpath backlog groom --agent` 输出可解析 YAML，包含 `passed`、`issue_count`、`issues`。
- [ ] AC-6: `pnpm test`、`docpath check`、`docpath review` 通过。

---

*此文件由 `docpath backlog promote` 生成。*
