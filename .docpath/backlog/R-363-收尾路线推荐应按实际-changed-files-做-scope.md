---
id: R-363
title: 收尾路线推荐应按实际 changed files 做 scope 判定（quick-done 误推）
status: proposed
priority: P2
level: 1
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
created_at: 2026-09-23
---

## 背景

step-pass / next 在任务收尾时输出的「推荐收尾路线」是静态模板：无论本次实际改了什么，都把 `docpath quick-done` 列为「推荐」第一项。但 quick-done 服务于 quick 通道，受 quick-guard 约束（RISKY_PATH_PATTERNS + max_changed_files=3）。当任务实际改了 `src/engine/**`、`src/commands/(agent|check|done|go|journal|review|runtime|register)` 等核心路径时，quick 通道在 done 阶段必拒，用户/Agent 顺着「推荐」走会在收尾时才失败并被迫升级标准生命周期，白绕一圈。

同一次 next 输出内还自相矛盾：推荐块给 quick-done，而 `next_hint.recommended_command` 却是 `docpath agent enter`、`next_action` 写「开始或恢复任务执行」——收口阶段仍挂着执行期提示。

实例（2026-09-23 R-356/R-362 收口）：R-356 改 `src/engine/backlog.ts` + 新增 utils 文件 + 新增测试文件（十余个文件），step-pass 仍推荐 quick-done；实际必须走 check -> review -> journal。用户需反问「为什么没按推荐的 quick-done」才暴露该缺口。

## 验收

1. step-pass / next 输出收尾路线前，基于本次实际 changed files（复用 quick-guard 的 `evaluateQuickScope` / `RISKY_PATH_PATTERNS` 判定）做 scope 分类；
2. 命中 RISKY_PATH_PATTERNS 或 guardedFiles 超 max_changed_files 时，不得把 quick-done 标为「推荐」，应推荐 `check -> review -> agent done`（标准收口）；
3. 仅当改动确实落在 quick 允许范围（scope 判定通过）时，quick-done 才作为推荐项；
4. 收口阶段（所有 plan 步骤已完成）的 next_hint 不应再给 agent enter / 「开始或恢复任务执行」这类执行期提示，应按阶段给出收口命令；
5. 有回归测试覆盖：核心路径改动 -> 推荐不含 quick-done；叶子改动 -> 推荐含 quick-done。
