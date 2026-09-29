---
id: R-443
title: "feat(plan): 收敛背景列表过度推断FR陷阱并支持 docpath plan --force 重新生成"
kind: feature
status: done
priority: P1
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260929-feat-plan-fr-docpath-plan-force/spec.md
  decision_brief: |-
    - 当前问题: 实战 R-099 发现执行计划生成与规格推断存在两处体验缺陷：
    - 目标: feat(plan): 收敛背景列表过度推断FR陷阱并支持 docpath plan --force 重新生成
    - 背景: 来自 backlog R-443
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
  task: T-20260929-feat-plan-fr-docpath-plan-force
  spec: tasks/T-20260929-feat-plan-fr-docpath-plan-force/spec.md
created_at: 2026-09-29
---

## 背景

实战 R-099 发现执行计划生成与规格推断存在两处体验缺陷：
1. `extractFunctionalRequirements` 会将 `## 背景` 中的所有 bullet/编号列表误升级为 FR-1..FR-N（甚至包括调研证据与已否决的方案）。
2. 使用 `write-spec` 修正 `spec.json` 后，`docpath plan` 遇到已有 `plan.md` 会静默复用旧计划，且缺少 `--force` 覆盖机制，逼迫用户手写 `write-plan`。

## 验收

- [ ] `extractFunctionalRequirements` 仅从 `## 功能需求` 或显式 FR 列表中提取需求，背景列表不参与 FR fallback（回退为单一需求 FR-1）
- [ ] `docpath plan` 增加 `--force` 选项，强制覆盖已有 `plan.md`
- [ ] 当 `spec.json` 变更时给出提示或自动更新计划
- [ ] 补充对应的单元测试并通过质量门禁
