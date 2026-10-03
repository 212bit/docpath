---
id: R-449
title: write-spec 覆盖写告警 + 非规范 Decision Brief 位置检测
kind: fix
status: done
priority: P2
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20261003-write-spec-decision-brief/spec.md
  decision_brief: >-
    - 当前问题: 两个实测确认的静默隐患：(1) 覆盖写无反馈——write-spec 走 writeActiveTaskFile 的 writeFile
    全量覆盖，实测在任务已推进到 executing 后再次写入，spec.md 被静默换掉，无提示、无备份、不校验与既有 spec 差异，而 plan
    仍按旧 spec 生成，产生无感知漂移。(2) ADR 落错位置丢失机器真源——Decision Brief 仅被
    structured-docs.ts:212 识别为 `## 4.1 重大变更门禁` 下的 `### Decision Brief`；R-129
    第三次写入把 D1-D5 放进自定义的 `## 6. 决策简报`，实测 spec.json 的 decision_brief_markdown
    为空串、decision_brief 仅剩兜底默认句。md 视图仍可见 D1-D5，但按协议 md 只是人读视图、agent 消费的是
    spec.json，且 renderSpecMarkdownFromDocument 只输出 1/2/3/4/4.1/5 节，自愈重建时 `## 6.`
    会整节丢弃。

    - 目标: write-spec 覆盖写告警 + 非规范 Decision Brief 位置检测

    - 背景: 来自 backlog R-449

    - 可选方案:
      - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
      - 方案 B: 补充分析，扩展本任务范围
    - 推荐方案: 方案 A

    - 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险

    - 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围

    - 成本: 中等，按 plan 拆分后逐步验证

    - 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移

    - 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed

    - 用户确认: 待确认
  user_confirmed: 待确认
links:
  task: T-20261003-write-spec-decision-brief
  spec: tasks/T-20261003-write-spec-decision-brief/spec.md
created_at: 2026-09-30
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: write-spec 覆盖写告警
- [x] FR-2: 非规范 Decision Brief 位置检测

## 范围

### 包含

- write-spec 覆盖写告警 + 非规范 Decision Brief 位置检测

### 不包含

- 待在后续规划中补充

## 验收

- [x] AC-1: 1) 目标 spec.md 已存在且内容不同时，write-spec 打印覆盖告警（覆盖行数 / FR-AC 条目增减）并提示差异，必要时要求 --force 确认；2) 检测到 `## 6. 决策简报`/`## decision_brief` 等非规范 ADR 章节时，提示应置于 `## 4.1 重大变更门禁 > ### Decision Brief`；3) 上述两种情形各有回归测试钉住行为。
- [x] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [x] AC-3: backlog 条目 R-449 与任务 T-20261003-write-spec-decision-brief 建立双向关联

## 决策证据

- 当前问题: 两个实测确认的静默隐患：(1) 覆盖写无反馈——write-spec 走 writeActiveTaskFile 的 writeFile 全量覆盖，实测在任务已推进到 executing 后再次写入，spec.md 被静默换掉，无提示、无备份、不校验与既有 spec 差异，而 plan 仍按旧 spec 生成，产生无感知漂移。(2) ADR 落错位置丢失机器真源——Decision Brief 仅被 structured-docs.ts:212 识别为 `## 4.1 重大变更门禁` 下的 `### Decision Brief`；R-129 第三次写入把 D1-D5 放进自定义的 `## 6. 决策简报`，实测 spec.json 的 decision_brief_markdown 为空串、decision_brief 仅剩兜底默认句。md 视图仍可见 D1-D5，但按协议 md 只是人读视图、agent 消费的是 spec.json，且 renderSpecMarkdownFromDocument 只输出 1/2/3/4/4.1/5 节，自愈重建时 `## 6.` 会整节丢弃。
- 目标: write-spec 覆盖写告警 + 非规范 Decision Brief 位置检测
- 背景: 来自 backlog R-449
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认
