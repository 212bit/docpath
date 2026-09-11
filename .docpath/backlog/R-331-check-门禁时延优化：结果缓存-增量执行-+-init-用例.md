---
id: R-331
title: check 门禁时延优化：结果缓存/增量执行 + init 用例 sqlite 竞态隔离（同根）
status: proposed
priority: P1
level: 2
source: docpath backlog capture
readiness: analyzed
evidence:
  brainstorm: null
  analysis: .docpath/backlog/analysis/R-331-analysis.md
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-09-11
---

## 背景

【实测定性 2026-09-11，见 analysis】时延构成：tsc 1.5s + tsup ~1s + node --test 全量套件 51.9s（95%）。sqlite 竞态前提已修正：f75543e（9/10 21:54）已落地 DOCPATH_REGISTRY_DB 进程级隔离，4 个 spawn init 的测试文件全部隔离，今日全量套件 2 次全绿。主交付改为 scope 缓存：代码范围（src/tests/构建配置）digest 与上次绿色 check 一致时复用重 runner 判定，结构门禁照跑，--no-cache 逃逸，fail-safe 到慢不放水。

## 验收

1) tests/check-cache.test.mjs：digest 稳定性三态断言 + e2e（全量绿→docs 变更命中缓存→src 变更回落全量）；2) last-check.json 落 code_scope_digest/cached 字段；3) 未触及 src 的变更二次 check 时延显著下降（对照数字记入任务结果，基线 51.9s）；4) 代码变更路径仍付全量、门禁不放宽；5) 全量套件全绿。
