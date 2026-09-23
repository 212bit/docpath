# T-20260923-worktree-merge-allow-dirty-main - worktree merge --allow-dirty-main 假提交与语义误导修复

> backlog_id: R-358

## 1. 背景与动机

`docpath worktree merge` 的 FR-2 阶段（src/commands/worktree/closeout.ts:99-116）在合并前无条件
`git add -A` 并在源分支上提交所有残余文件，提交信息硬编码为
`chore(worktree-merge): merge worktree into main`。该提交语义上伪装成「合并已完成」，但此时真正的
git merge（FR-3 合 target 入 worktree、FR-7 合回 main）尚未发生或后续失败。当 main 脏导致 FR-7 拒绝
（或 --allow-dirty-main 跳过后底层 git merge 仍因 dirty 失败）时，源分支上已留下一条「merge worktree
into main」的提交，而它描述的合并根本未发生，误导后续 git log 审查。

## 2. 需求清单

### 功能需求
- [x] FR-1: FR-2 自动提交的措辞改为中性，明确只是「合并前残余快照」，不再伪装成「合并已完成」
- [x] FR-2: 提交信息可区分 FR-2 快照与真实的 FR-7 合回提交，避免 git log 误读

### 非功能需求
- [x] NFR-1: 不改变 worktree merge 的合并逻辑、不引入新失败路径

## 3. 范围界定

### 包含
- closeout.ts FR-2 提交信息从 `chore(worktree-merge): merge worktree into ${target}` 改为
  `chore(worktree-merge): snapshot pre-merge residual on ${currentBranch}`（中性、自描述）

### 不包含
- 实现真正的 stash→merge→pop（方案 B，风险大，本期不做）
- merge 失败时自动回滚 FR-2 提交（方案 C，作为后续可选增强）

## 4. 关键决策

| # | 决策 | 结论 | 理由 |
|---|------|------|------|
| 1 | 假提交修复采用方案 | 方案 A（措辞中性） | 最小改动、零风险；措辞不再误导 git log |
| 2 | 是否同时做方案 C 回滚 | 否 | 回滚需记录 merge 前 HEAD 比对，增加复杂度；措辞中性已消除误导 |

## 5. 验收标准

- [x] AC-1: FR-2 自动提交的 message 不再含「merge worktree into」措辞
- [x] AC-2: 真实 FR-7 合回提交的 message 仍保留 `Merge branch '...' into main`（不受影响）
- [x] AC-3: worktree merge 相关测试（若有）不回归
