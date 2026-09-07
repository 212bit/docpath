---
id: R-322
title: 解决 5 起历史 backlog id 撞号(active/archived 同 id 不同需求)
status: proposed
priority: P2
level: 2
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
created_at: 2026-09-07
---

## 背景

R-321 取证: R-260/261/262/263/268 在 active 与 archived 各存一条,是同 id 下两条不同需求(不同 title/task),非陈旧副本;根因 R-273 前 worktree 号池 stale 撞号。groom 已加非破坏性检测暴露。本条目负责真正的数据迁移。

## 验收

1) 逐条定权威归属;2) 冲突方重分配唯一 id 或合并,修 links.task/spec 与历史引用;3) 迁移后 groom 无撞号告警;4) 需独立 Decision Brief+用户确认(改 id 牵动引用,非 trivial)。
