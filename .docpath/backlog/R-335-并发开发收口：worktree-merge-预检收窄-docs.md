---
id: R-335
title: 并发开发收口：worktree merge 预检收窄/docs-index 合并治理/版本漂移防护/聚合视图与 sync
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

R-334 任务期间与另一活跃会话并发实测，并发底座（worktree 隔离/backlog merge-driver/id 单池）已可用，但三个高频卡点：1) worktree merge 硬拒绝任何 dirty main（worktree.ts:1105 rootStatus.length>0 即拒），并发常态 main 常有其他会话 in-flight 文件，预检与 git 自身保护冗余（git merge 本就拒绝覆盖本地改动），实测被迫手动 ff-only；2) docs.md/docs-index.json 机器生成但内嵌扫描时间戳且表行随各树 backlog 快照分叉，两树收口必冲突，.gitattributes merge-driver 不覆盖；3) R-332 版本漂移在并发下放大——全局旧 docpath 静默吞掉 agent_flow 新行为，实测 docpath check 走全局旧版，doctor/next 零提示。次要：无跨树聚合编排视图；main 前进后其他活跃树需手动同步。

## 验收

1) worktree merge：dirty main 仅在合并将触碰的文件与 dirty 有交集时阻塞，其余 warning+文件列表，--allow-dirty-main <reason> 证据旗标（对齐 R-334 --accept-dirty 模式）；2) docs-index.json/docs.md 纳入 merge-driver（take-current + regenerate 标记），生成幂等化（去扫描时间戳或等价稳定化）；3) doctor/next --agent 检测执行二进制非 repo 本地构建时 warning+指引（落实 R-332）；4) worktree list --agent 聚合视图（各树 task/phase/merged/suggested action）+ worktree sync（main 合入所有活跃树）；5) 非 agent_flow/非 worktree 行为不变；全量套件全绿。
