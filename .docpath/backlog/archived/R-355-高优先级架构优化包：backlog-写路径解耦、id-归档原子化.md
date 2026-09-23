---
id: R-355
title: 高优先级架构优化包：backlog 写路径解耦、id/归档原子化、动作单真源、evidence 存在校验、capture 期去重
status: done
priority: P1
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: .docpath/backlog/analysis/R-355-requirements.md
  spec: .docpath/backlog/analysis/R-355-technical.md
  decision_brief: .docpath/backlog/analysis/R-355-decision-brief.md
  user_confirmed: 会话原话：同意，按照高优先级推进（评审 6 点全量）
links:
  task: T-20260923-backlog-id-evidence-capture
  spec: tasks/T-20260923-backlog-id-evidence-capture/spec.md
created_at: 2026-09-23
---

## 背景

架构评审（会话内基于真实代码取证）识别出 6 个高优先级优化点：1) writeBacklogItem 每次写触发 refreshBacklogIndex 全目录扫描+归档副作用（写放大，O(active+archived)/次）；2) nextBacklogId 依赖本 checkout+主 checkout 共 4 个目录的文件名扫描取 max，跨 checkout 分配无原子性（自认缺口，历史 5 起撞号 R-321/322）；3) 动作名单在 register 描述、无 action 报错、default 报错 ≥3 处硬编码（本次加 archive 实测逐一同步）+ 命令层单文件约1300行混杂校验/编排/渲染/输出；4) promote 成熟度门禁只查 evidence 字段非空、不查引用文件真实存在（悬空引用可满足门禁，readiness 信号失真）；5) 归档 existsSync+rename 存在 TOCTOU 窗口且撞号静默跳过需事后 groom 暴露（同族竞态 R-296）；6) 重复登记在产生时无拦截（3 例实测），去重只在 promote 提示。

## 验收

1) 单条写入成本与 backlog 目录总量无关（写入不隐式触发全量索引重建/归档；索引与归档显式或惰性）；2) id 分配为单一权威源上的原子操作，跨 checkout/并发会话无撞号窗口，成本 O(1)；3) 动作清单单一真源，帮助/校验/报错派生，扩展动作只改一处；命令层按校验/编排/渲染/输出拆分，单文件职责单一；4) evidence 引用必须解析到真实文件，否则 promote 门禁拒绝；5) 归档为原子操作，冲突发生时报错留痕，不依赖事后扫描；6) capture/add 入口即对本 checkout+主 checkout 的 active/archived 做同 id/同标题去重提示，重复在产生时可见。全量测试通过 + docpath check 过门禁。非目标：worktree backlog 快照过期根治（另立项）；同义不同名语义级判重。
