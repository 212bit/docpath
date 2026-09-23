---
id: R-375
title: Backlog ID 分配增强：结合磁盘最大 ID 防御 counter 回退撞号
status: done
priority: P2
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260923-backlog-id-id-counter/spec.md
  decision_brief: >-
    - 当前问题: 在 nextBacklogId 中将 id-counter 与 scanBacklogMaxId 取 Math.max，杜绝 git
    reset 或分支切换导致的编号回退撞号

    - 目标: Backlog ID 分配增强：结合磁盘最大 ID 防御 counter 回退撞号

    - 背景: 来自 backlog R-375

    - 可选方案:
      - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
      - 方案 B: 补充分析，扩展本任务范围
    - 推荐方案: 方案 A

    - 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险

    - 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围

    - 成本: 中等，按 plan 拆分后逐步验证

    - 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移

    - 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed

    - 用户确认: 待确认
  user_confirmed: 待确认
links:
  task: T-20260923-backlog-id-id-counter
  spec: tasks/T-20260923-backlog-id-id-counter/spec.md
created_at: 2026-09-23
---

## 背景

在 nextBacklogId 中将 id-counter 与 scanBacklogMaxId 取 Math.max，杜绝 git reset 或分支切换导致的编号回退撞号

## 验收

nextBacklogId 始终分配严格递增且不撞号的 ID，全量测试与门禁通过
