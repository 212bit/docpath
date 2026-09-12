---
id: R-340
title: 生命周期复合命令：引入 step-pass 与 quick-done 减少 Agent 工具调用往返
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
created_at: 2026-09-12
---

## 背景

当前 Agent 执行每一步需要 step done + go next 两次往返；quick 任务收尾需要 check + done 多次交互。引入复合命令可将往返次数减少 50% 以上。

## 验收

支持 docpath step-pass 自动完成当前步骤并启动下一步；支持 quick-done 一键执行 check 与准备提交。
