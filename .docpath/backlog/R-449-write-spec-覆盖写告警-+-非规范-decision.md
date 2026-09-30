---
id: R-449
title: write-spec 覆盖写告警 + 非规范 Decision Brief 位置检测
kind: fix
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
created_at: 2026-09-30
---

## 背景

两个实测确认的静默隐患：(1) 覆盖写无反馈——write-spec 走 writeActiveTaskFile 的 writeFile 全量覆盖，实测在任务已推进到 executing 后再次写入，spec.md 被静默换掉，无提示、无备份、不校验与既有 spec 差异，而 plan 仍按旧 spec 生成，产生无感知漂移。(2) ADR 落错位置丢失机器真源——Decision Brief 仅被 structured-docs.ts:212 识别为 `## 4.1 重大变更门禁` 下的 `### Decision Brief`；R-129 第三次写入把 D1-D5 放进自定义的 `## 6. 决策简报`，实测 spec.json 的 decision_brief_markdown 为空串、decision_brief 仅剩兜底默认句。md 视图仍可见 D1-D5，但按协议 md 只是人读视图、agent 消费的是 spec.json，且 renderSpecMarkdownFromDocument 只输出 1/2/3/4/4.1/5 节，自愈重建时 `## 6.` 会整节丢弃。

## 验收

1) 目标 spec.md 已存在且内容不同时，write-spec 打印覆盖告警（覆盖行数 / FR-AC 条目增减）并提示差异，必要时要求 --force 确认；2) 检测到 `## 6. 决策简报`/`## decision_brief` 等非规范 ADR 章节时，提示应置于 `## 4.1 重大变更门禁 > ### Decision Brief`；3) 上述两种情形各有回归测试钉住行为。
