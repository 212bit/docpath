---
id: R-358
title: worktree merge --allow-dirty-main 假提交与语义误导修复
status: done
priority: P1
level: 1
source: docpath backlog add
readiness: analyzed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260923-worktree-merge-allow-dirty-main/spec.md
  decision_brief: R-352 去重提示（2026-09-23）：检测到 2 条重复候选，已提示合并/skip；用户放行确认待补 --user-confirmed。
  user_confirmed: null
links:
  task: T-20260923-worktree-merge-allow-dirty-main
  spec: tasks/T-20260923-worktree-merge-allow-dirty-main/spec.md
created_at: 2026-09-23
---

## 背景

由 spec.json 渲染生成。

## 范围

### 包含

- closeout.ts FR-2 提交信息从 `chore(worktree-merge): merge worktree into ${target}` 改为
- `chore(worktree-merge): snapshot pre-merge residual on ${currentBranch}`（中性、自描述）

### 不包含

- 实现真正的 stash→merge→pop（方案 B，风险大，本期不做）
- merge 失败时自动回滚 FR-2 提交（方案 C，作为后续可选增强）

## 验收

- AC-1: FR-2 自动提交的 message 不再含「merge worktree into」措辞
- AC-2: 真实 FR-7 合回提交的 message 仍保留 `Merge branch '...' into main`（不受影响）
- AC-3: worktree merge 相关测试（若有）不回归
