# T-20260713-quick-fix-agent-enter-recommended-command-and-dirty-ch - T-20260713-quick-fix-agent-enter-recommended-command-and-dirty-ch - Fix agent enter recommended command and dirty checks

> workflow_profile: standard
> source: docpath check (auto-upgraded from quick)

## 1. 背景与动机

<!-- 原 quick 任务已自动升级为 standard 流程，需要补全设计文档。 -->

## 2. 需求清单

### 功能需求
- [ ] FR-1: Fix agent enter recommended command and dirty checks

### 非功能需求
- [ ] NFR-1: 待补充

## 3. 范围界定

### 包含
- 待补充

### 不包含
- 待补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 待补充 | | | |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### Decision Brief
- 当前问题: docpath 没能按要求在适当的时机推荐并进入 agent enter，且在 executing 阶段的 dirty 校验未被执行。
- 目标: 修复 next --agent 对 agent enter 的路由推荐，使 agent 必然在执行代码前执行 agent enter，并在 executing 阶段的 enter 命令中增加 worktree 校验。
- 可选方案: 在 formatters 中追加 pendingDone 校验推荐 enter，并完善 agent.ts 的 enter 时期 dirty worktree 检查。
- 推荐方案: 方案 C (实现上述修复且解决测试套件中的 mock drift/sentinel 问题)。
- 用户确认: 用户在对话中确认进入 enter 路由修复。

## 5. 验收标准

- [ ] AC-1: 待补充

---

*此文件由 `docpath check` 在升级 quick→standard 时自动生成。*