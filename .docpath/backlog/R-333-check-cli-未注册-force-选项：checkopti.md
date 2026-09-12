---
id: R-333
title: check CLI 未注册 --force 选项：CheckOptions.force 存在但传参缺失，用户带 --force 报 Unknown
  option（trace 16:25:48 实测 FAILED 1ms）
status: accepted
priority: P3
level: 2
source: docpath backlog capture
readiness: analyzed
evidence:
  brainstorm: null
  analysis: 复现成立：check 注册块无 --force（59-70 行的 force 属 review
    块），CheckOptions.force(types.ts:33)与 warnWhenOutsideAgentSession
    消费方俱在，警告文案引导的 flag 实测报 Unknown option。修复=注册+hasFlag 兜底透传；契约测试双向锁（带 flag 无
    Unknown+警告压制，不带警告照常）。quick 任务 T-20260912-quick-check-cli-force-r-333 已完成，提交
    e49fe12。
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-09-11
---

## 背景

quality.ts 的 check 注册块缺 --force 选项定义与透传；types.ts 有 force 字段（warnWhenOutsideAgentSession 消费）。check 独立运行时想压制『无活跃 agent 会话』警告无入口。修复：补 option 定义+透传，并补一条 CLI 契约测试。

## 验收

1) docpath check --force 正常执行不报 Unknown option；2) 有测试覆盖该 flag 透传。
