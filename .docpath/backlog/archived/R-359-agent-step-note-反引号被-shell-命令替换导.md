---
id: R-359
title: agent step --note 反引号被 shell 命令替换导致文字静默消失
status: done
priority: P2
level: 1
source: docpath backlog add
readiness: analyzed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260923-agent-step-note-shell/spec.md
  decision_brief: R-352 去重提示（2026-09-23）：检测到 2 条重复候选，已提示合并/skip；用户放行确认待补 --user-confirmed。
  user_confirmed: null
links:
  task: T-20260923-agent-step-note-shell
  spec: tasks/T-20260923-agent-step-note-shell/spec.md
created_at: 2026-09-23
---

## 背景

由 spec.json 渲染生成。

## 范围

### 包含

- agent 子命令 CLI 选项增加 --stdin / --body-file（复用 src/utils/stdin.ts）
- handleAgentStep / handleAgentEnter / handleAgentDone 在解析 note 时优先采用 stdin/body-file

### 不包含

- 修改 shell 行为（做不到）；修改 note 存储格式

## 验收

- AC-1: 含反引号的 note 经 --stdin 传入后，breadcrumb/plan 中完整保留原文字（不被命令替换）
- AC-2: --note 与 --stdin 同现时后者优先
- AC-3: 现有 --note 单行用法不受影响
