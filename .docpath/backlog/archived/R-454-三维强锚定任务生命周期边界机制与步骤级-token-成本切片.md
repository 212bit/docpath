---
id: R-454
title: 三维强锚定任务生命周期边界机制与步骤级 Token 成本切片
kind: feature
status: done
priority: P1
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260930-token-2/spec.md
  decision_brief: |-
    - 当前问题: 三维强锚定任务生命周期边界机制与步骤级 Token 成本切片
    - 目标: 三维强锚定任务生命周期边界机制与步骤级 Token 成本切片
    - 背景: 来自 backlog R-454
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
  task: T-20260930-token-2
  spec: tasks/T-20260930-token-2/spec.md
created_at: 2026-09-30
---

### 背景与痛点
DocPath 目前判定任务开始与结束主要依赖绝对时间戳与时间窗口（+/-30s）。在多任务紧凑执行、长会话共用或前置闲聊场景下，纯时间切片存在时间窗口抖动（Jitter）与跨任务会话交叉污染的问题。同时，当前只能度量整个任务的宏观消耗，无法清晰透视每个子步骤（S1、S2...）分别消耗了多少 Token 和工具调用。需建立三维强锚定机制（时间戳 + Session/Turn ID + Git Commit 边界）与步骤级 Token 增量切片能力。

### 验收标准
- [ ] AC-1: 实现任务生命周期三维强锚定（在 start/quick 及收口中自动捕获并持久化 session_id、start_turn_id、base_commit 与 head_commit）
- [ ] AC-2: 升级 ZCode 与 Antigravity 遥测探针，优先基于 Session ID 与 Turn 范围精准切片，彻底消除时间窗口噪点
- [ ] AC-3: 实现步骤级（Step-Level）Token 增量切片与记录，在 breadcrumb 与 metrics 中精确追踪 S1/S2 等各步骤的 Token 与工具分布
- [ ] AC-4: 在 `docpath monitor`（全局与 `--current`）中展现生命周期锚点元数据与步骤级 Token 分解看板
- [ ] AC-5: 完成单元测试覆盖并在全量门禁中通过验证
