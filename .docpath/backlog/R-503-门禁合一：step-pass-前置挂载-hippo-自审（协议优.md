---
id: R-503
title: 门禁合一：step-pass 前置挂载 Hippo 自审（协议优先、依赖可选）
kind: feature
status: proposed
priority: P1
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: R-352 去重提示（2026-10-21）：检测到 1 条重复候选，已提示合并/skip；用户放行确认待补 --user-confirmed。
  user_confirmed: 用户在 2026-10-21 会话中同意进入 P2 门禁合一
links:
  task: null
  spec: null
created_at: 2026-10-21
---

## 背景

目前 docpath step-pass 只做结构与单测门禁，不检查代码层硬规则；Hippo 的 reviewAgentOutput 已能返回结构化 error 违规，并且 self-review --json 提供了稳定的进程间契约。需要在 step-pass 状态转移前自动比对未提交 git diff 并调用 hippo 自审，命中 error 时拒绝转移；docpath 不得硬依赖 hippo，未接入或缺二进制时静默降级。

## 验收

.hippo/ 存在且找到 hippo 时激活；无改动/未接入/mode=off 时 skipped；passed=false 且 mode=block 时阻断并返回码 1；基础设施异常（超时/非预期退出/输出不可解析）fail-open 为 warn；--skip-hippo-gate 可应急跳过；单测覆盖 8 种路径。
