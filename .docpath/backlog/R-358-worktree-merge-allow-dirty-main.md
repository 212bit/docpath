---
id: R-358
title: worktree merge --allow-dirty-main 假提交与语义误导修复
status: proposed
priority: P1
level: 1
source: docpath backlog add
readiness: shaped
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-09-23
---

## 背景

## 问题\n--allow-dirty-main 只跳过工具层重叠预检，底层 git merge 仍因脏文件 abort。但每次都会在源分支上留一条 chore(worktree-merge): merge worktree into main 的提交（内容是自动提交 .docpath/tasks/current/*），而它描述的合并并未发生。\n\n## 复现\n2026-09-22 R-056 收尾，两次尝试（带标志与不带）main 都毫发无损，但源分支多了假提交。\n\n## 期望行为\n方案 A：merge 失败时自动回滚源分支上的假提交；\n方案 B：让 --allow-dirty-main 真正做 stash→merge→pop 完整流程；\n方案 C：改名或加警告明确告知它只跳预检不做 git 层兜底。\n\n## 当前临时处置\n收尾前 git log -1 确认提交是否名副其实；假的就 git reset --mixed HEAD~1 撤掉。\n\n## 证据来源\nferrum 项目 R-056 实操（2026-09-22）

## 验收

- 待补充
