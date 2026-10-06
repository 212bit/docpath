---
id: R-486
title: 里程碑与Backlog粒度治理增强：docpath-milestone-planner技能、groom碎片检测与backlog merge命令
kind: feature
status: done
priority: P1
level: 2
source: docpath backlog capture
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20261006-backlog-docpath-milestone-planner-groom-/spec.md
  decision_brief: |-
    - 当前问题: 拆解 Backlog 时容易过度碎片化，缺乏规范引导与一键合并工具
    - 推荐方案: 新增 milestone-planner 技能 + groom 碎片检测 + backlog merge 命令
    - 决策理由: 兼顾前置智能引导、后置巡检发现与便捷合并治理
    - 用户确认: 用户已在对话中明确同意方案
  user_confirmed: 用户已在对话中明确同意方案
links:
  task: T-20261006-backlog-docpath-milestone-planner-groom-
  spec: tasks/T-20261006-backlog-docpath-milestone-planner-groom-/spec.md
created_at: 2026-10-06
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: 提供 `docpath-milestone-planner` Skill，规范里程碑与 Backlog 垂直切片与适度粒度原则
- [x] FR-2: 增强 `docpath backlog groom`，支持检测同一 Milestone 下的碎片化微型 Backlog 异味并给出合并建议
- [x] FR-3: 新增 `docpath backlog merge` 命令行与底层引擎，支持一键将多条微型 Backlog 合并到目标 Backlog 中并自动治理关联

## 范围

### 包含

- `.docpath/skills/docpath-milestone-planner.md` 与安装模板分发
- `src/engine/backlog.ts` / `src/commands/backlog.ts` 中 groom 碎片检测逻辑
- `docpath backlog merge` CLI 注册与引擎实现
- 关联单元测试与活文档同步

### 不包含

- 不修改底层 ID 计数器分配机制

## 验收

- [x] AC-1: `docpath-milestone-planner.md` 包含三层架构标准、自检清单与正反范例
- [x] AC-2: `docpath backlog groom` 能识别同 Milestone 下的数据层/微型技术步骤碎片并输出建议
- [x] AC-3: `docpath backlog merge R-A R-B --target R-A` 能正确合并内容、更新 AC、归档源条目并同步 Milestone
- [x] AC-4: 单元测试覆盖率达标且全部测试通过
- [x] AC-5: 活文档 `docs/features/backlog-lifecycle.md` 完成同步更新

## 决策证据

- 当前问题: 拆解 Backlog 时容易过度碎片化，缺乏规范引导与一键合并工具
- 推荐方案: 新增 milestone-planner 技能 + groom 碎片检测 + backlog merge 命令
- 决策理由: 兼顾前置智能引导、后置巡检发现与便捷合并治理
- 用户确认: 用户已在对话中明确同意方案
