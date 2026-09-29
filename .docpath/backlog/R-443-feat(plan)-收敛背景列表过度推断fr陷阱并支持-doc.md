---
id: R-443
title: "feat(plan): 收敛背景列表过度推断FR陷阱并支持 docpath plan --force 重新生成"
kind: feature
status: proposed
priority: P1
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
