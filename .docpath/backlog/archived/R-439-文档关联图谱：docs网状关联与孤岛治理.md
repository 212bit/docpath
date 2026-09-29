---
id: R-439
title: 文档关联图谱：docs网状关联与孤岛治理
kind: feature
status: done
priority: P2
level: 2
source: docpath start
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260929-docs/spec.md
  decision_brief: >-
    - 当前问题: docs/ 存在孤岛文档，无任何文档间关联机制；docs/README.md 手工索引漂移

    - 目标: frontmatter related 显式声明 + 索引层 backlink 反推 + 本地推荐 + 半自动 fix，消除孤岛

    - 背景: 2026-09-29 grilling 会话九项决策定案，完整设计见
    `.docpath/tasks/current/wip-note.md`

    - 可选方案:
      - 方案 A: 混合关联（显式 + 本地推荐 + 半自动 fix）— 已采纳
      - 方案 B: 纯自动主题关联（否决：噪音不可控）
      - 方案 C: 集中式 graph 文件存储（否决：第二真源、与索引扫描架构相逆）
    - 推荐方案: 方案 A

    - 决策理由: 零冗余防漂移、零 LLM 依赖、对齐现有 lint/fix 模式

    - 不做什么: 不动 .docpath/ 资产与任务工件；不做 context 自动注入（二期）；不 nag 弱关联；不反写对方文件

    - 成本: 中等（约 300+ 行 + 定向测试）

    - 风险: frontmatter 解析需容错无头文档；index version 升级需保持旧消费方兼容

    - 回滚方案: 回滚本任务提交；docs-index.json 由扫描器重建，无手工真源损失

    - 用户确认: 已确认（2026-09-29 会话中逐项批准方案）
  user_confirmed: 已确认（2026-09-29 会话中逐项批准方案）
links:
  task: T-20260929-docs
  spec: tasks/T-20260929-docs/spec.md
created_at: 2026-09-29
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: docs网状关联
- [x] FR-2: 孤岛治理

## 范围

### 包含

- `docs/**/*.md` frontmatter `related` 解析与 `docs-index.json` related/backlinks 聚合（version 2）
- `docpath docs graph` 子命令：报告 / `--fix` 半自动补链 / `--mermaid` 全景图
- `docs lint` 孤岛检测规则；`docs/README.md` docpath:block 机器索引区重建

### 不包含

- `.docpath/` 资产与任务工件入图
- `reveal`/`context` 关联文档自动注入（二期）
- 弱关联（单向单链）告警（二期）
- LLM 语义推荐

## 验收

- [x] AC-1: docs网状关联 满足功能要求并通过测试
- [x] AC-2: 孤岛治理 满足功能要求并通过测试
- [x] AC-3: 生成的 spec 可直接进入 `docpath plan`
- [x] AC-4: backlog 条目 R-439 与任务 T-20260929-docs 建立双向关联

## 决策证据

- 当前问题: docs/ 存在孤岛文档，无任何文档间关联机制；docs/README.md 手工索引漂移
- 目标: frontmatter related 显式声明 + 索引层 backlink 反推 + 本地推荐 + 半自动 fix，消除孤岛
- 背景: 2026-09-29 grilling 会话九项决策定案，完整设计见 `.docpath/tasks/current/wip-note.md`
- 可选方案:
  - 方案 A: 混合关联（显式 + 本地推荐 + 半自动 fix）— 已采纳
  - 方案 B: 纯自动主题关联（否决：噪音不可控）
  - 方案 C: 集中式 graph 文件存储（否决：第二真源、与索引扫描架构相逆）
- 推荐方案: 方案 A
- 决策理由: 零冗余防漂移、零 LLM 依赖、对齐现有 lint/fix 模式
- 不做什么: 不动 .docpath/ 资产与任务工件；不做 context 自动注入（二期）；不 nag 弱关联；不反写对方文件
- 成本: 中等（约 300+ 行 + 定向测试）
- 风险: frontmatter 解析需容错无头文档；index version 升级需保持旧消费方兼容
- 回滚方案: 回滚本任务提交；docs-index.json 由扫描器重建，无手工真源损失
- 用户确认: 已确认（2026-09-29 会话中逐项批准方案）
