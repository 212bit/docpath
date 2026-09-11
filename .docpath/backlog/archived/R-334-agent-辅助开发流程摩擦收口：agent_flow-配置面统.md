---
id: R-334
title: agent 辅助开发流程摩擦收口：agent_flow 配置面统一降级
status: done
priority: P1
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260911-agent-agent-flow/spec.md
  decision_brief: >-
    - 当前问题: dogfooding 实测四类流程阻碍（T-20260911 breadcrumb 同轮 check 四红：TypeScript
    编译/重大决策确认/完成度 1-3/上下文预算）：1) 重大变更门禁把 docpath 自身 src/commands|engine|utils
    路径当重大信号（major-change.ts STRATEGIC 路径判定、幅度无关），每个任务都要 Decision Brief 落 spec +
    用户确认；2) 计划 level2+ 固定三段式（plan.ts renderDraftPlan），完成度门禁要求
    doneCount===totalCount 才绿（validators.ts:301），中间态 1/3、2/3 永远红；3) docpath go 被
    dirty worktree 拦截且逃生口隐藏（run start --note），同时 CJK 文件名 C-quoting 导致簿记豁免失效；4)
    evidence 宽 string 到窄 union 类型映射摩擦（R-331 实测一次 check 红）

    - 可选方案:
      - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
      - 方案 B: 补充分析，扩展本任务范围
    - 推荐方案: 方案 A

    - 决策理由: 方案 A 满足 backlog 声明全部验收条件，无额外依赖风险

    - 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围

    - 成本: 中等，按 plan 拆分后逐步验证

    - 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移

    - 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed

    - 用户确认: 2026-09-11 用户经 AskUserQuestion 显式选择「全量落地（推荐）」，按该方向建档执行（R-334
    dogfooding 决策确认）
  user_confirmed: 2026-09-11 用户经 AskUserQuestion 显式选择「全量落地（推荐）」，按该方向建档执行（R-334 dogfooding 决策确认）
links:
  task: T-20260911-agent-agent-flow
  spec: tasks/T-20260911-agent-agent-flow/spec.md
created_at: 2026-09-11
---

## 背景

dogfooding 实测四类流程阻碍（T-20260911 breadcrumb 同轮 check 四红：TypeScript 编译/重大决策确认/完成度 1-3/上下文预算）：1) 重大变更门禁把 docpath 自身 src/commands|engine|utils 路径当重大信号（major-change.ts STRATEGIC 路径判定、幅度无关），每个任务都要 Decision Brief 落 spec + 用户确认；2) 计划 level2+ 固定三段式（plan.ts renderDraftPlan），完成度门禁要求 doneCount===totalCount 才绿（validators.ts:301），中间态 1/3、2/3 永远红；3) docpath go 被 dirty worktree 拦截且逃生口隐藏（run start --note）；4) evidence 宽 string 到窄 union 类型映射摩擦（R-331 实测一次 check 红）。根因：门禁设计前提是用户项目代码为产品面，dogfooding 时 docpath 自身即代码面，路径信号全部误报。

## 验收

agent_flow: true 时：1) major 门禁工作流内部信号降级为咨询（依赖/配置/UI 硬信号保留）；2) 完成度门禁改为已认领步骤全部 done 即绿，agent done 仍强制 100%；3) level≤2 计划默认单步压缩；4) docpath go --accept-dirty <reason> 首等恢复旗标（写 breadcrumb 证据）；5) evidence category/severity 窄化为共享 const union + parse 校验器。非 agent_flow 行为不变；全量套件全绿。
