---
id: R-352
title: DocPath archiving blind spots and duplicate registration patterns
status: proposed
priority: P2
level: 2
source: docpath backlog capture
readiness: analyzed
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
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
