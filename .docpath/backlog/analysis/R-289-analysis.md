# R-289 Analysis — changes-report worktree_isolation 死功能修复

> 来源: R-288 实施中发现（2026-07-26 架构 review 后续），修复方向在 R-288 收口时明确「不顺手修，需契约级语义翻转」。

## 1. 现状与缺陷

1. **重复的死判定**：src/utils/changes-report.ts:152 isDocpathWorktree 与 git-dirty-guard.ts 修复前的实现同源——以「.docpath/backlog 与 .docpath/rules 是 symlink」识别 worktree。R-273 tracked-copy 契约后恒为 false，buildWorktreeIsolationReport（:263）的 active 分支永远走不到，worktree_isolation 整体死功能且无告警。R-288 已在 git-dirty-guard.ts 落地契约无关判定 isLinkedGitWorktree（.git 为 gitdir 指针文件），但该实现是模块私有，changes-report 的副本未同步。
2. **噪音分类语义违反现行契约**：isExpectedWorktreeIsolationNoise（:158-166）把 backlog/、rules/、tasks/done/<id>/spec|plan 归为「隔离噪音、非提交相关」——这是 symlink（live-shared）时代的语义。R-238/R-273 之后这三者是 merge-mediated tracked copy，worktree 内的变更恰恰必须提交并随分支合并回 main；若只修判定复活报告，会反向引导 agent 不提交应合并的 backlog 变更（R-271 家族数据丢失的行为模式）。

## 2. 方案

1. **判定单源**：git-dirty-guard.ts 的 isLinkedGitWorktree 改为 export；changes-report.ts 引用之，删除本地 isSymlink + isDocpathWorktree。全仓库仅保留一份 worktree 判定实现，测试层 grep 断言固化（同 R-286 边界断言模式）。
2. **噪音语义翻转到 R-273 契约**：
   - commit-relevant（merge-mediated，随分支合并）：.docpath/backlog/、.docpath/rules/、.docpath/tasks/done/——从噪音名单移除；
   - noise（isolated 运行时与派生视图）：.docpath/workspace/、.docpath/tasks/current/、.docpath/journal/、.docpath/docs.md。
   - docs-index.json 维持现状（不在旧名单，保持 commit-relevant，与主检出提交惯例一致），不做静默扩面。
3. **契约一致性测试**：真实 git worktree add 场景（沿用 R-288 的 fixture 模式）跑 changes --agent：active=true；tracked backlog 修改与业务源码落在 commit_relevant_files；workspace 运行时落在 expected_noise_files。

## 3. 影响面

- 判定复活后，任何 linked git worktree（不限 DocPath 创建）内 changes --agent 都会出 isolation 报告——在修正后的语义下这是无害且正确的（noise 仅覆盖 isolated 运行时）。
- git-dirty-guard.ts 导出面 +1（isLinkedGitWorktree）；行为无变化（R-288 测试全绿保持）。

## 4. 验收

- AC-1: 全仓库仅存一份 worktree 判定实现（grep 断言 isDocpathWorktree 归零、isLinkedGitWorktree 单一定义），真实 linked worktree 内判定为 true。
- AC-2: worktree 内 changes --agent：backlog/rules/tasks-done 变更列为 commit-relevant，不再归类 isolation noise。
- AC-3: isolated 运行时文件仍归类 noise；现有 changes 测试全绿，新增契约一致性测试。

## 5. 风险与回滚

- 风险：低——死功能复活 + 语义修正，无既有消费方依赖 active=true 分支（恒 false 已久）。
- 回滚：revert 本任务提交即可，报告退回恒 false 现状。
