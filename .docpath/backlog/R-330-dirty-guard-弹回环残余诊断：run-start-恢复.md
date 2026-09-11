---
id: R-330
title: dirty-guard 弹回环残余诊断：run start 恢复成功后 go 仍连败的成因定性
status: proposed
priority: P1
level: 2
source: docpath backlog capture
readiness: raw
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-09-11
---

## 背景

前提（R-318 证伪结论，2026-09-07）：执行起始守卫按设计工作、非缺陷，失败消息已内置 run start 恢复命令（+1 命令逃生）。但 2026-09-11 trace 实测（16:56-17:18 段）：17:16:46 run start --step S1 --note 成功后，17:16:46 与 17:18:14 go --step S1 仍连败 2 次，恢复环未收敛。需定性残余弹回成因：(a) agent 侧未采用逃生入口（教育问题，转 R-249 重定位建议的协议约定）；(b) run start 记录恢复意图后 go 语义未解锁（守卫/恢复链缺陷）；(c) R-319 会话隔离失效导致 task_id 误判放大。若为 (b)/(c) 转修复任务。

## 验收

1) 用 trace 复现 17:15-17:18 失败序列并出具成因定性结论（三选一或组合）；2) 若为 agent 教育问题：在本仓库 AGENTS.md 落「被拒先收口/run start 恢复」条款；3) 若为链路缺陷：修复后 trace ceremony 复测该场景弹回为 0；4) 不放宽守卫拦截语义（不推翻 R-318/R-249 结论）。
