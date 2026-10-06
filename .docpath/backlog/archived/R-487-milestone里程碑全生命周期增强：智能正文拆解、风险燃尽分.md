---
id: R-487
title: Milestone里程碑全生命周期增强：智能正文拆解、风险燃尽分析、发布简报知识聚合与属性编辑巡检
kind: feature
status: done
priority: P1
level: 2
source: docpath backlog capture
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20261006-milestone/spec.md
  decision_brief: |-
    - 当前问题: 里程碑全生命周期缺乏正文拆解、健康度预测、发布知识聚合与巡检治理工具
    - 推荐方案: 全量增强 decompose、status/track、release、edit 与 doctor 能力
    - 决策理由: 形成从宏观目标规划到发布复盘的完整工程闭环
    - 用户确认: 用户已在对话中明确选定全量完整增强方案
  user_confirmed: 用户已在对话中明确选定全量完整增强方案
links:
  task: T-20261006-milestone
  spec: tasks/T-20261006-milestone/spec.md
created_at: 2026-10-06
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: 增强 `docpath milestone decompose`，支持从正文或结构化输入中一键智能拆解并生成成形 Backlog
- [x] FR-2: 增强 `docpath milestone status / track`，支持截止期健康度预测（On Track/At Risk/Overdue）与里程碑关键阻碍链分析
- [x] FR-3: 增强 `docpath milestone release`，自动聚合关联 Task 的 Decision Brief / ADR 至发布简报，并提供 Git Tag 联动建议
- [x] FR-4: 新增 `docpath milestone edit` 属性编辑与 `docpath milestone doctor` 完整性巡检治理能力

## 范围

### 包含

- `src/engine/milestone.ts` 引擎核心能力扩展（健康度算法、ADR 聚合、doctor 巡检、edit 编辑）
- `src/commands/milestone.ts` & `src/commands/register/` CLI 选项注册与终端渲染
- 关联单元测试与 `docs/features/milestone-lifecycle.md` 文档同步

### 不包含

- 不引入外部大型依赖

## 验收

- [x] AC-1: `docpath milestone decompose` 能从正文或参数智能生成规范化的 Backlog 并完成双向绑定
- [x] AC-2: `docpath milestone status / track` 能准确计算健康度（on_track/at_risk/overdue）并展示 Top Blockers
- [x] AC-3: `docpath milestone release` 能自动聚合 Decision Brief / ADR 并生成包含 Git Tag 建议的发布简报
- [x] AC-4: `docpath milestone edit` 与 `docpath milestone doctor` 运行正常且能诊断断链或异常条目
- [x] AC-5: 单元测试覆盖率达标，活文档 `docs/features/milestone-lifecycle.md` 完成同步更新

## 决策证据

- 当前问题: 里程碑全生命周期缺乏正文拆解、健康度预测、发布知识聚合与巡检治理工具
- 推荐方案: 全量增强 decompose、status/track、release、edit 与 doctor 能力
- 决策理由: 形成从宏观目标规划到发布复盘的完整工程闭环
- 用户确认: 用户已在对话中明确选定全量完整增强方案
