---
id: R-352
title: DocPath archiving blind spots and duplicate registration patterns
status: done
priority: P2
level: 2
source: docpath backlog capture
readiness: confirmed
evidence:
  brainstorm: null
  analysis: .docpath/backlog/analysis/R-352-requirements.md
  spec: .docpath/backlog/analysis/R-352-technical.md
  decision_brief: >-
    - 当前问题: DocPath 的归档机制存在盲区：只有 done 条目会被自动归档，dropped 条目没有自动路径，CLI 动作集里也没有
    archive。重复登记已成模式：多会话并行时，一个会话看到别人已合并的成果后，把它当作待办重新走了一遍 backlog → promote →
    plan → done，生成新 ID。

    - 目标: DocPath archiving blind spots and duplicate registration patterns

    - 背景: 来自 backlog R-352

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
  user_confirmed: 用户确认方案B：dropped 自动归档 + 新增 archive 动作 + promote 去重钩子；归档目标
    .docpath/backlog/archived/
links:
  task: T-20260923-docpath-archiving-blind-spots-and-duplic
  spec: tasks/T-20260923-docpath-archiving-blind-spots-and-duplic/spec.md
created_at: 2026-09-23
---

# DocPath archiving blind spots and duplicate registration patterns

## 背景
DocPath 的归档机制存在盲区：只有 done 条目会被自动归档，dropped 条目没有自动路径，CLI 动作集里也没有 archive。重复登记已成模式：多会话并行时，一个会话看到别人已合并的成果后，把它当作待办重新走了一遍 backlog → promote → plan → done，生成新 ID。

## 功能需求
1. 实现 dropped 条目自动归档路径（e.g. .docpath/tasks/done/dropped-YYYYMMDD/）。
2. 添加 CLI archive 动作 `docpath archive <id>`。
3. 在 promote 阶段添加去重逻辑：扫描已存在的同名/同内容任务 ID，提示合并或 skip。

## 验收标准
- dropped 条目归档后在 archive/ 或 done/ 中找到。
- 重复登记时有明确提示并记录证据。
- 门禁检查通过（level 2 maturity）。

## 证据
- 实现：engine/backlog.ts:445 (only done auto-archive)
- 观察：多会话并行导致重复 ID
- 分析：analysis/requirements.md, analysis/technical.md

## 验收
- dropped 条目归档后在 archive/ 或 done/ 中找到。
- 重复登记时有明确提示并记录证据。
