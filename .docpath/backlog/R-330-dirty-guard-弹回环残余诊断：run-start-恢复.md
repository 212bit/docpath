---
id: R-330
title: dirty-guard 弹回环残余诊断：run start 恢复成功后 go 仍连败的成因定性
status: proposed
priority: P1
level: 2
source: docpath backlog capture
readiness: analyzed
evidence:
  brainstorm: null
  analysis: .docpath/backlog/analysis/R-330-analysis.md
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-09-11
---

## 背景

【已定性 2026-09-11，证据链见 analysis】组合成因，主因=恢复链消息缺口：run start --note 只解锁 phase 门（transitions.ts:74 planning→executing），对 untracked 新文件完全无效；buildDirtyWorktreeError 恢复指引只建议 run start、从未提 git add 归属认领。实测链条：go 4 连败（17:15 planning 全拦 ×2 → run start 后 untracked 仍拦 ×2）→ agent git add 后 17:29:30 成功。守卫拦截语义正确（不推翻 R-318/R-249），缺陷在消息层。

## 验收

1) buildDirtyWorktreeError 按 blockedFiles 是否含 untracked 分支输出恢复指引：untracked 场景主建议 git add 认领归属（或收口），仅 tracked 场景保留 run start 建议；2) 扩展 tests/dirty-worktree-guard.test.mjs：断言 untracked 场景消息含 git add 指引、且 active-task 下 untracked 仍被拦截（语义不变）；3) pnpm test 全绿；4) 不放宽守卫拦截语义。
