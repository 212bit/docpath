---
id: R-359
title: agent step --note 反引号被 shell 命令替换导致文字静默消失
status: proposed
priority: P2
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

## 问题\ndocpath agent step --note 的值里如果包含反引号，shell 会将其当作命令替换执行，那段文字静默消失。\n\n## 期望行为\nCLI 层对 --note 参数做转义保护/提示，或在报错信息中明确建议用 --stdin/--body-file 传含特殊字符的多行内容。当前 docpath help 未提及此限制。\n\n## 临时处置\n多行或含特殊字符的 note 一律走 --stdin 或 --body-file，不用 --note 内联。\n\n## 证据来源\nferrum 项目实操踩坑（2026-09-22）

## 验收

- 待补充
