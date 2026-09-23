---
id: R-360
title: go --step 对未跟踪文件的 dirty guard 报错信息不够明确
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

## 问题\ndocpath go --step <id> 会因未跟踪文件未归属而拒绝，但报错只说 dirty，不提示具体原因和修复动作。\n\n## 期望行为\n报错信息区分「已跟踪文件被修改」与「存在未跟踪新文件」两种情况，后者提示：请先 git add 认领或加入 .gitignore。\n\n## 证据来源\nferrum 项目实操踩坑（2026-09-22）

## 验收

- 待补充
