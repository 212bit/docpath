---
id: R-331
title: check 门禁时延优化：结果缓存/增量执行 + init 用例 sqlite 竞态隔离（同根）
status: proposed
priority: P1
level: 2
source: docpath backlog capture
readiness: raw
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-09-11
---

## 背景

2026-09-11 trace 实测单次 check 46.7s；trace ceremony 显示 quick 任务门禁事件占比 50%（每 2 事件 1 门禁）、standard 27%。关键记忆实证：tests 并发跑时 init 类用例竞态共享 ~/.docpath/projects.sqlite 偶发失败——疑似 check 无法全并发/被迫串行保稳定的根因，两者同根。方向：测试隔离（per-worker 独立临时 DB）、check 结果缓存（未触及 src 跳过全量构建）、验证 check 可安全并发。

## 验收

1) init 类用例并发重复跑 10 次全绿（消除 sqlite 竞态）；2) 未触及 src 的变更触发 check 时时延显著下降（给出前后对照数字）；3) trace ceremony 复测门禁时延占比较 46.7s 基线下降；4) check 门禁拦截能力不弱化（原有失败用例仍失败）。
