# T-20260912-cli-worktree-merge - 自动生成索引合并冲突的 CLI 自动消解（worktree merge 增强）

> backlog_id: R-345
> backlog_source: docpath backlog add

## 1. 背景与动机

R-344 收口时，worktree merge 在 `docs-index.json` / `backlog.md` 上发生内容冲突（双侧均为自动刷新的可再生索引），只能手工解决。这类文件内容可由 CLI 确定性重建，冲突是纯噪音。本任务让 worktree merge 自动消解这类冲突；同时把 R-344 WT-1 的 mid-merge 检测/恢复逻辑推广到同步方向（main→branch）。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 新增共享解析器 `resolveIndexConflicts(cwd, unmergedFiles)`：判定冲突文件是否全部属于可重建索引集合（内置 `.docpath/docs-index.json`、`.docpath/backlog/backlog.md`；config `worktree.auto_resolve_paths:` 可扩展），全部命中时按文件类型调度重建（backlog refresh / docs scan）并返回已消解清单；任一文件不可重建时返回空（all-or-nothing）。
- [ ] FR-2: 收口方向（branch→main）合并冲突时：先尝试 FR-1 自动消解，成功则 `git add` + 完成合并提交并输出审计行；失败则维持 WT-1 abort 恢复路径。
- [ ] FR-3: 同步方向（main→branch）合并冲突时：同样先尝试 FR-1 自动消解（在 worktree 内），成功则完成合并继续流程；不可消解时不再遗留 mid-merge 现场——abort + 明确指引后退出。
- [ ] FR-4: `.docpath/config.yaml` 新增 `worktree.auto_resolve_paths:`（字符串数组，追加可重建路径 glob/路径），风格沿用 risk:/quick: 块。

### 非功能需求
- [ ] NFR-1: 不改变可重建集合之外文件的冲突处理行为（列冲突、指引、保护性恢复）。
- [ ] NFR-2: 索引重建只调用既有 refresh/scan 原语，不重写其语义。

## 3. 范围界定

### 包含
- `src/commands/worktree/closeout.ts` 两个合并环节的冲突处理增强
- `src/commands/worktree/shared.ts` 或独立模块的 resolveIndexConflicts
- `src/types/config.ts` + config 读取扩展
- 集成测试（自动消解成功/不可消解回退/同步方向保护）

### 不包含
- backlog 条目正文等非可再生文件的自动消解
- 索引重建命令语义变更
- 交互式冲突解决 UI

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 可重建判定 | 逐文件 / all-or-nothing | all-or-nothing | 部分消解会留下半完成的合并现场，语义不清 |
| 2 | 同步方向不可消解冲突 | 保留 mid-merge / abort | abort + 指引 | 与 WT-1 哲学一致；mid-merge 会卡死后续所有门禁；重试成本低 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）

### Decision Brief
- 当前问题: 可再生索引的合并冲突消耗人工注意力；同步方向冲突遗留 mid-merge 现场。
- 目标: 冲突全命中可重建集合时自动消解并继续合并；否则干净恢复。
- 背景: R-344 收口实战发现（2026-09-12）。
- 可选方案:
  - 方案 A: 冲突后调度既有 refresh/scan 重建（采用）
  - 方案 B: 合并前预防性重建（两侧先刷新再合并）—— 时序复杂且仍有窗口，不采纳
- 推荐方案: 方案 A
- 决策理由: 冲突是纯噪音时消解是确定的；预防式重建无法根治并发刷新
- 不做什么: 不做非可再生文件的自动消解；不改重建命令语义
- 成本: 低-中；一个共享解析器 + 两个环节接线 + 测试
- 风险: 自动消解可能掩盖真实内容分歧 —— 集合默认仅含两个可再生索引，可审计行始终输出
- 回滚方案: 回滚本任务提交；config 可关闭扩展项
- 用户确认: 用户于 2026-09-12 会话中明确引用改进建议并回复"同意"

## 5. 验收标准

- [ ] AC-1: 构造 docs-index.json / backlog.md 双侧冲突的合并，worktree merge 自动消解并完成合并，输出审计行；有集成测试。
- [ ] AC-2: 冲突含不可重建文件时不自动消解，行为与现状一致；有测试。
- [ ] AC-3: 同步方向（main→branch）冲突同样获得检测/恢复保护（WT-1 逻辑推广）；有测试。
- [ ] AC-4: 全量测试通过，docpath check 通过。
