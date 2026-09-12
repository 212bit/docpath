# T-20260912-worktree-wt-1-wt-5 - worktree 收口与并发协调健壮性优化包（WT-1..WT-5）

> backlog_id: R-344
> backlog_source: docpath backlog add

## 1. 背景与动机

worktree 功能审查（R-344 Decision Brief）发现两个 P1 风险点与三个 P2 一致性问题。隔离策略与生命周期设计合理，本包只修问题，不动架构。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `worktree merge` 在主仓库执行合并失败时执行 `git merge --abort`（或等价恢复），不残留 mid-merge 状态；输出冲突文件列表与处置指引。实现于 `src/commands/worktree/closeout.ts`。
- [ ] FR-2: `backlog promote` 跨 worktree 活跃性扫描遇到 state.json 不可读/损坏时 fail-loud，列出无法验证的工作区；不再静默吞错。实现于 `src/commands/backlog.ts` 的 `assertNotActiveInOtherWorktrees`。
- [ ] FR-3: `worktree sync` 与 `worktree merge` 使用同一合并目标解析逻辑（含 `CODE_MERGE_TARGET`），sync 不再硬编码 main。
- [ ] FR-4: dirty-main 文件列表解析正确处理 rename 条目（`R  old -> new`）与带引号路径，改用 `-z` 或按状态码解析；影响 `closeout.ts` 的重叠判定。
- [ ] FR-5: `mergedToMain`/`safe_to_remove` 诊断基于解析后的合并目标（复用 FR-3 的目标解析）而非主 checkout 当前分支。

### 非功能需求
- [ ] NFR-1: 不改变 worktree 隔离策略与既有命令对外行为（除缺陷修复本身）。
- [ ] NFR-2: WT-2 初版不引入跨 worktree 进程锁（方案 B 推迟）。

## 3. 范围界定

### 包含
- closeout.ts / lifecycle.ts / shared.ts / query.ts / backlog.ts 上述修复
- 对应测试（每项 AC 至少一个用例）
- 顺带清理：本次触碰函数内的死导入与 `process.exit` → 抛错（P3 限定范围）

### 不包含
- 跨 worktree promote 文件锁（方案 B）
- worktree 五模块全面重构（P3 全量清理）

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | WT-2 并发窗口 | fail-loud / 跨进程锁 | fail-loud | 锁设计与死锁风险成本不成比例，真实事故后再议 |
| 2 | WT-4 解析实现 | `-z` / 状态码解析 | 按状态码解析 rename + 引号 | `-z` 需要改动所有 execSync 调用面，状态码解析改动局部 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）

### Decision Brief
- 当前问题: worktree merge 失败残留 mid-merge、promote 跨工作区防重 TOCTOU + 吞错、sync 目标不一致、porcelain 解析脆弱、mergedToMain 诊断失真。
- 目标: WT-1..WT-5 逐项修复并配套测试。
- 背景: R-344 Decision Brief（worktree 功能审查，2026-09-12）。
- 可选方案:
  - 方案 A: 逐项修复，WT-2 只做 fail-loud（采用）
  - 方案 B: promote 引入跨 worktree 文件锁（推迟）
- 推荐方案: 方案 A
- 决策理由: 修复面局部、风险可控；锁方案成本不成比例
- 不做什么: 不动隔离策略；不做 worktree 模块全面重构
- 成本: 低-中；五个局部修复 + 测试
- 风险: merge --abort 在用户已手工解冲突的现场会丢弃解冲突结果 —— abort 前检测 unmerged files 存在且输出明确指引
- 回滚方案: 回滚本任务提交
- 用户确认: 用户于 2026-09-12 会话中审查结论后明确回复"同意"

## 5. 验收标准

- [ ] AC-1: 主仓库 merge 失败时 main 不残留 mid-merge 状态，输出冲突文件与处置指引；有测试。
- [ ] AC-2: 其他 worktree state.json 不可读/损坏时 promote fail-loud 并列出无法验证的工作区；有测试。
- [ ] AC-3: sync 与 merge 使用同一合并目标解析（含 CODE_MERGE_TARGET）。
- [ ] AC-4: dirty 文件解析正确处理 rename 与带引号路径；有测试。
- [ ] AC-5: mergedToMain/safe_to_remove 基于解析后的合并目标；有测试。
- [ ] AC-6: 全量测试通过，docpath check 通过。
