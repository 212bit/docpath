---
id: R-336
title: 功能删除与瘦身：docs.md 下线/docs-index 瘦身/惰性配置删除/legacy 清理
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
created_at: 2026-09-11
---

## 背景

审计实证（R-335 后续）：1) docs.md 310KB 人类视图，程序侧唯一消费是 reveal 降级段与 docs list --full 的 cat，全部可从 docs-index.json 派生，另有 git-dirty-guard/changes-report 等四处特判为它存在；2) docs-index.json 1.15MB，867 条中 607 条为 archive（tasks/done+backlog/archived+legacy），content_terms 占 548KB（archive 387KB），topic 搜索对 archive 条目按 task-id/include-archive 走显式读取，全量摘要纯浪费；3) 惰性配置（grep 零消费方）：workflow.auto_brainstorm/auto_subagent/enforce_tdd/enforce_review、paths: 段、default_level（意外发现：level 实际来自 state.json）、project_commands；注意 project: 段（project-registry 消费）与 trace:（trace.ts 正则读取）是活的，保留；4) archive/docs-legacy-20260613.md 101KB + spec-legacy 模板集（6月归档，无引用）+ gc 扫出 11 棵已完成 worktree。

## 验收

1) docs.md 不再生成/不再提交，docs list --full 从索引渲染同一张表，docs add 纯索引操作，reveal 兼容读取残留 docs.md；2) 索引 archive 条目不存 summary/content_terms，live 条目 content_terms 限 16 词，索引体积显著下降（1.15MB→约 600-700KB）；3) 惰性配置字段从类型与 init 写入点删除，用户 config 残留无行为影响（R-275 模式）；4) legacy 归档删除，merged_to_main=true 的 worktree prune（他会在制品树不动）；5) 全量套件全绿。
