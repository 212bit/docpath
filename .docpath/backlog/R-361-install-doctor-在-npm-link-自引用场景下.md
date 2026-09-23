---
id: R-361
title: install --doctor 在 npm-link 自引用场景下增加漂移说明
status: proposed
priority: P3
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

## 问题\ndocpath 通过 npm-link 指向自身 checkout 时，改模板所有受管项目都报 install-manifest-drift。这是必然复发的结构性约束，不是项目坏了。但 --doctor 输出没有解释这一点。\n\n## 期望行为\n当检测到 docpath 的 npm-link 目标就是当前工作目录时，--doctor/--check-only 的漂移报告末尾追加一行说明：「docpath 通过 npm-link 指向本仓库时，模板修改后的 manifest 漂移为预期行为，请在各受管项目执行 docpath install --force 同步」。\n\n## 证据来源\ndocpath 仓库自身开发流程（2026-09-21 实操确认）

## 验收

- 待补充
